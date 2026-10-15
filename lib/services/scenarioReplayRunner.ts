import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createMeeting, startMeeting } from "@/lib/services/meetings";
import { submitTranscriptChunk } from "@/lib/services/transcriptAnalysis";
import { generatePreMeetingBrief } from "@/lib/services/setupAnalystService";
import { generatePostMeetingReview } from "@/lib/services/postMeetingReviewService";
import { runRegression } from "@/lib/services/regressionRunner";
import { getScenarioById } from "@/lib/scenarios";
import type {
  ConfidenceLevel,
  Meeting,
  RegressionCheck,
  RegressionRun,
  ScenarioReplayRun,
  ScenarioReplayStatus,
} from "@/lib/types/database";

export interface ScenarioReplayResult {
  replayRun: ScenarioReplayRun;
  meeting: Meeting | null;
  regressionRun: RegressionRun | null;
  checks: RegressionCheck[];
}

function formatReplayTimestamp(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

async function createReplayRunRow(scenarioId: string, chunkCount: number): Promise<ScenarioReplayRun> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("scenario_replay_runs")
    .insert({ scenario_id: scenarioId, chunk_count: chunkCount, status: "running" })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create scenario replay run: ${error?.message}`);
  }
  return data;
}

async function updateReplayRun(
  id: string,
  patch: Partial<
    Pick<
      ScenarioReplayRun,
      "meeting_id" | "regression_run_id" | "status" | "chunks_submitted" | "error_message" | "completed_at"
    >
  >
): Promise<ScenarioReplayRun> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("scenario_replay_runs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update scenario replay run: ${error?.message}`);
  }
  return data;
}

export async function getScenarioReplayRun(id: string): Promise<ScenarioReplayRun | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("scenario_replay_runs").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`Failed to load scenario replay run: ${error.message}`);
  }
  return data;
}

export async function getRecentScenarioReplayRuns(limit = 20): Promise<ScenarioReplayRun[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("scenario_replay_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to load scenario replay runs: ${error.message}`);
  }
  return data ?? [];
}

/** A step that's helpful but isn't the pipeline under test (brief/review generation) - its own failure should never abort the replay. */
async function bestEffort(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn(`[scenario-replay] ${label} failed (non-fatal): ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Sprint 17: creates a fresh meeting from a scenario fixture and drives
 * it through the exact same app pipeline a human facilitator would -
 * create meeting, optional brief, start meeting, submit every transcript
 * chunk sequentially through submitTranscriptChunk (the same function
 * manual entry uses - source_type "manual", full transcriptAnalysis
 * pipeline awaited before the next chunk), optional post-meeting review,
 * then Sprint 16's runRegression. No direct writes to workflow/process
 * tables, no mocked AI output, no separate reasoning path - this is
 * automation of *using the app*, not a fake evaluation shortcut.
 *
 * Only throws when the scenario id itself doesn't resolve to a fixture
 * (nothing to attach a row to). Every other failure - meeting creation,
 * a chunk submission, regression itself - is caught, recorded on the
 * already-created scenario_replay_runs row (status "failed",
 * error_message set), and returned rather than thrown, so a failed
 * replay is still a saved, inspectable result instead of an orphaned
 * partial state.
 */
export async function replayScenario(
  scenarioId: string,
  options: { generateReview?: boolean } = {}
): Promise<ScenarioReplayResult> {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario id "${scenarioId}" - no matching fixture in lib/scenarios/`);
  }

  let replayRun = await createReplayRunRow(scenario.id, scenario.transcriptChunks.length);
  let meeting: Meeting | null = null;
  let regressionRun: RegressionRun | null = null;
  let checks: RegressionCheck[] = [];

  try {
    const setup = scenario.meetingSetup;
    const { meeting: createdMeeting } = await createMeeting({
      name: `${setup.meetingName} (Replay ${formatReplayTimestamp()})`,
      meetingType: setup.meetingType,
      discoveryStrategy: setup.discoveryStrategy,
      goal: setup.goal,
      currentUnderstanding: setup.currentUnderstanding,
      tentativeBuildDirection: setup.tentativeBuildDirection,
      risksUnknowns: setup.risks,
      // Same mapping app/meetings/new/page.tsx's own scenario loader uses -
      // every loaded assumption starts at "unclear" confidence.
      assumptions: setup.assumptions.map((text) => ({ text, confidenceLevel: "unclear" as ConfidenceLevel })),
      pastedContext: setup.pastedContext || undefined,
      scenarioId: scenario.id,
    });
    meeting = createdMeeting;
    replayRun = await updateReplayRun(replayRun.id, { meeting_id: meeting.id });

    // Best-effort, not the pipeline under test.
    await bestEffort("pre-meeting brief generation", () => generatePreMeetingBrief(meeting!.id));

    await startMeeting(meeting.id);

    let chunksSubmitted = 0;
    for (const chunk of scenario.transcriptChunks) {
      await submitTranscriptChunk(meeting.id, chunk.text);
      chunksSubmitted += 1;
      replayRun = await updateReplayRun(replayRun.id, { chunks_submitted: chunksSubmitted });
    }

    if (options.generateReview) {
      await bestEffort("post-meeting review generation", () => generatePostMeetingReview(meeting!.id));
    }

    const regressionResult = await runRegression(meeting.id);
    regressionRun = regressionResult.run;
    checks = regressionResult.checks;

    replayRun = await updateReplayRun(replayRun.id, {
      status: "completed",
      regression_run_id: regressionRun.id,
      completed_at: new Date().toISOString(),
    });

    return { replayRun, meeting, regressionRun, checks };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scenario replay failed";
    const status: ScenarioReplayStatus = "failed";
    replayRun = await updateReplayRun(replayRun.id, {
      status,
      error_message: message,
      completed_at: new Date().toISOString(),
    });
    return { replayRun, meeting, regressionRun, checks };
  }
}

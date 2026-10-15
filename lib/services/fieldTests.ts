import { computeFieldTestSummary } from "@/lib/fieldTestSummary";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  FieldTest,
  FieldTestStatus,
  FieldTestSuccessDecision,
  HudDistractionLevel,
  ManualNotesNeededLevel,
  RemoteCaptureSetup,
} from "@/lib/types/database";

/**
 * Sprint 28: same "row or sensible defaults" shape used across the app for
 * one-per-meeting state (see lib/services/pilotReadiness.ts's
 * PilotReadiness) - callers never need to null-check before reading a
 * field. `id`/`created_at`/`updated_at` are null until a row has actually
 * been saved.
 */
export type FieldTestView = Omit<FieldTest, "id" | "created_at" | "updated_at"> & {
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Exported so pages can fall back to this directly if `getFieldTestForMeeting`
 * itself throws (e.g. the migration hasn't been applied yet) - same
 * "never let a non-essential data source fail the whole page" pattern as
 * pilotReadiness.ts's defaultPilotReadiness and app/regression/page.tsx's
 * recentRunsError handling.
 */
export function defaultFieldTest(meetingId: string): FieldTestView {
  return {
    id: null,
    meeting_id: meetingId,
    status: "planned",
    test_context: null,
    selected_scenario_reference: null,
    facilitator_goal: null,
    participant_disclosure_used: false,
    live_capture_used: false,
    manual_transcript_used: false,
    observer_notes: null,
    facilitator_notes: null,
    debrief_notes: null,
    helped_ask_better_questions: null,
    reduced_missed_followups: null,
    improved_workflow_understanding: null,
    stayed_non_distracting: null,
    evidence_trustworthy: null,
    applied_ai_judgment_useful: null,
    overall_usefulness: null,
    success_decision: null,
    next_iteration_notes: null,
    remote_audio_clarity_score: null,
    user_voice_balance_score: null,
    transcript_usefulness_score: null,
    manual_notes_needed: null,
    hud_distraction_level: null,
    capture_setup_used: null,
    created_at: null,
    updated_at: null,
  };
}

async function getFieldTestRow(meetingId: string): Promise<FieldTest | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("field_tests")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load field test: ${error.message}`);
  }

  return data;
}

/** Returns the meeting's field-test state, or sensible defaults if nothing has been saved yet. */
export async function getFieldTestForMeeting(meetingId: string): Promise<FieldTestView> {
  const row = await getFieldTestRow(meetingId);
  return row ?? defaultFieldTest(meetingId);
}

export interface UpsertFieldTestInput {
  status?: FieldTestStatus;
  testContext?: string | null;
  selectedScenarioReference?: string | null;
  facilitatorGoal?: string | null;
  participantDisclosureUsed?: boolean;
  liveCaptureUsed?: boolean;
  manualTranscriptUsed?: boolean;
  observerNotes?: string | null;
  facilitatorNotes?: string | null;
  debriefNotes?: string | null;
  helpedAskBetterQuestions?: number | null;
  reducedMissedFollowups?: number | null;
  improvedWorkflowUnderstanding?: number | null;
  stayedNonDistracting?: number | null;
  evidenceTrustworthy?: number | null;
  appliedAiJudgmentUseful?: number | null;
  overallUsefulness?: number | null;
  successDecision?: FieldTestSuccessDecision | null;
  nextIterationNotes?: string | null;
  remoteAudioClarityScore?: number | null;
  userVoiceBalanceScore?: number | null;
  transcriptUsefulnessScore?: number | null;
  manualNotesNeeded?: ManualNotesNeededLevel | null;
  hudDistractionLevel?: HudDistractionLevel | null;
  captureSetupUsed?: RemoteCaptureSetup | null;
}

/** Creates the meeting's field-test row if it doesn't exist yet, otherwise updates only the fields provided. */
export async function upsertFieldTestForMeeting(
  meetingId: string,
  payload: UpsertFieldTestInput
): Promise<FieldTest> {
  const supabase = await createServerSupabaseClient();
  const existing = await getFieldTestRow(meetingId);

  const fields: Partial<Omit<FieldTest, "id" | "meeting_id" | "created_at" | "updated_at">> = {};
  if (payload.status !== undefined) fields.status = payload.status;
  if (payload.testContext !== undefined) fields.test_context = payload.testContext;
  if (payload.selectedScenarioReference !== undefined) {
    fields.selected_scenario_reference = payload.selectedScenarioReference;
  }
  if (payload.facilitatorGoal !== undefined) fields.facilitator_goal = payload.facilitatorGoal;
  if (payload.participantDisclosureUsed !== undefined) {
    fields.participant_disclosure_used = payload.participantDisclosureUsed;
  }
  if (payload.liveCaptureUsed !== undefined) fields.live_capture_used = payload.liveCaptureUsed;
  if (payload.manualTranscriptUsed !== undefined) fields.manual_transcript_used = payload.manualTranscriptUsed;
  if (payload.observerNotes !== undefined) fields.observer_notes = payload.observerNotes;
  if (payload.facilitatorNotes !== undefined) fields.facilitator_notes = payload.facilitatorNotes;
  if (payload.debriefNotes !== undefined) fields.debrief_notes = payload.debriefNotes;
  if (payload.helpedAskBetterQuestions !== undefined) {
    fields.helped_ask_better_questions = payload.helpedAskBetterQuestions;
  }
  if (payload.reducedMissedFollowups !== undefined) {
    fields.reduced_missed_followups = payload.reducedMissedFollowups;
  }
  if (payload.improvedWorkflowUnderstanding !== undefined) {
    fields.improved_workflow_understanding = payload.improvedWorkflowUnderstanding;
  }
  if (payload.stayedNonDistracting !== undefined) fields.stayed_non_distracting = payload.stayedNonDistracting;
  if (payload.evidenceTrustworthy !== undefined) fields.evidence_trustworthy = payload.evidenceTrustworthy;
  if (payload.appliedAiJudgmentUseful !== undefined) {
    fields.applied_ai_judgment_useful = payload.appliedAiJudgmentUseful;
  }
  if (payload.overallUsefulness !== undefined) fields.overall_usefulness = payload.overallUsefulness;
  if (payload.successDecision !== undefined) fields.success_decision = payload.successDecision;
  if (payload.nextIterationNotes !== undefined) fields.next_iteration_notes = payload.nextIterationNotes;
  if (payload.remoteAudioClarityScore !== undefined) {
    fields.remote_audio_clarity_score = payload.remoteAudioClarityScore;
  }
  if (payload.userVoiceBalanceScore !== undefined) {
    fields.user_voice_balance_score = payload.userVoiceBalanceScore;
  }
  if (payload.transcriptUsefulnessScore !== undefined) {
    fields.transcript_usefulness_score = payload.transcriptUsefulnessScore;
  }
  if (payload.manualNotesNeeded !== undefined) fields.manual_notes_needed = payload.manualNotesNeeded;
  if (payload.hudDistractionLevel !== undefined) fields.hud_distraction_level = payload.hudDistractionLevel;
  if (payload.captureSetupUsed !== undefined) fields.capture_setup_used = payload.captureSetupUsed;

  if (existing) {
    const { data, error } = await supabase
      .from("field_tests")
      .update(fields)
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update field test: ${error?.message}`);
    }
    return data;
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    throw new Error(`Failed to load meeting: ${meetingError.message}`);
  }
  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const { data, error } = await supabase
    .from("field_tests")
    .insert({ meeting_id: meetingId, ...fields })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create field test: ${error?.message}`);
  }
  return data;
}

export interface FieldTestFilters {
  status?: FieldTestStatus;
  successDecision?: FieldTestSuccessDecision;
}

/** Every field_tests row matching the given filters, newest-updated first - used by the /pilot dashboard and GET /api/field-tests. No filter means every row. */
export async function listFieldTests(filters: FieldTestFilters = {}): Promise<FieldTest[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("field_tests").select("*");

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.successDecision) query = query.eq("success_decision", filters.successDecision);

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load field tests: ${error.message}`);
  return data ?? [];
}

export interface FieldTestDashboardSummary {
  totalCount: number;
  completedCount: number;
  strongSignalCount: number;
  mixedOrWeakSignalCount: number;
  /** Null if no field test has any score recorded yet. */
  avgOverallUsefulness: number | null;
  needingNextIterationCount: number;
  /** Sprint 32: field tests with a capture setup recorded - i.e. a remote call was actually scored for capture quality. */
  remoteTestsCompletedCount: number;
  /** Sprint 32: null if no field test has a transcript-usefulness score recorded yet. */
  avgTranscriptUsefulness: number | null;
  /** Sprint 32: field tests where manual_notes_needed is "high". */
  highManualNotesNeedCount: number;
  /** Sprint 32: how many field tests used each capture setup - only setups that actually appear are included. */
  captureSetupsUsed: Partial<Record<RemoteCaptureSetup, number>>;
}

/**
 * A field_tests row with its meeting's name joined in for display - not a
 * foreign-key join, just a batched second query (same convention as
 * PilotIssueSummary in lib/services/pilotDashboard.ts). Field tests are
 * deliberately orthogonal to meeting_pilot_notes.pilot_mode (a field test
 * can exist on a meeting that was never marked pilot mode), so this can't
 * reuse the pilot dashboard's own pilot-mode-scoped meeting list - it
 * needs its own name lookup.
 */
export interface FieldTestWithMeetingName extends FieldTest {
  meetingName: string;
}

/** Sprint 28 Part E: aggregate field-test counts for the /pilot dashboard - deliberately small, no charts, no per-question breakdowns. */
export async function getFieldTestDashboardSummary(): Promise<{
  fieldTests: FieldTestWithMeetingName[];
  summary: FieldTestDashboardSummary;
}> {
  const rows = await listFieldTests();

  const meetingIds = Array.from(new Set(rows.map((f) => f.meeting_id)));
  let namesByMeetingId = new Map<string, string>();
  if (meetingIds.length > 0) {
    const supabase = await createServerSupabaseClient();
    const { data: meetings, error } = await supabase.from("meetings").select("id, name").in("id", meetingIds);
    if (error) {
      throw new Error(`Failed to load meeting names for field tests: ${error.message}`);
    }
    namesByMeetingId = new Map((meetings ?? []).map((m) => [m.id, m.name]));
  }

  const fieldTests: FieldTestWithMeetingName[] = rows.map((row) => ({
    ...row,
    meetingName: namesByMeetingId.get(row.meeting_id) ?? "Unknown meeting",
  }));

  const completed = fieldTests.filter((f) => f.status === "completed");
  const strongSignalCount = fieldTests.filter((f) => f.success_decision === "strong_signal").length;
  const mixedOrWeakSignalCount = fieldTests.filter(
    (f) => f.success_decision === "mixed_signal" || f.success_decision === "weak_signal"
  ).length;
  const overallScores = fieldTests
    .map((f) => f.overall_usefulness)
    .filter((v): v is number => v !== null);
  const avgOverallUsefulness =
    overallScores.length > 0 ? overallScores.reduce((sum, v) => sum + v, 0) / overallScores.length : null;
  const needingNextIterationCount = fieldTests.filter((f) => computeFieldTestSummary(f).needsNextIteration).length;

  // Sprint 32: capture-quality summary - deliberately small (see Part G:
  // "do not overbuild"), only computed from whichever field tests
  // actually recorded a capture setup/score.
  const remoteTestsCompletedCount = fieldTests.filter((f) => f.capture_setup_used !== null).length;
  const transcriptUsefulnessScores = fieldTests
    .map((f) => f.transcript_usefulness_score)
    .filter((v): v is number => v !== null);
  const avgTranscriptUsefulness =
    transcriptUsefulnessScores.length > 0
      ? transcriptUsefulnessScores.reduce((sum, v) => sum + v, 0) / transcriptUsefulnessScores.length
      : null;
  const highManualNotesNeedCount = fieldTests.filter((f) => f.manual_notes_needed === "high").length;
  const captureSetupsUsed: Partial<Record<RemoteCaptureSetup, number>> = {};
  for (const f of fieldTests) {
    if (!f.capture_setup_used) continue;
    captureSetupsUsed[f.capture_setup_used] = (captureSetupsUsed[f.capture_setup_used] ?? 0) + 1;
  }

  return {
    fieldTests,
    summary: {
      totalCount: fieldTests.length,
      completedCount: completed.length,
      strongSignalCount,
      mixedOrWeakSignalCount,
      avgOverallUsefulness,
      needingNextIterationCount,
      remoteTestsCompletedCount,
      avgTranscriptUsefulness,
      highManualNotesNeedCount,
      captureSetupsUsed,
    },
  };
}

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CATEGORY_SCORE_COLUMN, type EvaluationCategory } from "@/lib/evaluationRubric";
import type { EvaluationItem, EvaluationRun } from "@/lib/types/database";

export interface EvaluationItemInput {
  category: string;
  label: string;
  /** null means "skipped / not applicable" - excluded from score computation. */
  passed: boolean | null;
  notes?: string | null;
}

export interface SaveEvaluationInput {
  scenarioName?: string | null;
  items: EvaluationItemInput[];
  notes?: string | null;
}

export interface EvaluationRunView {
  run: EvaluationRun;
  items: EvaluationItem[];
}

function scoreFromPassRate(items: EvaluationItemInput[]): number | null {
  const answered = items.filter((i) => i.passed !== null);
  if (answered.length === 0) return null;
  const passedCount = answered.filter((i) => i.passed).length;
  return Math.round((passedCount / answered.length) * 5 * 10) / 10;
}

/**
 * Rolls per-item pass/fail up into the seven evaluation_runs score columns
 * (six per-category + overall) - deterministic, not model-judged, since
 * this is a human-filled manual scorecard (evaluator_type "manual").
 */
function computeScores(items: EvaluationItemInput[]) {
  const categoryScores: Record<string, number | null> = {};
  for (const [category, column] of Object.entries(CATEGORY_SCORE_COLUMN)) {
    if (!column) continue;
    categoryScores[column] = scoreFromPassRate(
      items.filter((i) => i.category === (category as EvaluationCategory))
    );
  }

  return {
    ...categoryScores,
    overall_score: scoreFromPassRate(items),
  };
}

/**
 * Always inserts a new run - like createPostMeetingReview, re-saving the
 * scorecard is never an update, so evaluation history is preserved and the
 * page just shows the latest by created_at.
 */
export async function saveEvaluationRun(
  meetingId: string,
  input: SaveEvaluationInput
): Promise<EvaluationRunView> {
  const supabase = await createServerSupabaseClient();
  const scores = computeScores(input.items);

  const { data: run, error: runError } = await supabase
    .from("evaluation_runs")
    .insert({
      meeting_id: meetingId,
      scenario_name: input.scenarioName ?? null,
      evaluator_type: "manual",
      notes: input.notes ?? null,
      ...scores,
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to save evaluation run: ${runError?.message}`);
  }

  let items: EvaluationItem[] = [];
  if (input.items.length > 0) {
    const { data, error: itemsError } = await supabase
      .from("evaluation_items")
      .insert(
        input.items.map((item) => ({
          evaluation_run_id: run.id,
          category: item.category,
          label: item.label,
          passed: item.passed,
          notes: item.notes ?? null,
        }))
      )
      .select();

    if (itemsError) {
      throw new Error(`Failed to save evaluation items: ${itemsError.message}`);
    }
    items = data ?? [];
  }

  return { run, items };
}

export async function getLatestEvaluationRun(meetingId: string): Promise<EvaluationRunView | null> {
  const supabase = await createServerSupabaseClient();
  const { data: run, error: runError } = await supabase
    .from("evaluation_runs")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load evaluation run: ${runError.message}`);
  }
  if (!run) return null;

  const { data: items, error: itemsError } = await supabase
    .from("evaluation_items")
    .select("*")
    .eq("evaluation_run_id", run.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to load evaluation items: ${itemsError.message}`);
  }

  return { run, items: items ?? [] };
}

/** Latest evaluation_run per meeting, for the dashboard's optional score column - one query for all meetings rather than N+1. */
export async function getLatestEvaluationScores(
  meetingIds: string[]
): Promise<Map<string, EvaluationRun>> {
  if (meetingIds.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("evaluation_runs")
    .select("*")
    .in("meeting_id", meetingIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load evaluation runs: ${error.message}`);
  }

  const latestByMeeting = new Map<string, EvaluationRun>();
  for (const run of data ?? []) {
    if (!latestByMeeting.has(run.meeting_id)) {
      latestByMeeting.set(run.meeting_id, run);
    }
  }
  return latestByMeeting;
}

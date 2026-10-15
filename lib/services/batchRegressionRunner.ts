import { createServerSupabaseClient } from "@/lib/supabase/server";
import { replayScenario } from "@/lib/services/scenarioReplayRunner";
import { SCENARIOS, getScenarioById } from "@/lib/scenarios";
import type { BatchRegressionRun, BatchRegressionRunItem, BatchRegressionRunStatus } from "@/lib/types/database";

export interface RunBatchRegressionOptions {
  /** Omit or empty for "all scenario fixtures". */
  scenarioIds?: string[];
  generateReview?: boolean;
  /** Default false - a failed scenario still lets the rest run (batch ends "partial"). */
  stopOnFailure?: boolean;
}

export interface BatchRegressionRunResult {
  batchRun: BatchRegressionRun;
  items: BatchRegressionRunItem[];
}

async function createBatchRun(scenarioCount: number): Promise<BatchRegressionRun> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batch_regression_runs")
    .insert({ status: "running", scenario_count: scenarioCount })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create batch regression run: ${error?.message}`);
  }
  return data;
}

async function updateBatchRun(
  id: string,
  patch: Partial<Omit<BatchRegressionRun, "id" | "created_at" | "updated_at">>
): Promise<BatchRegressionRun> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batch_regression_runs")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to update batch regression run: ${error?.message}`);
  }
  return data;
}

async function createBatchItems(batchRunId: string, scenarioIds: string[]): Promise<BatchRegressionRunItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batch_regression_run_items")
    .insert(scenarioIds.map((scenarioId) => ({ batch_run_id: batchRunId, scenario_id: scenarioId })))
    .select();
  if (error || !data) {
    throw new Error(`Failed to create batch regression run items: ${error?.message}`);
  }
  // Preserve the requested scenario order - insert-with-select doesn't guarantee row order back.
  return scenarioIds.map((id) => data.find((row) => row.scenario_id === id)!);
}

async function updateBatchItem(
  id: string,
  patch: Partial<Omit<BatchRegressionRunItem, "id" | "batch_run_id" | "scenario_id" | "created_at" | "updated_at">>
): Promise<BatchRegressionRunItem> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batch_regression_run_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to update batch regression run item: ${error?.message}`);
  }
  return data;
}

export async function getBatchRegressionRun(
  id: string
): Promise<{ batchRun: BatchRegressionRun; items: BatchRegressionRunItem[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: batchRun, error: batchRunError } = await supabase
    .from("batch_regression_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (batchRunError) {
    throw new Error(`Failed to load batch regression run: ${batchRunError.message}`);
  }
  if (!batchRun) return null;

  const { data: items, error: itemsError } = await supabase
    .from("batch_regression_run_items")
    .select("*")
    .eq("batch_run_id", id)
    .order("created_at", { ascending: true });
  if (itemsError) {
    throw new Error(`Failed to load batch regression run items: ${itemsError.message}`);
  }

  return { batchRun, items: items ?? [] };
}

export async function getRecentBatchRegressionRuns(limit = 20): Promise<BatchRegressionRun[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batch_regression_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to load batch regression runs: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Sprint 22: runs multiple scenario fixtures sequentially through the
 * exact same `replayScenario` (Sprint 17) / `runRegression` (Sprint 16)
 * pipeline a single replay already uses - this file only orchestrates
 * and aggregates, it never re-implements replay or regression logic, and
 * never bypasses either. Sequential on purpose (v1 scope) to avoid
 * hammering the OpenAI API / database with concurrent real calls.
 *
 * An item's "failed" status means the replay pipeline itself broke
 * (couldn't create the meeting, a chunk submission threw, regression
 * itself errored) - never that the regression's own checks came back
 * "fail". A completed replay whose regression run has fail checks in it
 * is still a "completed" item; those fail counts flow into the batch's
 * aggregate totals same as any other check result. This mirrors
 * `scenario_replay_runs.status` from Sprint 17 exactly.
 */
export async function runBatchRegression(
  options: RunBatchRegressionOptions = {}
): Promise<BatchRegressionRunResult> {
  const scenarioIds =
    options.scenarioIds && options.scenarioIds.length > 0
      ? options.scenarioIds
      : SCENARIOS.map((s) => s.id);

  for (const id of scenarioIds) {
    if (!getScenarioById(id)) {
      throw new Error(`Unknown scenario id "${id}" - no matching fixture in lib/scenarios/`);
    }
  }

  let batchRun = await createBatchRun(scenarioIds.length);
  const items = await createBatchItems(batchRun.id, scenarioIds);

  let completedCount = 0;
  let failedCount = 0;
  let totalChecks = 0;
  let totalPass = 0;
  let totalWarn = 0;
  let totalFail = 0;
  let stoppedEarly = false;
  let lastError: string | null = null;

  for (let i = 0; i < items.length; i++) {
    if (stoppedEarly) break;

    const item = items[i];
    items[i] = await updateBatchItem(item.id, {
      status: "running",
      started_at: new Date().toISOString(),
    });

    try {
      const result = await replayScenario(item.scenario_id, {
        generateReview: options.generateReview,
      });
      const pass = result.checks.filter((c) => c.result === "pass").length;
      const warn = result.checks.filter((c) => c.result === "warn").length;
      const fail = result.checks.filter((c) => c.result === "fail").length;
      const itemFailed = result.replayRun.status === "failed";

      items[i] = await updateBatchItem(item.id, {
        status: itemFailed ? "failed" : "completed",
        meeting_id: result.meeting?.id ?? null,
        replay_run_id: result.replayRun.id,
        regression_run_id: result.regressionRun?.id ?? null,
        checks_total: result.checks.length,
        checks_pass: pass,
        checks_warn: warn,
        checks_fail: fail,
        error_message: itemFailed ? result.replayRun.error_message : null,
        completed_at: new Date().toISOString(),
      });

      if (itemFailed) {
        failedCount += 1;
        lastError = result.replayRun.error_message ?? `Scenario "${item.scenario_id}" failed`;
        if (options.stopOnFailure) stoppedEarly = true;
      } else {
        completedCount += 1;
        totalChecks += result.checks.length;
        totalPass += pass;
        totalWarn += warn;
        totalFail += fail;
      }
    } catch (err) {
      // Defensive only - replayScenario catches its own failures internally
      // and returns rather than throws (scenario id is already validated
      // above), but never let an unexpected throw here abandon the batch.
      const message = err instanceof Error ? err.message : "Batch item failed unexpectedly";
      items[i] = await updateBatchItem(item.id, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
      failedCount += 1;
      lastError = message;
      if (options.stopOnFailure) stoppedEarly = true;
    }
  }

  const finalStatus: BatchRegressionRunStatus = stoppedEarly ? "failed" : failedCount > 0 ? "partial" : "completed";

  batchRun = await updateBatchRun(batchRun.id, {
    status: finalStatus,
    completed_count: completedCount,
    failed_count: failedCount,
    total_checks: totalChecks,
    total_pass: totalPass,
    total_warn: totalWarn,
    total_fail: totalFail,
    completed_at: new Date().toISOString(),
    error_message: stoppedEarly ? `Stopped after failure: ${lastError}` : null,
  });

  return { batchRun, items };
}

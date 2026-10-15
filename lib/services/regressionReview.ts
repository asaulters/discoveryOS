import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRegressionRun } from "@/lib/services/regressionRunner";
import { getBatchRegressionRun } from "@/lib/services/batchRegressionRunner";
import { getScenarioById } from "@/lib/scenarios";
import {
  classifyRegressionCheck,
  groupRegressionChecks,
  type ClassifiedRegressionCheck,
  type GroupedRegressionChecks,
} from "@/lib/services/regressionReviewClassify";
import type { BatchRegressionRun, BatchRegressionRunItem, RegressionCheck, RegressionRun } from "@/lib/types/database";

// Re-exported so callers (pages, API routes) can import everything Part A
// names from this one canonical path, while client components import the
// pure classify module directly to avoid pulling server-only code
// (createServerSupabaseClient) into the client bundle. See
// lib/services/regressionReviewClassify.ts for why the split exists.
export {
  classifyRegressionCheck,
  groupRegressionChecks,
  REVIEW_GROUPS,
  type ClassifiedRegressionCheck,
  type GroupedRegressionChecks,
  type ReviewGroup,
  type ReviewSeverity,
  type InspectionTarget,
} from "@/lib/services/regressionReviewClassify";

async function lookupMeetingsByIds(meetingIds: string[]): Promise<Map<string, { name: string; status: string }>> {
  if (meetingIds.length === 0) return new Map();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("meetings").select("id, name, status").in("id", meetingIds);
  if (error) {
    throw new Error(`Failed to load meetings: ${error.message}`);
  }
  return new Map((data ?? []).map((m) => [m.id, { name: m.name, status: m.status }]));
}

export interface SingleRegressionReview {
  run: RegressionRun;
  /** Raw checks alongside the grouped view - client components (SingleRunReview) reclassify these themselves to support interactive filter/group-by-category, and the raw-table toggle needs them verbatim. */
  checks: RegressionCheck[];
  meetingId: string;
  meetingName: string | null;
  meetingExists: boolean;
  scenarioName: string | null;
  totalCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  /** Every check, grouped - includes passes. */
  allGroups: GroupedRegressionChecks[];
  /** Same groups, but with passing checks filtered out - empty groups omitted. */
  needsAttentionGroups: GroupedRegressionChecks[];
}

/**
 * Sprint 24: transforms a saved regression run into a review-friendly
 * model - grouped, classified, with meeting/scenario context resolved.
 * Read-only: never writes to regression_runs/regression_checks. Returns
 * null (not a thrown error) when the run itself doesn't exist, so callers
 * can render a clean "not found" state.
 */
export async function buildSingleRegressionReview(regressionRunId: string): Promise<SingleRegressionReview | null> {
  const loaded = await getRegressionRun(regressionRunId);
  if (!loaded) return null;
  const { run, checks } = loaded;

  const classified = checks.map((c) => classifyRegressionCheck(c));
  const allGroups = groupRegressionChecks(classified);
  const needsAttentionGroups = allGroups
    .map((g) => ({ ...g, checks: g.checks.filter((c) => c.result !== "pass") }))
    .filter((g) => g.checks.length > 0);

  const meetingsById = await lookupMeetingsByIds([run.meeting_id]);
  const meeting = meetingsById.get(run.meeting_id);

  return {
    run,
    checks,
    meetingId: run.meeting_id,
    meetingName: meeting?.name ?? null,
    meetingExists: !!meeting,
    scenarioName: getScenarioById(run.scenario_id)?.name ?? null,
    totalCount: classified.length,
    passCount: classified.filter((c) => c.result === "pass").length,
    warnCount: classified.filter((c) => c.result === "warn").length,
    failCount: classified.filter((c) => c.result === "fail").length,
    allGroups,
    needsAttentionGroups,
  };
}

export interface BatchScenarioReview {
  item: BatchRegressionRunItem;
  scenarioName: string;
  meetingName: string | null;
  meetingExists: boolean;
  /** Null when the item has no linked regression run yet (pending/failed before reaching regression). */
  groups: GroupedRegressionChecks[] | null;
  mainConcern: string;
}

export interface BatchRegressionReview {
  batchRun: BatchRegressionRun;
  scenarios: BatchScenarioReview[];
  /** Grouped warning/failure summary across every scenario's checks combined. */
  aggregateGroups: GroupedRegressionChecks[];
}

function deriveMainConcern(item: BatchRegressionRunItem, groups: GroupedRegressionChecks[] | null): string {
  if (item.status === "failed") return "Pipeline failed";
  if (item.status === "pending" || item.status === "running") return "Not run yet";
  if (!groups) return item.checks_total === 0 ? "No checks recorded" : "No issues";

  const failGroup = groups.find((g) => g.failCount > 0);
  if (failGroup) {
    return failGroup.reviewGroup === "Trust and evidence"
      ? "Evidence quality fail"
      : failGroup.reviewGroup === "Export/share safety"
        ? "Export/share safety fail"
        : `${failGroup.reviewGroup} fail`;
  }
  const warnGroup = groups.find((g) => g.warnCount > 0);
  if (warnGroup) {
    return warnGroup.reviewGroup === "Missing expected discovery output"
      ? "Missing expected discovery output"
      : warnGroup.reviewGroup === "Conversation state"
        ? "Conversation state warning"
        : `${warnGroup.reviewGroup} warning`;
  }
  return "No issues";
}

/**
 * Sprint 24: same idea as buildSingleRegressionReview, but for a whole
 * batch - fetches each item's linked regression run (in parallel) to
 * derive a per-scenario "main concern" and a batch-wide grouped summary.
 * An item without a regression_run_id (pipeline failed before reaching
 * regression, or still pending) is handled gracefully - its `groups` is
 * null and its main concern reflects the item's own status instead.
 */
export async function buildBatchRegressionReview(batchRunId: string): Promise<BatchRegressionReview | null> {
  const loaded = await getBatchRegressionRun(batchRunId);
  if (!loaded) return null;
  const { batchRun, items } = loaded;

  const meetingIds = items.map((i) => i.meeting_id).filter((id): id is string => !!id);
  const meetingsById = await lookupMeetingsByIds(meetingIds);

  const itemReviews = await Promise.all(
    items.map(async (item) => {
      let groups: GroupedRegressionChecks[] | null = null;
      if (item.regression_run_id) {
        const runLoaded = await getRegressionRun(item.regression_run_id).catch(() => null);
        if (runLoaded) {
          groups = groupRegressionChecks(runLoaded.checks.map((c) => classifyRegressionCheck(c)));
        }
      }
      const meeting = item.meeting_id ? meetingsById.get(item.meeting_id) : undefined;
      return {
        item,
        scenarioName: getScenarioById(item.scenario_id)?.name ?? item.scenario_id,
        meetingName: meeting?.name ?? null,
        meetingExists: !!meeting,
        groups,
        mainConcern: deriveMainConcern(item, groups),
      };
    })
  );

  // Aggregate groups across every scenario's checks, combined - lets the
  // page show "Trust and evidence: X fail, Y warn" totals for the whole
  // batch without the reader having to add up each scenario card by hand.
  const allClassifiedChecks: ClassifiedRegressionCheck[] = itemReviews.flatMap(
    (r) => r.groups?.flatMap((g) => g.checks) ?? []
  );
  const aggregateGroups = groupRegressionChecks(allClassifiedChecks);

  return { batchRun, scenarios: itemReviews, aggregateGroups };
}

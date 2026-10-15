import { getAllMeetings } from "@/lib/services/meetings";
import { getRecentRegressionRuns } from "@/lib/services/regressionRunner";
import { getRecentBatchRegressionRuns } from "@/lib/services/batchRegressionRunner";
import { getScenarioById } from "@/lib/scenarios";
import RegressionRunnerClient, {
  type EligibleMeeting,
  type RecentRunSummary,
} from "./RegressionRunnerClient";

// Same reasoning as the dashboard (app/page.tsx): must reflect newly
// created meetings/runs on every load, no static route segment to force
// that otherwise.
export const dynamic = "force-dynamic";

export default async function RegressionPage() {
  const meetings = await getAllMeetings();

  const eligibleMeetings: EligibleMeeting[] = meetings
    .filter((m): m is typeof m & { scenario_id: string } => !!m.scenario_id)
    .map((m) => ({
      id: m.id,
      name: m.name,
      scenarioId: m.scenario_id,
      scenarioName: getScenarioById(m.scenario_id)?.name ?? m.scenario_id,
    }));

  // Recent runs are a separate, non-essential data source - eligible
  // meetings and the "Run regression" flow must still work even if this
  // fails (e.g. the regression_runs/regression_checks migration hasn't
  // been applied yet), so this is never allowed to fail the whole page.
  let recentRunSummaries: RecentRunSummary[] = [];
  let recentRunsError: string | null = null;
  try {
    const recentRuns = await getRecentRegressionRuns(20);
    recentRunSummaries = recentRuns.map(({ run, meetingName }) => ({
      id: run.id,
      createdAt: run.created_at,
      meetingId: run.meeting_id,
      meetingName,
      scenarioId: run.scenario_id,
      scenarioName: getScenarioById(run.scenario_id)?.name ?? null,
      overallResult: run.overall_result,
      status: run.status,
    }));
  } catch (err) {
    recentRunsError = err instanceof Error ? err.message : "Failed to load recent regression runs";
  }

  // Same "never fail the whole page" reasoning as recent single runs above.
  let recentBatchRuns: Awaited<ReturnType<typeof getRecentBatchRegressionRuns>> = [];
  let recentBatchRunsError: string | null = null;
  try {
    recentBatchRuns = await getRecentBatchRegressionRuns(20);
  } catch (err) {
    recentBatchRunsError =
      err instanceof Error ? err.message : "Failed to load recent batch regression runs";
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Regression Runner</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Replay scenarios and check for regressions using deterministic expectations -
        repeatable QA, not an AI judge.
      </p>

      {recentRunsError && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Recent runs couldn&apos;t be loaded: {recentRunsError}
        </p>
      )}
      {recentBatchRunsError && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Recent batch runs couldn&apos;t be loaded: {recentBatchRunsError}
        </p>
      )}

      <div className="mt-8">
        <RegressionRunnerClient
          eligibleMeetings={eligibleMeetings}
          initialRecentRuns={recentRunSummaries}
          initialRecentBatchRuns={recentBatchRuns}
        />
      </div>
    </main>
  );
}

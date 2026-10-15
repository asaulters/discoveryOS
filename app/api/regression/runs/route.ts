import { NextResponse } from "next/server";
import { getRecentRegressionRuns } from "@/lib/services/regressionRunner";
import { getScenarioById } from "@/lib/scenarios";

/** Sprint 16: latest regression runs, newest first, for the /regression page's "Recent runs" list. */
export async function GET() {
  try {
    const runs = await getRecentRegressionRuns(20);
    const enriched = runs.map(({ run, meetingName }) => ({
      run,
      meetingName,
      scenarioName: getScenarioById(run.scenario_id)?.name ?? null,
    }));
    return NextResponse.json({ runs: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load regression runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getRecentScenarioReplayRuns } from "@/lib/services/scenarioReplayRunner";

/** Sprint 17: latest scenario replay attempts, newest first. */
export async function GET() {
  try {
    const runs = await getRecentScenarioReplayRuns(20);
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load scenario replay runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

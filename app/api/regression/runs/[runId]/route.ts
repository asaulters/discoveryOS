import { NextRequest, NextResponse } from "next/server";
import { getRegressionRun } from "@/lib/services/regressionRunner";

/** Sprint 16: a single saved regression run + its checks, for "View" on the Recent runs list. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const result = await getRegressionRun(runId);
    if (!result) {
      return NextResponse.json({ error: "Regression run not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load regression run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

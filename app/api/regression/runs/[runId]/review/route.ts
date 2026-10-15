import { NextRequest, NextResponse } from "next/server";
import { buildSingleRegressionReview } from "@/lib/services/regressionReview";

/** Sprint 24: the review-ready model (grouped/classified checks + meeting/scenario context) for a single saved regression run, used by RegressionRunnerClient's inline "Latest result" panel right after a run/replay completes. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const review = await buildSingleRegressionReview(runId);
    if (!review) {
      return NextResponse.json({ error: "Regression run not found" }, { status: 404 });
    }
    return NextResponse.json({ review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load regression run review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

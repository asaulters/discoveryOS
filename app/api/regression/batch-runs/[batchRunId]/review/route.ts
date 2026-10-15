import { NextRequest, NextResponse } from "next/server";
import { buildBatchRegressionReview } from "@/lib/services/regressionReview";

/** Sprint 24: the review-ready model (per-scenario grouped checks, main concern, batch-wide aggregate groups) for a batch run, used by RegressionRunnerClient's inline batch result panel right after a batch run completes. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchRunId: string }> }
) {
  const { batchRunId } = await params;

  try {
    const review = await buildBatchRegressionReview(batchRunId);
    if (!review) {
      return NextResponse.json({ error: "Batch regression run not found" }, { status: 404 });
    }
    return NextResponse.json({ review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch regression run review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

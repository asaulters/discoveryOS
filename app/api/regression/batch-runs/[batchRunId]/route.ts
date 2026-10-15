import { NextRequest, NextResponse } from "next/server";
import { getBatchRegressionRun } from "@/lib/services/batchRegressionRunner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchRunId: string }> }
) {
  const { batchRunId } = await params;

  try {
    const result = await getBatchRegressionRun(batchRunId);
    if (!result) {
      return NextResponse.json({ error: "Batch regression run not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch regression run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

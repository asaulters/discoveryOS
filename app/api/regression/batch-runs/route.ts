import { NextRequest, NextResponse } from "next/server";
import { runBatchRegression, getRecentBatchRegressionRuns } from "@/lib/services/batchRegressionRunner";
import { getScenarioById } from "@/lib/scenarios";

interface BatchRunBody {
  scenarioIds?: string[];
  generateReview?: boolean;
  stopOnFailure?: boolean;
}

/**
 * Sprint 22: runs every requested scenario sequentially through the real
 * replay + regression pipeline. Synchronous per the sprint's own v1
 * guidance (same reasoning as replay-scenario/route.ts) - a full batch
 * makes many real sequential OpenAI calls and can take several minutes
 * for all six scenarios, which is expected for a local QA tool.
 */
export async function POST(request: NextRequest) {
  let body: BatchRunBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.scenarioIds) {
    const unknown = body.scenarioIds.filter((id) => !getScenarioById(id));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown scenario id(s): ${unknown.join(", ")}` },
        { status: 400 }
      );
    }
  }

  try {
    const result = await runBatchRegression({
      scenarioIds: body.scenarioIds,
      generateReview: body.generateReview === true,
      stopOnFailure: body.stopOnFailure === true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run batch regression";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const runs = await getRecentBatchRegressionRuns(20);
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load batch regression runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

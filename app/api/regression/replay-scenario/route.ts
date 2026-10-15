import { NextRequest, NextResponse } from "next/server";
import { replayScenario } from "@/lib/services/scenarioReplayRunner";

interface ReplayScenarioBody {
  scenarioId?: string;
  generateReview?: boolean;
}

/**
 * Sprint 17: creates a fresh meeting from a scenario fixture, drives it
 * through the real transcript pipeline (real OpenAI calls per chunk),
 * optionally generates a review, then runs Sprint 16's regression
 * checker. Synchronous per the sprint's own v1 guidance - this can take
 * a while (several real AI calls per chunk × several chunks), which is
 * expected for a local QA tool, not a production request path.
 *
 * A scenario that resolves but fails partway through (meeting creation,
 * a chunk, regression) still returns 200 with a "failed" replayRun - only
 * an unknown scenarioId is a real request error (404).
 */
export async function POST(request: NextRequest) {
  let body: ReplayScenarioBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scenarioId = body.scenarioId?.trim();
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  try {
    const result = await replayScenario(scenarioId, { generateReview: body.generateReview === true });
    const status = result.replayRun.status === "completed" ? 201 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to replay scenario";
    const status = message.startsWith("Unknown scenario id") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

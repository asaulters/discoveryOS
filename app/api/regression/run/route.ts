import { NextRequest, NextResponse } from "next/server";
import { runRegression } from "@/lib/services/regressionRunner";

interface RunRegressionBody {
  meetingId?: string;
}

/**
 * Sprint 16: runs the deterministic regression checks for one
 * scenario-created meeting and persists the result. Not automated replay
 * - it compares the meeting's current structured state (however it got
 * there) against its scenario's expectedOutputs. A meeting with no
 * scenario_id still returns 200 with a saved run - that's the "Scenario
 * metadata" check failing, not a request error.
 */
export async function POST(request: NextRequest) {
  let body: RunRegressionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const meetingId = body.meetingId?.trim();
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  try {
    const result = await runRegression(meetingId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run regression";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

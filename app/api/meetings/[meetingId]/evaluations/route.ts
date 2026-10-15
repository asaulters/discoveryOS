import { NextRequest, NextResponse } from "next/server";
import { saveEvaluationRun, type SaveEvaluationInput } from "@/lib/services/evaluations";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: SaveEvaluationInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }

  try {
    const evaluation = await saveEvaluationRun(meetingId, body);
    return NextResponse.json({ evaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save evaluation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

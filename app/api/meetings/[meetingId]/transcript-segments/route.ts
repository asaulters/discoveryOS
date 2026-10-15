import { NextRequest, NextResponse } from "next/server";
import { submitTranscriptChunk } from "@/lib/services/transcriptAnalysis";

interface TranscriptSegmentBody {
  text?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: TranscriptSegmentBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Transcript text is required" }, { status: 400 });
  }

  try {
    const hudState = await submitTranscriptChunk(meetingId, text);
    return NextResponse.json(hudState, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze transcript chunk";
    const status =
      message === "Meeting not found" || message === "No active discovery thread" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { analyzePendingTranscript } from "@/lib/services/transcriptAnalysis";

/**
 * Sprint 11: "Analyze latest segment now" / resume-analysis catch-up.
 * Runs the existing fast-loop + workflow-extractor pipeline against
 * whatever transcript segments already exist for the active thread -
 * see analyzePendingTranscript's doc comment for why one call anchored
 * on the newest segment is enough to cover everything pending.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const hudState = await analyzePendingTranscript(meetingId);
    return NextResponse.json(hudState, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze pending transcript";
    const status =
      message === "Meeting not found" ||
      message === "No active discovery thread" ||
      message === "No transcript segments to analyze yet"
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { deferThread } from "@/lib/services/threadFocus";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; threadId: string }> }
) {
  const { meetingId, threadId } = await params;

  try {
    const hudState = await deferThread(meetingId, threadId);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to defer thread";
    const status = message === "Thread not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

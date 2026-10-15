import { NextRequest, NextResponse } from "next/server";
import { startMeeting } from "@/lib/services/meetings";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const meeting = await startMeeting(meetingId);
    return NextResponse.json({ meeting });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start meeting";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

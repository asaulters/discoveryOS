import { NextRequest, NextResponse } from "next/server";
import { getHudState } from "@/lib/services/hudState";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const hudState = await getHudState(meetingId);
    if (!hudState) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load HUD state";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

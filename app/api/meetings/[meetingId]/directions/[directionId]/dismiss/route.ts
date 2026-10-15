import { NextRequest, NextResponse } from "next/server";
import { dismissDirection } from "@/lib/services/directionActions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; directionId: string }> }
) {
  const { meetingId, directionId } = await params;

  try {
    const hudState = await dismissDirection(meetingId, directionId);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dismiss direction";
    const status = message === "Direction not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

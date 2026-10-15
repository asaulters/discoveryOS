import { NextRequest, NextResponse } from "next/server";
import { generatePreMeetingBrief } from "@/lib/services/setupAnalystService";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const briefView = await generatePreMeetingBrief(meetingId);
    return NextResponse.json(briefView, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate brief";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

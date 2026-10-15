import { NextRequest, NextResponse } from "next/server";
import { generatePostMeetingReview } from "@/lib/services/postMeetingReviewService";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const review = await generatePostMeetingReview(meetingId);
    return NextResponse.json({ review });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate post-meeting review";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

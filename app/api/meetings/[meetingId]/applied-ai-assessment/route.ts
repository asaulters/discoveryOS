import { NextRequest, NextResponse } from "next/server";
import { generateAppliedAiOpportunityAssessment } from "@/lib/services/appliedAiOpportunityAssessment";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const assessment = await generateAppliedAiOpportunityAssessment(meetingId);
    return NextResponse.json({ assessment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate Applied AI opportunity assessment";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

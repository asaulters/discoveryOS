import { NextRequest, NextResponse } from "next/server";
import { resolveAmbiguityFlagAction } from "@/lib/services/ambiguityFlagActions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; flagId: string }> }
) {
  const { meetingId, flagId } = await params;

  try {
    const ambiguityFlags = await resolveAmbiguityFlagAction(meetingId, flagId);
    return NextResponse.json({ ambiguityFlags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve ambiguity flag";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

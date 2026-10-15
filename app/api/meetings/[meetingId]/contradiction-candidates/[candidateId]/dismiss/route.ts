import { NextRequest, NextResponse } from "next/server";
import { dismissContradictionCandidateAction } from "@/lib/services/contradictionCandidateActions";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; candidateId: string }> }
) {
  const { meetingId, candidateId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const resolutionNote =
      typeof body?.resolutionNote === "string" ? body.resolutionNote : undefined;

    const contradictionCandidates = await dismissContradictionCandidateAction(
      meetingId,
      candidateId,
      resolutionNote
    );
    return NextResponse.json({ contradictionCandidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dismiss contradiction candidate";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

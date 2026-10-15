import { NextRequest, NextResponse } from "next/server";
import { lockWorkflowItemAction } from "@/lib/services/workflowItemActions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; gapId: string }> }
) {
  const { meetingId, gapId } = await params;

  try {
    const hudState = await lockWorkflowItemAction(meetingId, "gap", gapId);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to lock workflow gap";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

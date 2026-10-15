import { NextRequest, NextResponse } from "next/server";
import { unlockWorkflowItemAction } from "@/lib/services/workflowItemActions";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; stepId: string }> }
) {
  const { meetingId, stepId } = await params;

  try {
    const hudState = await unlockWorkflowItemAction(meetingId, "step", stepId);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unlock workflow step";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { editWorkflowStep } from "@/lib/services/workflowItemActions";

interface EditStepBody {
  title?: string;
  description?: string | null;
  humanNote?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; stepId: string }> }
) {
  const { meetingId, stepId } = await params;

  let body: EditStepBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const hudState = await editWorkflowStep(meetingId, stepId, body);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update workflow step";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

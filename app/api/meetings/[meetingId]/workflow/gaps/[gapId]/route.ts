import { NextRequest, NextResponse } from "next/server";
import { editWorkflowGap } from "@/lib/services/workflowItemActions";

interface EditGapBody {
  label?: string;
  description?: string | null;
  humanNote?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; gapId: string }> }
) {
  const { meetingId, gapId } = await params;

  let body: EditGapBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const hudState = await editWorkflowGap(meetingId, gapId, body);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update workflow gap";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { editWorkflowComponent } from "@/lib/services/workflowItemActions";

interface EditComponentBody {
  label?: string;
  description?: string | null;
  humanNote?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string; componentId: string }> }
) {
  const { meetingId, componentId } = await params;

  let body: EditComponentBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const hudState = await editWorkflowComponent(meetingId, componentId, body);
    return NextResponse.json(hudState);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update workflow component";
    const status = message.endsWith("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

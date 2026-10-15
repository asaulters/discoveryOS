import { NextRequest, NextResponse } from "next/server";
import {
  getFieldTestForMeeting,
  upsertFieldTestForMeeting,
  type UpsertFieldTestInput,
} from "@/lib/services/fieldTests";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const fieldTest = await getFieldTestForMeeting(meetingId);
    return NextResponse.json(fieldTest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load field test";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: UpsertFieldTestInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const fieldTest = await upsertFieldTestForMeeting(meetingId, body);
    return NextResponse.json(fieldTest, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save field test";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

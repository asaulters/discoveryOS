import { NextRequest, NextResponse } from "next/server";
import {
  getRemoteCaptureReadiness,
  upsertRemoteCaptureReadiness,
  type UpsertRemoteCaptureReadinessInput,
} from "@/lib/services/remoteCaptureReadiness";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const readiness = await getRemoteCaptureReadiness(meetingId);
    return NextResponse.json(readiness);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load remote capture readiness";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: UpsertRemoteCaptureReadinessInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const readiness = await upsertRemoteCaptureReadiness(meetingId, body);
    return NextResponse.json(readiness, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save remote capture readiness";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

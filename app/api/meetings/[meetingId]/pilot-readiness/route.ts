import { NextRequest, NextResponse } from "next/server";
import {
  getPilotReadiness,
  upsertPilotReadiness,
  type UpsertPilotReadinessInput,
} from "@/lib/services/pilotReadiness";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const readiness = await getPilotReadiness(meetingId);
    return NextResponse.json(readiness);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pilot readiness";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: UpsertPilotReadinessInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const readiness = await upsertPilotReadiness(meetingId, body);
    return NextResponse.json(readiness, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save pilot readiness";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

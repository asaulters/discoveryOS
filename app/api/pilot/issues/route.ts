import { NextRequest, NextResponse } from "next/server";
import { createPilotIssue, listPilotIssues } from "@/lib/services/pilotIssues";
import type { PilotIssueCategory, PilotIssueSeverity, PilotIssueStatus } from "@/lib/types/database";

const STATUSES: PilotIssueStatus[] = ["open", "resolved", "dismissed"];
const CATEGORIES: PilotIssueCategory[] = [
  "live_capture",
  "suggested_directions",
  "still_to_explore",
  "process_extraction",
  "evidence_quality",
  "review_export",
  "ui_confusion",
  "performance",
  "other",
];
const SEVERITIES: PilotIssueSeverity[] = ["low", "medium", "high", "critical"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const category = params.get("category");
  const severity = params.get("severity");
  const meetingId = params.get("meetingId");

  if (status && !STATUSES.includes(status as PilotIssueStatus)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (category && !CATEGORIES.includes(category as PilotIssueCategory)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (severity && !SEVERITIES.includes(severity as PilotIssueSeverity)) {
    return NextResponse.json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` }, { status: 400 });
  }

  try {
    const issues = await listPilotIssues({
      status: (status as PilotIssueStatus) ?? undefined,
      category: (category as PilotIssueCategory) ?? undefined,
      severity: (severity as PilotIssueSeverity) ?? undefined,
      meetingId: meetingId ?? undefined,
    });
    return NextResponse.json({ issues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pilot issues";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface CreatePilotIssueBody {
  meetingId?: string;
  title?: string;
  description?: string;
  category?: string;
  severity?: string;
  sourcePilotNoteId?: string;
}

export async function POST(request: NextRequest) {
  let body: CreatePilotIssueBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const meetingId = body.meetingId?.trim();
  const title = body.title?.trim();
  if (!meetingId || !title) {
    return NextResponse.json({ error: "meetingId and title are required" }, { status: 400 });
  }
  if (body.category && !CATEGORIES.includes(body.category as PilotIssueCategory)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (body.severity && !SEVERITIES.includes(body.severity as PilotIssueSeverity)) {
    return NextResponse.json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` }, { status: 400 });
  }

  try {
    const issue = await createPilotIssue(meetingId, {
      title,
      description: body.description,
      category: body.category as PilotIssueCategory | undefined,
      severity: body.severity as PilotIssueSeverity | undefined,
      sourcePilotNoteId: body.sourcePilotNoteId,
    });
    return NextResponse.json(issue, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create pilot issue";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

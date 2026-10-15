import { NextRequest, NextResponse } from "next/server";
import { updatePilotIssue } from "@/lib/services/pilotIssues";
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

interface UpdatePilotIssueBody {
  title?: string;
  description?: string | null;
  category?: string;
  severity?: string;
  status?: string;
  resolutionNote?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;

  let body: UpdatePilotIssueBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.status && !STATUSES.includes(body.status as PilotIssueStatus)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (body.category && !CATEGORIES.includes(body.category as PilotIssueCategory)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (body.severity && !SEVERITIES.includes(body.severity as PilotIssueSeverity)) {
    return NextResponse.json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` }, { status: 400 });
  }

  try {
    const issue = await updatePilotIssue(issueId, {
      title: body.title,
      description: body.description,
      category: body.category as PilotIssueCategory | undefined,
      severity: body.severity as PilotIssueSeverity | undefined,
      status: body.status as PilotIssueStatus | undefined,
      resolutionNote: body.resolutionNote,
    });
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update pilot issue";
    const status = message === "Pilot issue not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

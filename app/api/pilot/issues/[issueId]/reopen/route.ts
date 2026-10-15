import { NextRequest, NextResponse } from "next/server";
import { reopenPilotIssue } from "@/lib/services/pilotIssues";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;

  try {
    const issue = await reopenPilotIssue(issueId);
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reopen pilot issue";
    const status = message === "Pilot issue not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

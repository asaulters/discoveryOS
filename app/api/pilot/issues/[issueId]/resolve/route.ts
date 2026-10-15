import { NextRequest, NextResponse } from "next/server";
import { markPilotIssueResolved } from "@/lib/services/pilotIssues";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;

  let resolutionNote: string | undefined;
  try {
    const body = await request.json();
    resolutionNote = typeof body?.resolutionNote === "string" ? body.resolutionNote : undefined;
  } catch {
    // No body / not JSON - resolving without a note is fine.
  }

  try {
    const issue = await markPilotIssueResolved(issueId, resolutionNote);
    return NextResponse.json(issue);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve pilot issue";
    const status = message === "Pilot issue not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

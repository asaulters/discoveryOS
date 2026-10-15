import { NextRequest, NextResponse } from "next/server";
import { buildMeetingExport } from "@/lib/services/meetingExportBuilder";
import { buildMeetingMarkdown } from "@/lib/services/meetingMarkdownExport";

/**
 * Sprint 14: returns copy-pasteable Markdown built from current structured
 * meeting state (workflow/gaps/ambiguity flags/contradiction candidates)
 * plus the latest post-meeting review if one exists - never the other way
 * around (no separate export reasoning path, just a formatter over
 * existing data). JSON response rather than text/markdown since the
 * primary consumer is the Review page's copy/download panel calling
 * fetch().json().
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  try {
    const model = await buildMeetingExport(meetingId);
    if (!model) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const markdown = buildMeetingMarkdown(model);
    return NextResponse.json({ markdown, generatedAt: model.generatedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build meeting export";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

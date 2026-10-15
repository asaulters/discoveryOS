import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  PilotIssue,
  PilotIssueCategory,
  PilotIssueSeverity,
  PilotIssueStatus,
} from "@/lib/types/database";

export interface CreatePilotIssueInput {
  title: string;
  description?: string | null;
  category?: PilotIssueCategory;
  severity?: PilotIssueSeverity;
  /** meeting_pilot_notes.id this issue was raised from, if the caller has it - purely a soft link, never required. */
  sourcePilotNoteId?: string | null;
}

/** Creates a pilot issue for a meeting. Never called automatically from issues_observed text - always a deliberate user action (Review page "Create tracked issue"). */
export async function createPilotIssue(
  meetingId: string,
  input: CreatePilotIssueInput
): Promise<PilotIssue> {
  const supabase = await createServerSupabaseClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", meetingId)
    .maybeSingle();
  if (meetingError) throw new Error(`Failed to load meeting: ${meetingError.message}`);
  if (!meeting) throw new Error("Meeting not found");

  const { data, error } = await supabase
    .from("pilot_issues")
    .insert({
      meeting_id: meetingId,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? "other",
      severity: input.severity ?? "medium",
      source_pilot_note_id: input.sourcePilotNoteId ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create pilot issue: ${error?.message}`);
  return data;
}

export async function listPilotIssuesForMeeting(meetingId: string): Promise<PilotIssue[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("pilot_issues")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load pilot issues: ${error.message}`);
  return data ?? [];
}

export interface PilotIssueFilters {
  status?: PilotIssueStatus;
  category?: PilotIssueCategory;
  severity?: PilotIssueSeverity;
  meetingId?: string;
}

/** All tracked pilot issues matching the given filters, newest first - used by the /pilot dashboard and GET /api/pilot/issues. No filter means every issue. */
export async function listPilotIssues(filters: PilotIssueFilters = {}): Promise<PilotIssue[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("pilot_issues").select("*");

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.severity) query = query.eq("severity", filters.severity);
  if (filters.meetingId) query = query.eq("meeting_id", filters.meetingId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load pilot issues: ${error.message}`);
  return data ?? [];
}

export interface UpdatePilotIssueInput {
  title?: string;
  description?: string | null;
  category?: PilotIssueCategory;
  severity?: PilotIssueSeverity;
  status?: PilotIssueStatus;
  resolutionNote?: string | null;
}

/**
 * Generic partial update, used directly by PATCH and internally by the
 * resolve/dismiss/reopen convenience functions below. Setting `status` to
 * "resolved" stamps `resolved_at`; setting it to "open" (reopening)
 * clears `resolved_at`. Dismissing leaves `resolved_at` untouched -
 * "dismissed" isn't "resolved", so the column keeps its literal meaning.
 */
export async function updatePilotIssue(
  issueId: string,
  input: UpdatePilotIssueInput
): Promise<PilotIssue> {
  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("pilot_issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load pilot issue: ${existingError.message}`);
  if (!existing) throw new Error("Pilot issue not found");

  const fields: Partial<
    Omit<PilotIssue, "id" | "meeting_id" | "source_pilot_note_id" | "created_at" | "updated_at">
  > = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.description !== undefined) fields.description = input.description;
  if (input.category !== undefined) fields.category = input.category;
  if (input.severity !== undefined) fields.severity = input.severity;
  if (input.resolutionNote !== undefined) fields.resolution_note = input.resolutionNote;
  if (input.status !== undefined) {
    fields.status = input.status;
    if (input.status === "resolved") {
      fields.resolved_at = new Date().toISOString();
    } else if (input.status === "open") {
      fields.resolved_at = null;
    }
  }

  const { data, error } = await supabase
    .from("pilot_issues")
    .update(fields)
    .eq("id", issueId)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to update pilot issue: ${error?.message}`);
  return data;
}

export async function markPilotIssueResolved(
  issueId: string,
  resolutionNote?: string
): Promise<PilotIssue> {
  return updatePilotIssue(issueId, {
    status: "resolved",
    ...(resolutionNote !== undefined ? { resolutionNote } : {}),
  });
}

export async function dismissPilotIssue(
  issueId: string,
  resolutionNote?: string
): Promise<PilotIssue> {
  return updatePilotIssue(issueId, {
    status: "dismissed",
    ...(resolutionNote !== undefined ? { resolutionNote } : {}),
  });
}

/** Reopening clears resolved_at (via updatePilotIssue's status="open" branch) but intentionally leaves resolution_note in place - it's a record of what was tried, not something reopening should erase. */
export async function reopenPilotIssue(issueId: string): Promise<PilotIssue> {
  return updatePilotIssue(issueId, { status: "open" });
}

/** Only for cleanup/testing - not exposed as a main UI action per the sprint brief. */
export async function deletePilotIssue(issueId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("pilot_issues").delete().eq("id", issueId);
  if (error) throw new Error(`Failed to delete pilot issue: ${error.message}`);
}

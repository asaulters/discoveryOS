import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MeetingPilotNotes, RecordingMode } from "@/lib/types/database";

/**
 * Sprint 18: same "row or sensible defaults" shape used across the app for
 * one-per-meeting state - callers never need to null-check before reading a
 * field. `id`/`created_at`/`updated_at` are null until a row has actually
 * been saved.
 */
export type PilotReadiness = Omit<MeetingPilotNotes, "id" | "created_at" | "updated_at"> & {
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Exported so pages can fall back to this directly if `getPilotReadiness`
 * itself throws (e.g. the migration hasn't been applied yet) - same
 * "never let a non-essential data source fail the whole page" pattern as
 * `app/regression/page.tsx`'s `recentRunsError` handling.
 */
export function defaultPilotReadiness(meetingId: string): PilotReadiness {
  return {
    id: null,
    meeting_id: meetingId,
    pilot_mode: false,
    consent_confirmed: false,
    consent_note: null,
    recording_mode: null,
    known_limitations_acknowledged: false,
    pre_meeting_checklist: null,
    post_meeting_checklist: null,
    pilot_notes: null,
    issues_observed: null,
    followup_actions: null,
    created_at: null,
    updated_at: null,
  };
}

async function getPilotReadinessRow(meetingId: string): Promise<MeetingPilotNotes | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("meeting_pilot_notes")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load pilot readiness: ${error.message}`);
  }

  return data;
}

/** Returns the meeting's pilot readiness state, or sensible defaults if nothing has been saved yet. */
export async function getPilotReadiness(meetingId: string): Promise<PilotReadiness> {
  const row = await getPilotReadinessRow(meetingId);
  return row ?? defaultPilotReadiness(meetingId);
}

export interface UpsertPilotReadinessInput {
  pilotMode?: boolean;
  consentConfirmed?: boolean;
  consentNote?: string | null;
  recordingMode?: RecordingMode | null;
  knownLimitationsAcknowledged?: boolean;
  preMeetingChecklist?: Record<string, boolean> | null;
  postMeetingChecklist?: Record<string, boolean> | null;
  pilotNotes?: string | null;
  issuesObserved?: string | null;
  followupActions?: string | null;
}

/** Creates the meeting's pilot readiness row if it doesn't exist yet, otherwise updates only the fields provided. */
export async function upsertPilotReadiness(
  meetingId: string,
  payload: UpsertPilotReadinessInput
): Promise<MeetingPilotNotes> {
  const supabase = await createServerSupabaseClient();
  const existing = await getPilotReadinessRow(meetingId);

  const fields: Partial<
    Omit<MeetingPilotNotes, "id" | "meeting_id" | "created_at" | "updated_at">
  > = {};
  if (payload.pilotMode !== undefined) fields.pilot_mode = payload.pilotMode;
  if (payload.consentConfirmed !== undefined) fields.consent_confirmed = payload.consentConfirmed;
  if (payload.consentNote !== undefined) fields.consent_note = payload.consentNote;
  if (payload.recordingMode !== undefined) fields.recording_mode = payload.recordingMode;
  if (payload.knownLimitationsAcknowledged !== undefined) {
    fields.known_limitations_acknowledged = payload.knownLimitationsAcknowledged;
  }
  if (payload.preMeetingChecklist !== undefined) {
    fields.pre_meeting_checklist = payload.preMeetingChecklist;
  }
  if (payload.postMeetingChecklist !== undefined) {
    fields.post_meeting_checklist = payload.postMeetingChecklist;
  }
  if (payload.pilotNotes !== undefined) fields.pilot_notes = payload.pilotNotes;
  if (payload.issuesObserved !== undefined) fields.issues_observed = payload.issuesObserved;
  if (payload.followupActions !== undefined) fields.followup_actions = payload.followupActions;

  if (existing) {
    const { data, error } = await supabase
      .from("meeting_pilot_notes")
      .update(fields)
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update pilot readiness: ${error?.message}`);
    }
    return data;
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    throw new Error(`Failed to load meeting: ${meetingError.message}`);
  }
  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const { data, error } = await supabase
    .from("meeting_pilot_notes")
    .insert({ meeting_id: meetingId, ...fields })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create pilot readiness: ${error?.message}`);
  }
  return data;
}

export async function markConsentConfirmed(
  meetingId: string,
  note?: string
): Promise<MeetingPilotNotes> {
  return upsertPilotReadiness(meetingId, {
    consentConfirmed: true,
    ...(note !== undefined ? { consentNote: note } : {}),
  });
}

export type PilotChecklistType = "pre_meeting" | "post_meeting";

export async function updatePilotChecklist(
  meetingId: string,
  checklistType: PilotChecklistType,
  values: Record<string, boolean>
): Promise<MeetingPilotNotes> {
  return upsertPilotReadiness(meetingId, {
    ...(checklistType === "pre_meeting"
      ? { preMeetingChecklist: values }
      : { postMeetingChecklist: values }),
  });
}

export async function updatePilotNotes(
  meetingId: string,
  notes: string
): Promise<MeetingPilotNotes> {
  return upsertPilotReadiness(meetingId, { pilotNotes: notes });
}

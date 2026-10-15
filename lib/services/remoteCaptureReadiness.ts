import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RemoteCaptureReadiness, RemoteCaptureSetup } from "@/lib/types/database";

/**
 * Sprint 32: same "row or sensible defaults" shape used across the app for
 * one-per-meeting state (see lib/services/pilotReadiness.ts's
 * PilotReadiness, lib/services/fieldTests.ts's FieldTestView) - callers
 * never need to null-check before reading a field. `id`/`created_at`/
 * `updated_at` are null until a row has actually been saved.
 */
export type RemoteCaptureReadinessView = Omit<RemoteCaptureReadiness, "id" | "created_at" | "updated_at"> & {
  id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Exported so pages can fall back to this directly if
 * `getRemoteCaptureReadiness` itself throws (e.g. the migration hasn't
 * been applied yet) - same "never let a non-essential data source fail
 * the whole page" pattern as pilotReadiness.ts's defaultPilotReadiness
 * and fieldTests.ts's defaultFieldTest.
 */
export function getDefaultRemoteCaptureReadiness(meetingId: string): RemoteCaptureReadinessView {
  return {
    id: null,
    meeting_id: meetingId,
    capture_setup: "unknown",
    pre_call_test_completed: false,
    remote_audio_captured_clearly: false,
    user_voice_dominated: false,
    manual_backup_ready: false,
    notes: null,
    created_at: null,
    updated_at: null,
  };
}

async function getRemoteCaptureReadinessRow(meetingId: string): Promise<RemoteCaptureReadiness | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("remote_capture_readiness")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load remote capture readiness: ${error.message}`);
  }

  return data;
}

/** Returns the meeting's remote-capture setup checklist, or sensible defaults if nothing has been saved yet. */
export async function getRemoteCaptureReadiness(meetingId: string): Promise<RemoteCaptureReadinessView> {
  const row = await getRemoteCaptureReadinessRow(meetingId);
  return row ?? getDefaultRemoteCaptureReadiness(meetingId);
}

export interface UpsertRemoteCaptureReadinessInput {
  captureSetup?: RemoteCaptureSetup;
  preCallTestCompleted?: boolean;
  remoteAudioCapturedClearly?: boolean;
  userVoiceDominated?: boolean;
  manualBackupReady?: boolean;
  notes?: string | null;
}

/** Creates the meeting's remote-capture readiness row if it doesn't exist yet, otherwise updates only the fields provided. */
export async function upsertRemoteCaptureReadiness(
  meetingId: string,
  payload: UpsertRemoteCaptureReadinessInput
): Promise<RemoteCaptureReadiness> {
  const supabase = await createServerSupabaseClient();
  const existing = await getRemoteCaptureReadinessRow(meetingId);

  const fields: Partial<Omit<RemoteCaptureReadiness, "id" | "meeting_id" | "created_at" | "updated_at">> = {};
  if (payload.captureSetup !== undefined) fields.capture_setup = payload.captureSetup;
  if (payload.preCallTestCompleted !== undefined) fields.pre_call_test_completed = payload.preCallTestCompleted;
  if (payload.remoteAudioCapturedClearly !== undefined) {
    fields.remote_audio_captured_clearly = payload.remoteAudioCapturedClearly;
  }
  if (payload.userVoiceDominated !== undefined) fields.user_voice_dominated = payload.userVoiceDominated;
  if (payload.manualBackupReady !== undefined) fields.manual_backup_ready = payload.manualBackupReady;
  if (payload.notes !== undefined) fields.notes = payload.notes;

  if (existing) {
    const { data, error } = await supabase
      .from("remote_capture_readiness")
      .update(fields)
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update remote capture readiness: ${error?.message}`);
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
    .from("remote_capture_readiness")
    .insert({ meeting_id: meetingId, ...fields })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create remote capture readiness: ${error?.message}`);
  }
  return data;
}

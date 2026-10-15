import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AiRunLog } from "@/lib/types/database";
import type { AiRunLogStatus } from "@/lib/ai/aiCallRunner";

/**
 * Sprint 1 only logs run structure — no AI providers are called yet.
 * Later sprints will wrap actual model calls with these start/complete helpers.
 */
export async function startAiRunLog(
  runType: string,
  input: unknown,
  meetingId?: string
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_run_logs")
    .insert({
      meeting_id: meetingId ?? null,
      run_type: runType,
      status: "pending",
      input,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to start AI run log "${runType}": ${error.message}`);
  }

  return data;
}

/**
 * Sprint 29 Part C: status is a plain `text` column with no check
 * constraint (see supabase/migrations/0001_init.sql), so widening this to
 * the richer AiRunLogStatus values (timeout/retry_succeeded/retry_failed)
 * needs no migration - existing rows and readers that only know
 * "succeeded"/"failed" are unaffected.
 */
export async function completeAiRunLog(
  runId: string,
  status: AiRunLogStatus,
  output: unknown,
  errorMessage?: string
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("ai_run_logs")
    .update({
      status,
      output,
      error: errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new Error(`Failed to complete AI run log ${runId}: ${error.message}`);
  }
}

/**
 * The AI run types the debug trace-lite page (Sprint 5) surfaces for a
 * meeting, newest first. Each service logs its model name inside its own
 * `input` payload (see e.g. workflowExtractorService's `startAiRunLog`
 * call) since ai_run_logs has no dedicated `model` column - the debug page
 * reads it back out of there.
 */
export async function getAiRunLogsForMeeting(meetingId: string): Promise<AiRunLog[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_run_logs")
    .select("*")
    .eq("meeting_id", meetingId)
    .in("run_type", [
      "setup_analyst",
      "fast_loop_analysis",
      "workflow_extractor",
      "post_meeting_review",
      "audio_transcription",
      "contradiction_detector",
      "conversation_state_analyzer",
      "applied_ai_opportunity_assessment",
    ])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load AI run logs: ${error.message}`);
  }

  return data ?? [];
}

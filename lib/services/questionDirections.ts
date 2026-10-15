import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DirectionStatus, QuestionDirection } from "@/lib/types/database";

export interface DirectionDraft {
  title: string;
  questions: string[];
  reason: string;
}

/**
 * Each fast-loop analysis represents the latest read of a thread. Directions
 * the facilitator hasn't acted on yet are marked "stale" rather than
 * deleted - used/dismissed/deferred/stale directions are all kept in the
 * database - and the new batch is inserted as "active".
 */
export async function refreshDirectionsForThread(
  threadId: string,
  directions: DirectionDraft[]
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error: staleError } = await supabase
    .from("question_directions")
    .update({ status: "stale" })
    .eq("discovery_thread_id", threadId)
    .eq("status", "active");

  if (staleError) {
    throw new Error(`Failed to archive previous directions: ${staleError.message}`);
  }

  if (directions.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("question_directions").insert(
    directions.map((direction) => ({
      discovery_thread_id: threadId,
      text: direction.title,
      questions: direction.questions,
      reason: direction.reason,
      status: "active" as const,
    }))
  );

  if (insertError) {
    throw new Error(`Failed to save question directions: ${insertError.message}`);
  }
}

/**
 * Every question direction across every thread in the meeting (active,
 * used, dismissed, deferred, stale) - for the post-meeting review (Sprint
 * 7), which needs to see what's already been asked/resolved, not just the
 * currently-active thread's directions like getDirectionsForThread.
 */
export async function getAllDirectionsForMeeting(meetingId: string): Promise<QuestionDirection[]> {
  const supabase = await createServerSupabaseClient();

  const { data: threads, error: threadsError } = await supabase
    .from("discovery_threads")
    .select("id")
    .eq("meeting_id", meetingId);

  if (threadsError) {
    throw new Error(`Failed to load discovery threads: ${threadsError.message}`);
  }

  const threadIds = (threads ?? []).map((t) => t.id);
  if (threadIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("question_directions")
    .select("*")
    .in("discovery_thread_id", threadIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load question directions: ${error.message}`);
  }

  return data ?? [];
}

export interface DirectionWithMeeting {
  direction: QuestionDirection;
  meetingId: string;
  threadId: string;
}

/**
 * Loads a direction along with the meeting it belongs to (via its parent
 * thread), so action routes can verify the meetingId in the URL actually
 * owns this direction before mutating it.
 */
export async function getDirectionWithMeeting(
  directionId: string
): Promise<DirectionWithMeeting | null> {
  const supabase = await createServerSupabaseClient();

  const { data: direction, error: directionError } = await supabase
    .from("question_directions")
    .select("*")
    .eq("id", directionId)
    .maybeSingle();

  if (directionError) {
    throw new Error(`Failed to load direction: ${directionError.message}`);
  }
  if (!direction) {
    return null;
  }

  const { data: thread, error: threadError } = await supabase
    .from("discovery_threads")
    .select("id, meeting_id")
    .eq("id", direction.discovery_thread_id)
    .maybeSingle();

  if (threadError) {
    throw new Error(`Failed to load direction's thread: ${threadError.message}`);
  }
  if (!thread) {
    return null;
  }

  return { direction, meetingId: thread.meeting_id, threadId: thread.id };
}

export async function updateDirectionStatus(
  directionId: string,
  status: DirectionStatus
): Promise<QuestionDirection> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_directions")
    .update({ status })
    .eq("id", directionId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update direction status: ${error?.message}`);
  }

  return data;
}

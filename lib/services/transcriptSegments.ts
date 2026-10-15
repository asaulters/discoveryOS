import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TranscriptionMetadata, TranscriptSegment, TranscriptSourceType } from "@/lib/types/database";

/** source_type defaults to "manual" - only the live-audio path (Sprint 11) ever passes "live_audio" + metadata. */
export async function createTranscriptSegment(
  meetingId: string,
  discoveryThreadId: string | null,
  rawText: string,
  sourceType: TranscriptSourceType = "manual",
  transcriptionMetadata: TranscriptionMetadata | null = null
): Promise<TranscriptSegment> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .insert({
      meeting_id: meetingId,
      discovery_thread_id: discoveryThreadId,
      raw_text: rawText,
      source_type: sourceType,
      transcription_metadata: transcriptionMetadata,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to save transcript segment: ${error?.message}`);
  }

  return data;
}

export async function getTranscriptSegmentsForThread(
  discoveryThreadId: string
): Promise<TranscriptSegment[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("discovery_thread_id", discoveryThreadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load transcript segments: ${error.message}`);
  }

  return data ?? [];
}

/** Every chunk heard in the meeting so far, oldest to newest, for the workflow extractor. */
export async function getOrderedTranscriptSegmentsForMeeting(
  meetingId: string
): Promise<TranscriptSegment[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load transcript history: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Fetches specific transcript segments by id, for the evidence drawer -
 * evidence can cite a segment far outside the last-5 recentTranscriptSegments
 * window, so callers can't rely on that list alone.
 */
export async function getTranscriptSegmentsByIds(
  segmentIds: string[]
): Promise<TranscriptSegment[]> {
  if (segmentIds.length === 0) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .in("id", segmentIds);

  if (error) {
    throw new Error(`Failed to load evidence transcript segments: ${error.message}`);
  }

  return data ?? [];
}

/** Most recent chunks across the whole meeting, newest first, for the HUD's transcript history panel. */
export async function getRecentTranscriptSegmentsForMeeting(
  meetingId: string,
  limit = 5
): Promise<TranscriptSegment[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load recent transcript segments: ${error.message}`);
  }

  return data ?? [];
}

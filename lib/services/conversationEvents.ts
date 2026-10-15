import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ConversationEvent,
  ConversationEventConfidence,
  ConversationEventSourceRole,
  ConversationEventType,
} from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ConversationEventDraft {
  transcriptSegmentId: string | null;
  eventType: ConversationEventType;
  sourceRole: ConversationEventSourceRole;
  label: string;
  description: string | null;
  evidenceExcerpt: string | null;
  confidenceLevel: ConversationEventConfidence;
}

/**
 * Records conversation-state events for a meeting, deduped by
 * (meeting_id, event_type, normalized label) - a long meeting re-hearing
 * the same topic across many analysis passes should not grow this table
 * unbounded. Matches update the most recent evidence/excerpt in place
 * rather than inserting a near-duplicate row, mirroring reconcile*
 * elsewhere in this app (ambiguityFlags.ts, workflows.ts). Nothing is
 * ever deleted.
 */
export async function reconcileConversationEvents(
  meetingId: string,
  drafts: ConversationEventDraft[]
): Promise<void> {
  if (drafts.length === 0) return;

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("conversation_events")
    .select("*")
    .eq("meeting_id", meetingId);

  if (existingError) {
    throw new Error(`Failed to load existing conversation events: ${existingError.message}`);
  }

  const existingByKey = new Map(
    (existing ?? []).map((e) => [`${e.event_type}::${e.normalized_label}`, e])
  );

  for (const draft of drafts) {
    const normalizedLabel = normalize(draft.label);
    const key = `${draft.eventType}::${normalizedLabel}`;
    const match = existingByKey.get(key);

    if (match) {
      const { error } = await supabase
        .from("conversation_events")
        .update({
          transcript_segment_id: draft.transcriptSegmentId,
          description: draft.description,
          evidence_excerpt: draft.evidenceExcerpt,
          confidence_level: draft.confidenceLevel,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update conversation event: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("conversation_events").insert({
      meeting_id: meetingId,
      transcript_segment_id: draft.transcriptSegmentId,
      event_type: draft.eventType,
      source_role: draft.sourceRole,
      label: draft.label,
      normalized_label: normalizedLabel,
      description: draft.description,
      evidence_excerpt: draft.evidenceExcerpt,
      confidence_level: draft.confidenceLevel,
    });

    if (error) {
      throw new Error(`Failed to create conversation event: ${error.message}`);
    }
  }
}

/** Every conversation event for a meeting, oldest first - not yet surfaced in any UI, but queryable (e.g. for future debug tooling). */
export async function getConversationEventsForMeeting(
  meetingId: string
): Promise<ConversationEvent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("conversation_events")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load conversation events: ${error.message}`);
  }

  return data ?? [];
}

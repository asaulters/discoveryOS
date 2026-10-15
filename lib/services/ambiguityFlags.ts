import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AmbiguityFlag, AmbiguityType, ThreadPriority } from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getAmbiguityFlagsForMeeting(meetingId: string): Promise<AmbiguityFlag[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ambiguity_flags")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load ambiguity flags: ${error.message}`);
  }

  return data ?? [];
}

export interface AmbiguityFlagDraft {
  label: string;
  description: string | null;
  ambiguityType: AmbiguityType;
  sourceTranscriptSegmentId: string | null;
  sourceQuote: string | null;
  priority: ThreadPriority;
}

/**
 * Reconciles by normalized label, meeting-scoped (ambiguity flags have no
 * separate parent model the way workflow items have `workflows` - they
 * hang directly off the meeting). Nothing is ever deleted. Once a human has
 * resolved or dismissed a flag, a later extraction run never rewrites its
 * text or reopens it - mirrors how workflow_gaps protects a non-"open"
 * gap's wording, just without the separate lock/human-edit machinery
 * workflow items have, since this schema is deliberately simpler.
 */
export async function reconcileAmbiguityFlags(
  meetingId: string,
  drafts: AmbiguityFlagDraft[]
): Promise<void> {
  if (drafts.length === 0) return;

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("ambiguity_flags")
    .select("*")
    .eq("meeting_id", meetingId);

  if (existingError) {
    throw new Error(`Failed to load existing ambiguity flags: ${existingError.message}`);
  }

  const existingByNormalized = new Map((existing ?? []).map((f) => [f.normalized_label, f]));

  for (const draft of drafts) {
    const normalizedLabel = normalize(draft.label);
    const match = existingByNormalized.get(normalizedLabel);

    if (match) {
      if (match.status !== "open") continue;

      const { error } = await supabase
        .from("ambiguity_flags")
        .update({
          label: draft.label,
          description: draft.description,
          ambiguity_type: draft.ambiguityType,
          source_transcript_segment_id: draft.sourceTranscriptSegmentId,
          source_quote: draft.sourceQuote,
          priority: draft.priority,
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update ambiguity flag: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("ambiguity_flags").insert({
      meeting_id: meetingId,
      label: draft.label,
      normalized_label: normalizedLabel,
      description: draft.description,
      ambiguity_type: draft.ambiguityType,
      source_transcript_segment_id: draft.sourceTranscriptSegmentId,
      source_quote: draft.sourceQuote,
      priority: draft.priority,
    });

    if (error) {
      throw new Error(`Failed to create ambiguity flag: ${error.message}`);
    }
  }
}

export async function getAmbiguityFlagWithMeeting(
  flagId: string
): Promise<{ flag: AmbiguityFlag; meetingId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ambiguity_flags")
    .select("*")
    .eq("id", flagId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load ambiguity flag: ${error.message}`);
  }
  if (!data) return null;

  return { flag: data, meetingId: data.meeting_id };
}

async function setAmbiguityFlagStatus(
  flagId: string,
  status: "resolved" | "dismissed"
): Promise<AmbiguityFlag> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ambiguity_flags")
    .update({ status })
    .eq("id", flagId)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update ambiguity flag: ${error.message}`);
  }
  if (!data) throw new Error("Ambiguity flag not found");

  return data;
}

/** The facilitator has since clarified this point - resolves it without deleting the record of what was ambiguous. */
export async function resolveAmbiguityFlag(flagId: string): Promise<AmbiguityFlag> {
  return setAmbiguityFlagStatus(flagId, "resolved");
}

/** The facilitator has decided this ambiguity isn't worth pursuing - sets it aside without deleting it. */
export async function dismissAmbiguityFlag(flagId: string): Promise<AmbiguityFlag> {
  return setAmbiguityFlagStatus(flagId, "dismissed");
}

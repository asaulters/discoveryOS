import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ConfidenceLevel, Hypothesis } from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getHypothesesForMeeting(meetingId: string): Promise<Hypothesis[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("hypotheses")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load hypotheses: ${error.message}`);
  }

  return data ?? [];
}

export interface HypothesisDraft {
  statement: string;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Regenerating a brief updates existing hypotheses (matched by normalized
 * statement) in place rather than duplicating them, and inserts anything
 * new. Nothing is ever deleted, so prior generations stay in history.
 */
export async function reconcileHypotheses(
  meetingId: string,
  drafts: HypothesisDraft[]
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const existing = await getHypothesesForMeeting(meetingId);
  const existingByNormalized = new Map(existing.map((h) => [normalize(h.statement), h]));

  for (const draft of drafts) {
    const match = existingByNormalized.get(normalize(draft.statement));

    if (match) {
      const { error } = await supabase
        .from("hypotheses")
        .update({ confidence_level: draft.confidenceLevel })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update hypothesis: ${error.message}`);
      }
    } else {
      const { error } = await supabase.from("hypotheses").insert({
        meeting_id: meetingId,
        statement: draft.statement,
        confidence_level: draft.confidenceLevel,
      });

      if (error) {
        throw new Error(`Failed to create hypothesis: ${error.message}`);
      }
    }
  }
}

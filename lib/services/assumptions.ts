import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Assumption } from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function getAssumptionsForMeeting(meetingId: string): Promise<Assumption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assumptions")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load assumptions: ${error.message}`);
  }

  return data ?? [];
}

/**
 * The Setup Analyst can surface assumptions the team appears to be making
 * beyond what was explicitly entered at setup. New ones are added; ones
 * that already match an existing assumption (by normalized text) are left
 * as-is so the facilitator's own confidence rating isn't overwritten.
 */
export async function addSuggestedAssumptions(
  meetingId: string,
  statements: string[]
): Promise<void> {
  if (statements.length === 0) return;

  const supabase = await createServerSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from("assumptions")
    .select("text")
    .eq("meeting_id", meetingId);

  if (fetchError) {
    throw new Error(`Failed to load existing assumptions: ${fetchError.message}`);
  }

  const existingNormalized = new Set((existing ?? []).map((a) => normalize(a.text)));
  const newStatements = statements.filter((s) => !existingNormalized.has(normalize(s)));

  if (newStatements.length === 0) return;

  const { error: insertError } = await supabase.from("assumptions").insert(
    newStatements.map((text) => ({
      meeting_id: meetingId,
      text,
      confidence_level: "unclear" as const,
    }))
  );

  if (insertError) {
    throw new Error(`Failed to add suggested assumptions: ${insertError.message}`);
  }
}

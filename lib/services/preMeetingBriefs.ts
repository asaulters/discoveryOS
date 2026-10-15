import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppliedAiBrief, PreMeetingBrief } from "@/lib/types/database";

export interface CreatePreMeetingBriefInput {
  meetingId: string;
  briefSummary: string;
  suggestedOpening: string;
  recommendedFocus: string;
  mustLearn: string[];
  riskFocus: string[];
  buildDirectionWarning: string | null;
  /** Sprint 25: null for every non-applied_ai_discovery meeting. */
  appliedAiBrief: AppliedAiBrief | null;
}

/** Every generation inserts a new row - regenerate never overwrites or deletes prior briefs. */
export async function createPreMeetingBrief(
  input: CreatePreMeetingBriefInput
): Promise<PreMeetingBrief> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("pre_meeting_briefs")
    .insert({
      meeting_id: input.meetingId,
      brief_summary: input.briefSummary,
      suggested_opening: input.suggestedOpening,
      recommended_focus: input.recommendedFocus,
      must_learn: input.mustLearn,
      risk_focus: input.riskFocus,
      build_direction_warning: input.buildDirectionWarning,
      applied_ai_brief: input.appliedAiBrief,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to save pre-meeting brief: ${error?.message}`);
  }

  return data;
}

export async function getLatestPreMeetingBrief(
  meetingId: string
): Promise<PreMeetingBrief | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("pre_meeting_briefs")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load pre-meeting brief: ${error.message}`);
  }

  return data;
}

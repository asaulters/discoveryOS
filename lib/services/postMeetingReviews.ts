import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  AssumptionUpdateItem,
  BuildDirectionAssessment,
  KeyLearning,
  OpenQuestionItem,
  PostMeetingReview,
  RecommendedFollowup,
  RiskItem,
} from "@/lib/types/database";

export interface PostMeetingReviewDraft {
  summary: string;
  keyLearnings: KeyLearning[];
  openQuestions: OpenQuestionItem[];
  workflowSummary: string;
  knownFacts: string[];
  inferences: string[];
  assumptionUpdates: AssumptionUpdateItem[];
  buildDirectionAssessment: BuildDirectionAssessment;
  recommendedFollowups: RecommendedFollowup[];
  risks: RiskItem[];
}

/**
 * Always inserts a new row - regenerating a review is never an update.
 * Nothing here ever deletes or overwrites a prior review, matching every
 * other reconcile/persist pattern in this app; review history is kept so a
 * facilitator can compare how the understanding evolved across
 * regenerations.
 */
export async function createPostMeetingReview(
  meetingId: string,
  draft: PostMeetingReviewDraft
): Promise<PostMeetingReview> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("post_meeting_reviews")
    .insert({
      meeting_id: meetingId,
      summary: draft.summary,
      key_learnings: draft.keyLearnings,
      open_questions: draft.openQuestions,
      workflow_summary: draft.workflowSummary,
      known_facts: draft.knownFacts,
      inferences: draft.inferences,
      assumption_updates: draft.assumptionUpdates,
      build_direction_assessment: draft.buildDirectionAssessment,
      recommended_followups: draft.recommendedFollowups,
      risks: draft.risks,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to save post-meeting review: ${error?.message}`);
  }

  return data;
}

export async function getLatestPostMeetingReview(
  meetingId: string
): Promise<PostMeetingReview | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("post_meeting_reviews")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load post-meeting review: ${error.message}`);
  }

  return data;
}

/** Full review history for the meeting, newest first - not yet surfaced in the UI beyond "latest", but kept queryable since reviews are never overwritten. */
export async function getPostMeetingReviewsForMeeting(
  meetingId: string
): Promise<PostMeetingReview[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("post_meeting_reviews")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("generated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load post-meeting reviews: ${error.message}`);
  }

  return data ?? [];
}

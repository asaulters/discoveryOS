import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function logUserAction(
  meetingId: string,
  actionType: string,
  payload: Record<string, unknown> = {}
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("user_actions").insert({
    meeting_id: meetingId,
    action_type: actionType,
    payload,
  });

  if (error) {
    throw new Error(`Failed to log user action "${actionType}": ${error.message}`);
  }
}

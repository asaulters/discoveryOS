import "server-only";
import { getAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrackerError, getTracker } from "@/lib/services/tracker";
import { mapSources, sourceKey } from "@/lib/tracker/sources";
import { entityId, sendBatch } from "@/lib/tracker/validation";

export async function getMeetingProjectItems(meetingId: string) {
  entityId.parse(meetingId);
  const db = await createServerSupabaseClient();
  const meeting = await db
    .from("meetings")
    .select("id,project_id,meeting_type")
    .eq("id", meetingId)
    .maybeSingle();
  if (meeting.error) throw new TrackerError(meeting.error.message, 500);
  if (!meeting.data) throw new TrackerError("Meeting not found", 404);
  const [review, workflow, mismatches, assessment, tracker] = await Promise.all(
    [
      db
        .from("post_meeting_reviews")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("generated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("workflows")
        .select("id")
        .eq("meeting_id", meetingId)
        .maybeSingle(),
      db
        .from("contradiction_candidates")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at"),
      meeting.data.meeting_type === "applied_ai_discovery"
        ? db
            .from("ai_run_logs")
            .select("id,output")
            .eq("meeting_id", meetingId)
            .eq("run_type", "applied_ai_opportunity_assessment")
            .in("status", ["succeeded", "retry_succeeded"])
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      getTracker(),
    ],
  );
  for (const r of [review, workflow, mismatches, assessment])
    if (r.error) throw new TrackerError(r.error.message, 500);
  const gaps = workflow.data
    ? await db
        .from("workflow_gaps")
        .select("*")
        .eq("workflow_id", workflow.data.id)
        .order("created_at")
    : { data: [], error: null };
  if (gaps.error) throw new TrackerError(gaps.error.message, 500);
  const sources = mapSources({
    review: review.data,
    gaps: gaps.data!,
    mismatches: mismatches.data!,
    assessment: assessment.data,
  });
  const projects = new Map(tracker.projects.map((p) => [p.id, p]));
  const packages = new Map(tracker.workPackages.map((w) => [w.id, w]));
  const sent = new Map<string, string>();
  for (const row of [
    ...tracker.workPackages,
    ...tracker.tasks,
    ...tracker.raidItems,
  ]) {
    if (!row.archived_at && row.source_type && row.source_item_id) {
      const projectId =
        typeof row.work_package_id === "string"
          ? packages.get(row.work_package_id)?.project_id
          : typeof row.project_id === "string" ? row.project_id : null;
      if (projectId)
        sent.set(
          sourceKey({
            source_type: row.source_type,
            source_item_id: row.source_item_id,
            source_item_key: row.source_item_key,
          }),
          projectId,
        );
    }
  }
  return {
    meetingProjectId: meeting.data.project_id,
    projects: tracker.projects.filter((p) => !p.archived_at),
    workPackages: tracker.workPackages.filter((w) => !w.archived_at),
    sources: sources.map((s) => {
      const p = projects.get(sent.get(sourceKey(s)) ?? "");
      return { ...s, ...(p ? { alreadyIn: { id: p.id, name: p.name } } : {}) };
    }),
  };
}
export async function sendMeetingItems(meetingId: string, body: unknown) {
  entityId.parse(meetingId);
  const auth = await getAuth();
  if (!auth.userId) throw new TrackerError("Sign in required", 401);
  if (auth.role !== "owner") throw new TrackerError("Owner role required", 403);
  const input = sendBatch.parse(body),
    db = await createServerSupabaseClient();
  const result = await db.rpc("send_to_project", {
    p_meeting_id: meetingId,
    p_project_id: input.project_id,
    p_items: input.items,
    p_work_package_id: input.work_package_id ?? null,
  });
  if (result.error)
    throw new TrackerError(
      result.error.code === "23505"
        ? "An item was already sent. Refresh the selection and try again; nothing in this batch was inserted."
        : result.error.message,
      result.error.code === "42501"
        ? 403
        : result.error.code === "23505"
          ? 409
          : 400,
    );
  return result.data;
}

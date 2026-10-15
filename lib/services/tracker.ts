import "server-only";
import { getAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  TrackerData,
  Project,
  WorkPackage,
  Task,
  RaidItem,
} from "@/lib/tracker/types";
import {
  projectCreate,
  projectPatch,
  packageCreate,
  packagePatch,
  taskCreate,
  taskPatch,
  entityId,
  raidCreate,
  raidPatch,
} from "@/lib/tracker/validation";

export class TrackerError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function check(error: { message: string; code?: string } | null) {
  if (error)
    throw new TrackerError(
      error.message,
      error.code === "23505"
        ? 409
        : error.code === "42501"
          ? 403
          : ["23514", "23503", "22P02", "22023"].includes(error.code ?? "")
            ? 400
            : 500,
    );
}
// PostgREST caps each response. Page through rows so counts and My week never
// silently omit tasks once a tracker grows beyond the server's default limit.
async function allRows<T>(query: {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string; code?: string } | null;
  }>;
}) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query.range(offset, offset + 499);
    check(page.error);
    rows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < 500) return rows;
  }
}
export async function getTracker(projectId?: string): Promise<TrackerData> {
  const db = await createServerSupabaseClient();
  let query = db
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  if (projectId) query = query.eq("id", entityId.parse(projectId));
  const projects = await allRows<Project>(query);
  const ids = projects.map((p) => p.id);
  if (!ids.length)
    return {
      projects: [],
      workPackages: [],
      tasks: [],
      events: [],
      raidItems: [],
      meetings: [],
    };
  const packages = await allRows<WorkPackage>(
    db
      .from("work_packages")
      .select("*")
      .in("project_id", ids)
      .order("sort_order")
      .order("created_at")
      .order("id"),
  );
  const packageIds = packages.map((w) => w.id);
  const tasks = packageIds.length
    ? await allRows<Task>(
        db
          .from("tasks")
          .select("*")
          .in("work_package_id", packageIds)
          .order("sort_order")
          .order("created_at")
          .order("id"),
      )
    : [];
  const events = projectId
    ? await db
        .from("project_events")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  check(events.error);
  const raidItems = await allRows<RaidItem>(
    db
      .from("raid_items")
      .select("*")
      .in("project_id", ids)
      .order("created_at")
      .order("id"),
  );
  const meetings = await allRows<TrackerData["meetings"][number]>(
    db
      .from("meetings")
      .select("id,name,project_id")
      .in("project_id", ids)
      .order("created_at")
      .order("id"),
  );
  return {
    projects,
    workPackages: packages,
    tasks,
    events: events.data!,
    raidItems,
    meetings,
  };
}
export async function mutateTracker(
  kind: "project" | "package" | "task" | "raid",
  body: unknown,
  id?: string,
) {
  const auth = await getAuth();
  if (!auth.userId) throw new TrackerError("Sign in required", 401);
  if (auth.role !== "owner") throw new TrackerError("Owner role required", 403);
  if (id) entityId.parse(id);
  const db = await createServerSupabaseClient();
  if (kind === "raid") {
    const existing = id
      ? await db
          .from("raid_items")
          .select("project_id")
          .eq("id", id)
          .maybeSingle()
      : null;
    if (existing) check(existing.error);
    if (id && !existing?.data)
      throw new TrackerError("RAID item not found", 404);
    const projectId =
      existing?.data?.project_id ?? raidCreate.parse(body).project_id;
    const parent = await db
      .from("projects")
      .select("archived_at")
      .eq("id", projectId)
      .maybeSingle();
    check(parent.error);
    if (!parent.data || parent.data.archived_at)
      throw new TrackerError("Choose an active project", 409);
    if (!id) {
      const r = await db
        .from("raid_items")
        .insert(raidCreate.parse(body))
        .select()
        .single();
      check(r.error);
      return r.data;
    }
    const { archived, ...fields } = raidPatch.parse(body);
    const r = await db
      .from("raid_items")
      .update({
        ...fields,
        ...(archived === undefined
          ? {}
          : { archived_at: archived ? new Date().toISOString() : null }),
      })
      .eq("id", id)
      .select()
      .single();
    check(r.error);
    return r.data;
  }
  if (kind === "project") {
    if (!id) {
      const input = projectCreate.parse(body);
      const r = await db.from("projects").insert(input).select().single();
      check(r.error);
      return r.data;
    }
    const { archived, ...fields } = projectPatch.parse(body);
    const r = await db
      .from("projects")
      .update({
        ...fields,
        ...(archived === undefined
          ? {}
          : { archived_at: archived ? new Date().toISOString() : null }),
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    check(r.error);
    if (!r.data) throw new TrackerError("Project not found", 404);
    return r.data;
  }
  if (kind === "package") {
    const existing = id
      ? await db
          .from("work_packages")
          .select("project_id")
          .eq("id", id)
          .maybeSingle()
      : null;
    if (existing) check(existing.error);
    if (id && !existing?.data)
      throw new TrackerError("Work package not found", 404);
    const input = id ? packagePatch.parse(body) : packageCreate.parse(body);
    const projectId =
      existing?.data?.project_id ?? packageCreate.parse(body).project_id;
    const parent = await db
      .from("projects")
      .select("archived_at")
      .eq("id", projectId)
      .maybeSingle();
    check(parent.error);
    if (!parent.data) throw new TrackerError("Project not found", 404);
    if (parent.data.archived_at)
      throw new TrackerError(
        "Restore the project before changing its work packages",
        409,
      );
    if (!id) {
      const r = await db
        .from("work_packages")
        .insert(packageCreate.parse(body))
        .select()
        .single();
      check(r.error);
      return r.data;
    }
    const { archived, ...fields } = packagePatch.parse(input);
    const r = await db
      .from("work_packages")
      .update({
        ...fields,
        ...(archived === undefined
          ? {}
          : { archived_at: archived ? new Date().toISOString() : null }),
      })
      .eq("id", id)
      .select()
      .single();
    check(r.error);
    return r.data;
  }
  const input = id ? taskPatch.parse(body) : taskCreate.parse(body);
  const existing = id
    ? await db
        .from("tasks")
        .select("work_package_id,status,blocked_reason")
        .eq("id", id)
        .maybeSingle()
    : null;
  if (existing) check(existing.error);
  if (id && !existing?.data) throw new TrackerError("Task not found", 404);
  const packageId =
    existing?.data?.work_package_id ?? taskCreate.parse(body).work_package_id;
  const parent = await db
    .from("work_packages")
    .select("project_id,archived_at")
    .eq("id", packageId)
    .maybeSingle();
  check(parent.error);
  if (!parent.data) throw new TrackerError("Work package not found", 404);
  const project = await db
    .from("projects")
    .select("archived_at")
    .eq("id", parent.data.project_id)
    .maybeSingle();
  check(project.error);
  if (parent.data.archived_at || project.data?.archived_at)
    throw new TrackerError(
      "Restore the project and work package before changing tasks",
      409,
    );
  const status = input.status ?? existing?.data?.status ?? "todo";
  const reason =
    input.blocked_reason === undefined
      ? existing?.data?.blocked_reason
      : input.blocked_reason;
  if (status === "blocked" && !reason?.trim())
    throw new TrackerError("A blocked task needs a blocked reason", 400);
  if (!id) {
    const r = await db
      .from("tasks")
      .insert(taskCreate.parse(body))
      .select()
      .single();
    check(r.error);
    return r.data;
  }
  const { archived, ...fields } = taskPatch.parse(input);
  const r = await db
    .from("tasks")
    .update({
      ...fields,
      ...(archived === undefined
        ? {}
        : { archived_at: archived ? new Date().toISOString() : null }),
    })
    .eq("id", id)
    .select()
    .single();
  check(r.error);
  return r.data;
}

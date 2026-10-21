import "server-only";
import { getAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrackerError } from "./tracker";
import {
  buildUpdatePlan,
  type UpdateSnapshot,
} from "@/lib/tracker/project-updates";
export async function projectCsvState(projectId: string, write = false) {
  const auth = await getAuth();
  if (!auth.userId) throw new TrackerError("Sign in required", 401);
  if (!auth.role || (write && auth.role !== "owner"))
    throw new TrackerError("Owner role required", 403);
  const db = await createServerSupabaseClient();
  const result = await db.rpc("get_project_csv_state", {
    p_project_id: projectId,
  });
  if (result.error)
    throw new TrackerError(
      result.error.message,
      result.error.code === "42501" ? 403 : 400,
    );
  const state = result.data as unknown as {
    snapshot: UpdateSnapshot;
    revision: string;
  };
  if (!state.snapshot.projects.length)
    throw new TrackerError("Project not found", 404);
  return { db, ...state };
}
export function prepareProjectCsv(
  csv: string,
  snapshot: UpdateSnapshot,
  date: string,
) {
  try {
    return buildUpdatePlan(csv, snapshot, date);
  } catch (error) {
    throw new TrackerError(
      error instanceof Error ? error.message : "Invalid update CSV",
      400,
    );
  }
}

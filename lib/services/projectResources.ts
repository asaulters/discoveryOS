import "server-only";
import { randomUUID } from "node:crypto";
import { getAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TrackerError } from "./tracker";
import { entityId } from "@/lib/tracker/validation";
import {
  attachmentInput,
  attachmentPatch,
  PROJECT_FILE_BUCKET,
  MAX_PROJECT_FILE_BYTES,
  safeFilename,
} from "@/lib/tracker/resources";
import type { ProjectAttachment } from "@/lib/tracker/types";
function check(error: { message: string } | null) {
  if (error) throw new TrackerError(error.message, 400);
}
async function context(projectId: string, write = false) {
  entityId.parse(projectId);
  const auth = await getAuth();
  if (!auth.userId) throw new TrackerError("Sign in required", 401);
  if (write && auth.role !== "owner")
    throw new TrackerError("Owner role required", 403);
  const db = await createServerSupabaseClient(),
    project = await db
      .from("projects")
      .select("id,archived_at")
      .eq("id", projectId)
      .maybeSingle();
  check(project.error);
  if (!project.data) throw new TrackerError("Project not found", 404);
  if (write && project.data.archived_at)
    throw new TrackerError(
      "Restore the project before changing its resources",
      409,
    );
  return db;
}
export async function listProjectResources(projectId: string) {
  const db = await context(projectId),
    rows: ProjectAttachment[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await db
      .from("project_attachments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    check(r.error);
    rows.push(...r.data!);
    if (r.data!.length < 500) return rows;
  }
}
export async function addProjectResource(projectId: string, body: unknown) {
  const db = await context(projectId, true),
    input = attachmentInput.parse(body),
    id = randomUUID();
  const r = await db
    .from("project_attachments")
    .insert({
      id,
      project_id: projectId,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      ...(input.kind === "file"
        ? {
            storage_path: `${projectId}/${id}/${safeFilename(input.name)}`,
            size_bytes: input.size_bytes,
            content_type: input.content_type || "application/octet-stream",
            state: "pending",
          }
        : { url: input.url, state: "ready" }),
    })
    .select()
    .single();
  check(r.error);
  return r.data;
}
export async function changeProjectResource(
  projectId: string,
  id: string,
  body: unknown,
) {
  entityId.parse(id);
  const db = await context(projectId, true),
    input = attachmentPatch.parse(body);
  const r = await db
    .from("project_attachments")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  check(r.error);
  if (!r.data) throw new TrackerError("Resource not found", 404);
  if ("action" in input) {
    if (r.data.kind !== "file" || r.data.archived_at)
      throw new TrackerError("Choose an active file upload", 400);
    const file = await db.storage
      .from(PROJECT_FILE_BUCKET)
      .info(r.data.storage_path!);
    check(file.error);
    const actualSize = file.data?.size ?? file.data?.metadata?.size;
    if (
      !actualSize ||
      actualSize > MAX_PROJECT_FILE_BYTES ||
      actualSize !== r.data.size_bytes
    )
      throw new TrackerError(
        "Uploaded file size does not match. Choose the file again or archive this incomplete upload.",
        400,
      );
    const saved = await db
      .from("project_attachments")
      .update({
        state: "ready",
        content_type:
          file.data?.contentType ||
          file.data?.metadata?.mimetype ||
          "application/octet-stream",
      })
      .eq("id", id)
      .eq("project_id", projectId)
      .select()
      .single();
    check(saved.error);
    return saved.data;
  }
  const saved = await db
    .from("project_attachments")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", projectId)
    .select()
    .single();
  check(saved.error);
  return saved.data;
}
export async function projectResourceDownload(projectId: string, id: string) {
  entityId.parse(id);
  const db = await context(projectId);
  const r = await db
    .from("project_attachments")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  check(r.error);
  if (
    !r.data ||
    r.data.archived_at ||
    r.data.state !== "ready" ||
    r.data.kind !== "file"
  )
    throw new TrackerError("File not found", 404);
  const result = await db.storage
    .from(PROJECT_FILE_BUCKET)
    .createSignedUrl(r.data.storage_path!, 60, { download: r.data.name });
  check(result.error);
  return { url: result.data!.signedUrl };
}

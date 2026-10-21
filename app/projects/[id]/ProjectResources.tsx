"use client";
import ReadableText from "@/app/tracker/ReadableText";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { OwnerOnly } from "@/app/RoleControls";
import type { Project, ProjectAttachment } from "@/lib/tracker/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  PROJECT_FILE_BUCKET,
  MAX_PROJECT_FILE_BYTES,
} from "@/lib/tracker/resources";
import {
  RecordForm,
  useTracker,
  buttonClass,
  inputClass,
  panelClass,
} from "@/app/tracker/shared";
async function request(path: string, method = "GET", body?: object) {
  const r = await fetch(path, {
      method,
      cache: "no-store",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    }),
    data = await r.json();
  if (!r.ok) throw new Error(data.error || "Could not save project resource");
  return data;
}
export default function ProjectResources({
  project,
  tracker,
  showArchived,
}: {
  project: Project;
  tracker: ReturnType<typeof useTracker>;
  showArchived: boolean;
}) {
  const base = `/api/projects/${project.id}/resources`,
    [rows, setRows] = useState<ProjectAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<"file" | "link" | null>(null),
    [editingNotes, setEditingNotes] = useState(false);
  const load = useCallback(async () => {
    setRows(await request(base));
  }, [base]);
  useEffect(() => {
    let active = true;
    request(base)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      await tracker.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resource request failed");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    await action(async () => {
      if (mode === "link")
        await request(base, "POST", {
          kind: "link",
          name: data.get("name"),
          url: data.get("url"),
          description: data.get("description") || null,
        });
      else {
        const file = data.get("file") as File;
        if (!file?.size || file.size > MAX_PROJECT_FILE_BYTES)
          throw new Error("Choose a nonempty file up to 25 MB");
        const attachment: ProjectAttachment = await request(base, "POST", {
          kind: "file",
          name: file.name,
          size_bytes: file.size,
          content_type: file.type || "application/octet-stream",
          description: data.get("description") || null,
        });
        const db = createBrowserSupabaseClient(),
          uploaded = await db.storage
            .from(PROJECT_FILE_BUCKET)
            .upload(attachment.storage_path!, file, {
              upsert: false,
              contentType: file.type || "application/octet-stream",
            });
        if (uploaded.error)
          throw new Error(
            `Upload failed: ${uploaded.error.message}. You can finish or archive the incomplete entry below.`,
          );
        await request(`${base}/${attachment.id}`, "PATCH", {
          action: "complete",
        });
      }
      form.reset();
      setMode(null);
    });
  }
  return (
    <section
      className={`${panelClass} mb-8`}
      aria-label="Project notes and resources"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Project notes</h2>
        <OwnerOnly>
          <button
            className={buttonClass}
            disabled={busy || !!project.archived_at}
            onClick={() => setEditingNotes(!editingNotes)}
          >
            {editingNotes ? "Cancel notes" : "Edit notes"}
          </button>
        </OwnerOnly>
      </div>
      {editingNotes ? (
        <div className="my-4">
          <p className="mb-3 text-sm text-neutral-500">
            Use headings (#), bullet lists (-), **bold**, links, and tables to
            organize your notes.
          </p>
          <RecordForm
            fields={[
              { name: "notes", label: "Project notes", type: "textarea" },
            ]}
            values={{ notes: project.notes }}
            busy={tracker.busy}
            save={async (values) => {
              if (
                await tracker.mutate(
                  `/api/projects/${project.id}`,
                  "PATCH",
                  values,
                )
              )
                setEditingNotes(false);
            }}
          />
        </div>
      ) : (
        <ReadableText className="my-4">
          {project.notes || "Keep build notes and project context here."}
        </ReadableText>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Files and links</h2>
        <OwnerOnly>
          <button
            className={buttonClass}
            disabled={busy || !!project.archived_at}
            onClick={() => setMode(mode === "file" ? null : "file")}
          >
            Attach file
          </button>
          <button
            className={buttonClass}
            disabled={busy || !!project.archived_at}
            onClick={() => setMode(mode === "link" ? null : "link")}
          >
            Add link
          </button>
        </OwnerOnly>
      </div>
      <p className="my-2 text-xs text-neutral-500">
        Project documents, slide decks and reference links. Files up to 25 MB;
        available to signed-in owners and viewers.
      </p>
      {error && (
        <p role="alert" className="my-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <OwnerOnly>
        {mode && (
          <form className="my-4 space-y-3 rounded border p-3" onSubmit={add}>
            <fieldset
              disabled={busy || !!project.archived_at}
              className="space-y-3"
            >
              {mode === "file" ? (
                <label className="block text-sm">
                  Project file
                  <input
                    className={inputClass}
                    type="file"
                    name="file"
                    required
                  />
                </label>
              ) : (
                <>
                  <label className="block text-sm">
                    Link name
                    <input
                      className={inputClass}
                      name="name"
                      maxLength={500}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    Document URL
                    <input
                      className={inputClass}
                      name="url"
                      type="url"
                      placeholder="https://…"
                      required
                    />
                  </label>
                </>
              )}
              <label className="block text-sm">
                Description (optional)
                <textarea
                  className={inputClass}
                  name="description"
                  rows={2}
                  maxLength={20000}
                />
              </label>
              <button className={buttonClass}>
                {busy
                  ? "Saving…"
                  : mode === "file"
                    ? "Upload file"
                    : "Save link"}
              </button>
            </fieldset>
          </form>
        )}
      </OwnerOnly>
      <ul className="mt-4 space-y-3">
        {rows
          .filter((r) => showArchived || !r.archived_at)
          .map((r) => (
            <li key={r.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="mr-auto font-medium">
                  {r.name}
                  {r.archived_at
                    ? " · Archived"
                    : r.state === "pending"
                      ? " · Upload incomplete"
                      : ""}
                </span>
                {!r.archived_at &&
                  r.state === "ready" &&
                  (r.kind === "link" ? (
                    <a
                      className="underline"
                      href={r.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open link
                    </a>
                  ) : (
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() =>
                        action(async () => {
                          const data = await request(
                            `${base}/${r.id}/download`,
                          );
                          window.location.assign(data.url);
                        })
                      }
                    >
                      Download
                    </button>
                  ))}
                <OwnerOnly>
                  {r.state === "pending" && !r.archived_at && (
                    <button
                      className="underline"
                      disabled={busy || !!project.archived_at}
                      onClick={() =>
                        action(() =>
                          request(`${base}/${r.id}`, "PATCH", {
                            action: "complete",
                          }),
                        )
                      }
                    >
                      Finish upload
                    </button>
                  )}
                  <button
                    className="underline text-neutral-500"
                    disabled={busy || !!project.archived_at}
                    onClick={() =>
                      action(() =>
                        request(`${base}/${r.id}`, "PATCH", {
                          archived: !r.archived_at,
                        }),
                      )
                    }
                  >
                    {r.archived_at ? "Restore resource" : "Archive resource"}
                  </button>
                </OwnerOnly>
              </div>
              {r.description && (
                <ReadableText className="mt-2">{r.description}</ReadableText>
              )}
              {r.kind === "file" && (
                <p className="mt-1 text-xs text-neutral-500">
                  {((r.size_bytes || 0) / 1024).toFixed(1)} KB
                </p>
              )}
            </li>
          ))}
      </ul>
      {!rows.some((r) => showArchived || !r.archived_at) && (
        <p className="mt-3 text-sm text-neutral-500">
          No project files or links yet.
        </p>
      )}
    </section>
  );
}

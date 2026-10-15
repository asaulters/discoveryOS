"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OwnerOnly } from "@/app/RoleControls";
import { sourceKey, type SendSource } from "@/lib/tracker/sources";
import type { Project, WorkPackage, Certainty } from "@/lib/tracker/types";
import Evidence from "@/app/tracker/Evidence";
import {
  buttonClass,
  inputClass,
  panelClass,
  primaryClass,
} from "@/app/tracker/shared";
type Catalog = {
  meetingProjectId: string | null;
  projects: Project[];
  workPackages: WorkPackage[];
  sources: SendSource[];
};
export default function SendToProject({ meetingId }: { meetingId: string }) {
  return (
    <OwnerOnly>
      <SendPanel meetingId={meetingId} />
    </OwnerOnly>
  );
}
function SendPanel({ meetingId }: { meetingId: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [project, setProject] = useState(""),
    [wp, setWp] = useState("");
  const [selected, setSelected] = useState<Record<string, SendSource>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{
    project_id: string;
    has_decision: boolean;
  } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/meetings/${meetingId}/project-items`),
      data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not load meeting items");
    setCatalog(data);
    setProject((p) => p || data.meetingProjectId || "");
  }, [meetingId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/meetings/${meetingId}/project-items`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "Could not load meeting items");
        return data as Catalog;
      })
      .then((data) => {
        if (active) {
          setCatalog(data);
          setProject((p) => p || data.meetingProjectId || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [meetingId]);
  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/meetings/${meetingId}/send-to-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project,
          work_package_id: wp || null,
          items: Object.values(selected).map((s) => ({
            source_type: s.source_type,
            source_item_id: s.source_item_id,
            source_item_key: s.source_item_key,
            title: s.title,
            certainty: s.certainty,
          })),
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Send failed");
      setSent(result);
      setSelected({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`${panelClass} my-6`}>
      <h2 className="font-semibold">Send to project</h2>
      <p className="my-2 text-sm text-neutral-500">
        Choose the items to copy. Evidence is preserved; sending does not change
        the project stage.
      </p>
      {error && (
        <p role="alert" className="my-2 text-red-700">
          {error}
        </p>
      )}
      <button
        className={buttonClass}
        disabled={busy}
        onClick={() => {
          setSelected({});
          load().catch((e) => setError(e.message));
        }}
      >
        Refresh items
      </button>
      {catalog && (
        <>
          <label className="my-3 block text-sm">
            Project
            <select
              className={inputClass}
              aria-label="Project"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setWp("");
              }}
            >
              <option value="">Choose project</option>
              {catalog.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <form
            className="my-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                name = new FormData(form).get("name");
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/projects", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                  }),
                  data = await r.json();
                if (!r.ok) throw new Error(data.error);
                await load();
                setProject(data.id);
                setWp("");
                form.reset();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not create project",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              name="name"
              aria-label="New project name"
              placeholder="New project name"
              className={inputClass}
              required
              maxLength={500}
            />
            <button className={buttonClass} disabled={busy}>
              Create project
            </button>
          </form>
          <label className="mb-4 block text-sm">
            Work package for tasks
            <select
              className={inputClass}
              aria-label="Work package for tasks"
              value={wp}
              onChange={(e) => setWp(e.target.value)}
            >
              <option value="">Discovery follow-ups (reuse or create)</option>
              {catalog.workPackages
                .filter((w) => w.project_id === project)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>
          {(["task", "package", "raid"] as const).map((target) => (
            <fieldset key={target} disabled={busy} className="my-5">
              <legend className="font-medium">
                {target === "task"
                  ? "Tasks"
                  : target === "package"
                    ? "Work packages"
                    : "RAID items"}
              </legend>
              {catalog.sources
                .filter((s) => s.target === target)
                .map((s) => {
                  const key = sourceKey(s),
                    edit = selected[key];
                  return (
                    <div key={key} className="my-3 rounded border p-3">
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={!!edit}
                          disabled={!!s.alreadyIn}
                          onChange={(e) =>
                            setSelected((old) => {
                              const next = { ...old };
                              if (e.target.checked) next[key] = { ...s };
                              else delete next[key];
                              return next;
                            })
                          }
                        />
                        {s.title}
                      </label>
                      {s.alreadyIn && (
                        <Link
                          className="text-sm underline"
                          href={`/projects/${s.alreadyIn.id}`}
                        >
                          Already in {s.alreadyIn.name}
                        </Link>
                      )}
                      {edit && (
                        <div className="mt-3 space-y-2">
                          <label className="block text-sm">
                            Title
                            <input
                              className={inputClass}
                              maxLength={500}
                              value={edit.title}
                              onChange={(e) =>
                                setSelected((old) => ({
                                  ...old,
                                  [key]: { ...edit, title: e.target.value },
                                }))
                              }
                            />
                          </label>
                          <p className="whitespace-pre-wrap text-sm">
                            {s.detail}
                          </p>
                          <label className="block text-sm">
                            Certainty
                            <select
                              className={inputClass}
                              aria-label="Certainty"
                              value={edit.certainty}
                              onChange={(e) =>
                                setSelected((old) => ({
                                  ...old,
                                  [key]: {
                                    ...edit,
                                    certainty: e.target.value as Certainty,
                                  },
                                }))
                              }
                            >
                              {["known", "inferred", "unknown"].map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </label>
                          <Evidence
                            item={{ ...edit, source_meeting_id: meetingId }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </fieldset>
          ))}
          {!catalog.sources.length && (
            <p className="my-4 text-sm">
              No review or workflow items available yet.
            </p>
          )}
          <button
            className={primaryClass}
            disabled={
              busy ||
              !project ||
              !Object.keys(selected).length ||
              Object.values(selected).some((s) => !s.title.trim())
            }
            onClick={send}
          >
            {busy
              ? "Sending…"
              : `Send ${Object.keys(selected).length} selected items`}
          </button>
        </>
      )}
      {sent && (
        <div role="status" className="mt-4">
          <Link className="underline" href={`/projects/${sent.project_id}`}>
            Open project
          </Link>
          {sent.has_decision && (
            <button
              className={`${buttonClass} ml-3`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await fetch(`/api/projects/${sent.project_id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stage: "decide" }),
                  });
                  if (!r.ok) throw new Error((await r.json()).error);
                  setSent({ ...sent, has_decision: false });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not change stage",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Move project to Decide?
            </button>
          )}
        </div>
      )}
    </section>
  );
}

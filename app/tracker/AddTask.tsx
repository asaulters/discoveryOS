"use client";
import { useState, type FormEvent } from "react";
import { OwnerOnly } from "@/app/RoleControls";
import { buttonClass, inputClass, panelClass, useTracker } from "./shared";
export default function AddTask({
  tracker,
}: {
  tracker: ReturnType<typeof useTracker>;
}) {
  return (
    <OwnerOnly>
      <Form tracker={tracker} />
    </OwnerOnly>
  );
}
function Form({ tracker }: { tracker: ReturnType<typeof useTracker> }) {
  const [open, setOpen] = useState(false),
    [project, setProject] = useState(""),
    [wp, setWp] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const projects = tracker.data.projects.filter((p) => !p.archived_at),
    projectId = project || projects[0]?.id || "";
  const packages = tracker.data.workPackages.filter(
    (w) => w.project_id === projectId && !w.archived_at,
  );
  const defaultPackage =
    packages.find((w) => w.name === "Discovery follow-ups") || packages[0];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      let id = wp || defaultPackage?.id;
      if (!id) {
        const r = await fetch("/api/work-packages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            name: "Discovery follow-ups",
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        id = data.id;
      }
      if (
        await tracker.mutate("/api/tasks", "POST", {
          work_package_id: id,
          title: form.get("title"),
          due_date: form.get("due_date") || null,
        })
      )
        setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add task");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="my-4">
      <button className={buttonClass} onClick={() => setOpen(!open)}>
        {open ? "Cancel" : "Add task"}
      </button>
      {open && (
        <form className={`${panelClass} my-3 space-y-3`} onSubmit={submit}>
          <label className="block text-sm">
            Title
            <input
              className={inputClass}
              name="title"
              required
              maxLength={500}
            />
          </label>
          <label className="block text-sm">
            Project
            <select
              className={inputClass}
              value={projectId}
              required
              onChange={(e) => {
                setProject(e.target.value);
                setWp("");
              }}
            >
              <option value="">Choose project</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Work package
            <select
              className={inputClass}
              value={wp || defaultPackage?.id || ""}
              onChange={(e) => setWp(e.target.value)}
            >
              {!packages.length && (
                <option value="">Create Discovery follow-ups</option>
              )}
              {packages.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Due date (optional)
            <input className={inputClass} type="date" name="due_date" />
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className={buttonClass}
            disabled={busy || tracker.busy || !projectId}
          >
            Save task
          </button>
        </form>
      )}
    </div>
  );
}

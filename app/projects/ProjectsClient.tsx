"use client";

import { useState } from "react";
import ImportProject from "./ImportProject";
import Link from "next/link";
import { OwnerOnly, WriteButton } from "@/app/RoleControls";
import {
  PROJECT_HEALTH,
  PROJECT_STAGES,
  label,
  type TrackerData,
} from "@/lib/tracker/types";
import {
  RecordForm,
  buttonClass,
  panelClass,
  primaryClass,
  useTracker,
  type FormField,
} from "@/app/tracker/shared";

export const projectFields: FormField[] = [
  { name: "name", label: "Project name", required: true },
  { name: "requesting_team", label: "Requesting team" },
  { name: "sponsor", label: "Sponsor" },
  { name: "target_date", label: "Target date", type: "date" },
  { name: "stage", label: "Stage", type: "select", options: PROJECT_STAGES },
  { name: "health", label: "Health", type: "select", options: PROJECT_HEALTH },
  { name: "goal", label: "Goal", type: "textarea" },
  { name: "notes", label: "Project notes (optional)", type: "textarea" },
  { name: "definition_of_done", label: "Definition of done", type: "textarea" },
];
export default function ProjectsClient({ initial }: { initial: TrackerData }) {
  const tracker = useTracker(initial),
    [showArchived, setShowArchived] = useState(false),
    [creating, setCreating] = useState(false);
  const projects = tracker.data.projects.filter(
    (p) => showArchived || !p.archived_at,
  );
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-neutral-500">
            From intake to live. Keep the next piece of work clear.
          </p>
        </div>
        <OwnerOnly>
          <WriteButton
            className={primaryClass}
            onClick={() => setCreating(!creating)}
          >
            {creating ? "Cancel" : "+ Create project"}
          </WriteButton>
        </OwnerOnly>
      </div>
      <OwnerOnly>
        <ImportProject />
      </OwnerOnly>
      <label className="my-6 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>
      {tracker.error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {tracker.error}
        </p>
      )}
      {creating && (
        <section className={`${panelClass} mb-6`}>
          <h2 className="mb-4 font-semibold">Create project</h2>
          <RecordForm
            fields={projectFields}
            busy={tracker.busy}
            save={async (values) => {
              if (await tracker.mutate("/api/projects", "POST", values))
                setCreating(false);
            }}
          />
        </section>
      )}
      {!projects.length ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No projects yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                {[
                  "Project",
                  "Stage",
                  "Health",
                  "Target date",
                  "Open tasks",
                ].map((h) => (
                  <th className="px-4 py-3 font-medium" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const packages = new Set(
                  tracker.data.workPackages
                    .filter((w) => w.project_id === p.id && !w.archived_at)
                    .map((w) => w.id),
                );
                const count = tracker.data.tasks.filter(
                  (t) =>
                    packages.has(t.work_package_id) &&
                    !t.archived_at &&
                    t.status !== "done",
                ).length;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-neutral-200 dark:border-neutral-800"
                  >
                    <td className="px-4 py-4">
                      <Link
                        className="font-medium hover:underline"
                        href={`/projects/${p.id}`}
                      >
                        {p.name}
                      </Link>
                      {p.archived_at && (
                        <span className="ml-2 text-xs text-neutral-500">
                          Archived
                        </span>
                      )}
                      {p.requesting_team && (
                        <p className="mt-1 text-xs text-neutral-500">
                          {p.requesting_team}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">{label(p.stage)}</td>
                    <td className="px-4 py-4">{label(p.health)}</td>
                    <td className="px-4 py-4">{p.target_date ?? "Not set"}</td>
                    <td className="px-4 py-4">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Link href="/my-week" className={`${buttonClass} mt-6 inline-block`}>
        My week →
      </Link>
    </main>
  );
}

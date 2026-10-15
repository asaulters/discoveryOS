"use client";

import { useState } from "react";
import Link from "next/link";
import type { TrackerData, WeekTask } from "@/lib/tracker/types";
import { groupByDay, weekTasks } from "@/lib/tracker/model";
import {
  TaskBoard,
  TaskRow,
  ViewToggle,
  buttonClass,
  panelClass,
  useClientToday,
  useTaskActions,
  useTracker,
  useViewPreference,
} from "@/app/tracker/shared";
export default function MyWeekClient({
  initial,
  userId,
}: {
  initial: TrackerData;
  userId: string;
}) {
  const tracker = useTracker(initial),
    [view, setView] = useViewPreference(userId, "my-week"),
    [group, setGroup] = useState<"day" | "project">("day"),
    [projectFilter, setProjectFilter] = useState<string | null>(null),
    [showArchived, setShowArchived] = useState(false);
  const { actions, pane } = useTaskActions(tracker),
    now = useClientToday();
  if (!now)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">My week</h1>
        <p className="mt-4 text-sm text-neutral-500">Loading your week…</p>
      </main>
    );
  const tasks = weekTasks(tracker.data, now, showArchived);
  const boardRows = [...tasks.open, ...tasks.completed];
  const projects = tracker.data.projects.filter((p) =>
    boardRows.some((row) => row.project.id === p.id),
  );
  const groups: [string, WeekTask[]][] =
    group === "day"
      ? groupByDay(tasks.open, now)
      : tracker.data.projects
          .filter((p) => showArchived || !p.archived_at)
          .map((p) => [
            p.name,
            tasks.open.filter((row) => row.project.id === p.id),
          ]);
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My week</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Upcoming, overdue, in progress and blocked work across your
            projects.
          </p>
        </div>
        <Link href="/projects" className={buttonClass}>
          All projects →
        </Link>
      </header>
      {tracker.error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {tracker.error}
        </p>
      )}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <ViewToggle view={view} setView={setView} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            {view === "list" && (
              <div className="flex gap-2" aria-label="Group tasks">
                {(["day", "project"] as const).map((g) => (
                  <button
                    type="button"
                    key={g}
                    className={buttonClass}
                    aria-pressed={group === g}
                    onClick={() => setGroup(g)}
                  >
                    By {g}
                  </button>
                ))}
              </div>
            )}
          </div>
          {view === "board" ? (
            <>
              <div
                className="mb-4 flex flex-wrap gap-2"
                aria-label="Filter by project"
              >
                <button
                  type="button"
                  className={buttonClass}
                  aria-pressed={projectFilter === null}
                  onClick={() => setProjectFilter(null)}
                >
                  All projects
                </button>
                {projects.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={`${buttonClass} ${projectFilter === p.id ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
                    aria-pressed={projectFilter === p.id}
                    onClick={() =>
                      setProjectFilter(projectFilter === p.id ? null : p.id)
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-xs text-neutral-500">
                Done includes tasks completed this calendar week
                (Monday–Sunday).
              </p>
              <div className="overflow-x-auto">
                <TaskBoard
                  rows={boardRows.filter(
                    (row) => !projectFilter || row.project.id === projectFilter,
                  )}
                  {...actions}
                />
              </div>
            </>
          ) : (
            <div className="space-y-5">
              {groups.map(([name, rows], index) => (
                <section key={`${name}:${index}`} className={panelClass}>
                  <h2 className="mb-3 text-sm font-semibold">
                    {/^\d{4}-\d{2}-\d{2}$/.test(name)
                      ? new Date(`${name}T12:00:00`).toLocaleDateString(
                          undefined,
                          { weekday: "long", month: "short", day: "numeric" },
                        )
                      : name}
                  </h2>
                  {rows.length ? (
                    rows.map((row) => (
                      <TaskRow
                        key={row.task.id}
                        task={row.task}
                        context={
                          group === "day"
                            ? `${row.project.name} · ${row.workPackage.name}`
                            : `${row.task.due_date ? new Date(row.task.due_date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "No date"} · ${row.workPackage.name}`
                        }
                        {...actions}
                        busy={
                          actions.busy ||
                          !!row.project.archived_at ||
                          !!row.workPackage.archived_at
                        }
                      />
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">No tasks.</p>
                  )}
                </section>
              ))}
              {group === "project" && !groups.length && (
                <p className="text-sm text-neutral-500">No projects yet.</p>
              )}
            </div>
          )}
        </div>
        <div aria-hidden="true" className="hidden xl:block" />
      </div>
      {pane}
    </main>
  );
}

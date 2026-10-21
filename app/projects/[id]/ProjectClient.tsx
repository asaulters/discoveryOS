"use client";
import ReorderControls from "@/app/tracker/ReorderControls";
import useProjectCollapse from "@/app/tracker/useProjectCollapse";
import Evidence from "@/app/tracker/Evidence";
import Raid from "@/app/tracker/Raid";
import ProjectCsvUpdates from "./ProjectCsvUpdates";
import ProjectResources from "./ProjectResources";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  OwnerOnly,
  WriteButton,
  WriteInput,
  WriteTextarea,
} from "@/app/RoleControls";
import {
  label,
  TASK_STATUSES,
  type TrackerData,
  type WorkPackage,
  type ProjectEvent,
} from "@/lib/tracker/types";
import { projectFields } from "../ProjectsClient";
import {
  Progress,
  RecordForm,
  TaskBoard,
  TaskRow,
  ViewToggle,
  buttonClass,
  inputClass,
  panelClass,
  primaryClass,
  useTaskActions,
  useTracker,
  useViewPreference,
  type FormField,
} from "@/app/tracker/shared";
function activityDescription(event: ProjectEvent) {
  const after = (event.to_value ?? {}) as Record<string, unknown>;
  if (event.action === "csv_updated")
    return `CSV update · ${String(after.report_date || "")} · ${String(after.summary || "Project updated")}`;
  if (event.action.startsWith("resource_") || event.action === "file_uploaded")
    return String(
      (after.resource as { name?: string } | undefined)?.name ?? "Resource",
    );
  if (event.action.startsWith("subtask_"))
    return String(
      (after.subtask as { title?: string } | undefined)?.title ?? "Subtask",
    );
  if (event.action === "created")
    return String(after.name ?? after.title ?? "Created");
  const before = (event.from_value ?? {}) as Record<string, unknown>;
  const field = Object.keys(after)[0];
  if (!field) return label(event.action);
  const describe = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "Not set";
    if (field.endsWith("_at") && typeof value === "string")
      return (
        new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC"
      );
    return typeof value === "string" &&
      ["status", "stage", "health"].includes(field)
      ? label(value)
      : String(value);
  };
  return `${label(field === "sort_order" ? "order" : field)}: ${describe(before[field])} → ${describe(after[field])}`;
}
const packageFields: FormField[] = [
  { name: "name", label: "Work package name", required: true },
  { name: "status", label: "Status", type: "select", options: TASK_STATUSES },
  { name: "target_date", label: "Target date", type: "date" },
  { name: "sort_order", label: "Order", type: "number" },
  {
    name: "acceptance_criteria",
    label: "Acceptance criteria",
    type: "textarea",
  },
  { name: "notes", label: "Notes (optional)", type: "textarea" },
];
export default function ProjectClient({
  initial,
  userId,
}: {
  initial: TrackerData;
  userId: string;
}) {
  const tracker = useTracker(initial, initial.projects[0].id),
    [view, setView] = useViewPreference(userId, "project"),
    [showArchived, setShowArchived] = useState(false);
  const [raidView, setRaidView] = useState(false);
  const [editing, setEditing] = useState(false),
    [adding, setAdding] = useState(false),
    [editingPackage, setEditingPackage] = useState<string | null>(null);
  const navigation = useProjectCollapse(userId, initial.projects[0].id);
  const { actions: taskActions, pane } = useTaskActions(
    tracker,
    true,
    showArchived,
  );
  const actions = {
    ...taskActions,
    disclosure: (task: { id: string }) => {
      const subtasks = tracker.data.subtasks.filter(
        (s) => s.task_id === task.id && !s.archived_at,
      );
      return {
        collapsed: navigation.isCollapsed(`task:${task.id}`),
        toggle: () => navigation.toggle(`task:${task.id}`),
        summary: subtasks.length
          ? `${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"} · ${subtasks.filter((s) => s.is_done).length} complete`
          : "Task details",
      };
    },
  };
  const project = tracker.data.projects[0];
  const packages = tracker.data.workPackages.filter(
    (w) => showArchived || !w.archived_at,
  );
  const activeIds = new Set(
    tracker.data.workPackages.filter((w) => !w.archived_at).map((w) => w.id),
  );
  const activeTasks = tracker.data.tasks.filter((t) =>
    activeIds.has(t.work_package_id),
  );
  async function quickAdd(event: FormEvent<HTMLFormElement>, w: WorkPackage) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const order = tracker.data.tasks
      .filter((t) => t.work_package_id === w.id)
      .reduce((max, t) => Math.max(max, t.sort_order + 1), 0);
    if (
      await tracker.mutate("/api/tasks", "POST", {
        work_package_id: w.id,
        title: data.get("title"),
        notes: data.get("notes") || null,
        due_date: data.get("due_date") || null,
        sort_order: order,
      })
    )
      form.reset();
  }
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link
        href="/projects"
        className="text-sm text-neutral-500 hover:underline"
      >
        ← Projects
      </Link>
      <header className="mt-4 mb-8">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="mt-2 text-sm text-neutral-500">
              {label(project.stage)} · {label(project.health)} · Target:{" "}
              {project.target_date ?? "Not set"}
              {project.archived_at ? " · Archived" : ""}
            </p>
          </div>
          <OwnerOnly>
            <div className="flex items-start gap-2">
              <WriteButton
                className={buttonClass}
                disabled={tracker.busy}
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Close editor" : "Edit project"}
              </WriteButton>
              <WriteButton
                className={buttonClass}
                disabled={tracker.busy}
                onClick={() =>
                  tracker.mutate(`/api/projects/${project.id}`, "PATCH", {
                    archived: !project.archived_at,
                  })
                }
              >
                {project.archived_at ? "Restore project" : "Archive project"}
              </WriteButton>
            </div>
          </OwnerOnly>
        </div>
        {project.goal && (
          <p className="mt-4 whitespace-pre-wrap text-sm">{project.goal}</p>
        )}
        <dl className="my-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">Requesting team</dt>
            <dd>{project.requesting_team ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Sponsor</dt>
            <dd>{project.sponsor ?? "Not set"}</dd>
          </div>
          {project.definition_of_done && (
            <div className="w-full">
              <dt className="text-neutral-500">Definition of done</dt>
              <dd className="whitespace-pre-wrap">
                {project.definition_of_done}
              </dd>
            </div>
          )}
        </dl>
        <Progress tasks={activeTasks} />
        {editing && (
          <section className={`${panelClass} mt-6`}>
            <h2 className="mb-4 font-semibold">Edit project</h2>
            <RecordForm
              fields={projectFields}
              values={{ ...project }}
              busy={tracker.busy}
              save={async (values) => {
                if (
                  await tracker.mutate(
                    `/api/projects/${project.id}`,
                    "PATCH",
                    values,
                  )
                )
                  setEditing(false);
              }}
            />
          </section>
        )}
      </header>
      <ProjectCsvUpdates
        projectId={project.id}
        archived={!!project.archived_at}
        tracker={tracker}
      />
      <ProjectResources
        project={project}
        tracker={tracker}
        showArchived={showArchived}
      />
      {tracker.error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {tracker.error}
        </p>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <ViewToggle
          view={raidView ? "" : view}
          setView={(v) => {
            setRaidView(false);
            setView(v);
          }}
        />
        <button
          className={buttonClass}
          aria-pressed={raidView}
          onClick={() => setRaidView(true)}
        >
          RAID
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <OwnerOnly>
          <WriteButton
            className={`${primaryClass} ml-auto`}
            disabled={!!project.archived_at}
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Cancel" : "+ Work package"}
          </WriteButton>
        </OwnerOnly>
      </div>
      {!raidView && packages.length > 0 && (
        <div
          className="mb-4 flex flex-wrap gap-2"
          aria-label="Expand and collapse project items"
        >
          <button
            className={buttonClass}
            onClick={() =>
              navigation.set(
                packages.map((w) => `wp:${w.id}`),
                true,
              )
            }
          >
            Collapse all work packages
          </button>
          <button
            className={buttonClass}
            onClick={() =>
              navigation.set(
                packages.map((w) => `wp:${w.id}`),
                false,
              )
            }
          >
            Expand all work packages
          </button>
          <button
            className={buttonClass}
            onClick={() =>
              navigation.set(
                tracker.data.tasks.map((t) => `task:${t.id}`),
                true,
              )
            }
          >
            Collapse all tasks
          </button>
          <button
            className={buttonClass}
            onClick={() =>
              navigation.set(
                tracker.data.tasks.map((t) => `task:${t.id}`),
                false,
              )
            }
          >
            Expand all tasks
          </button>
        </div>
      )}
      {adding && (
        <section className={`${panelClass} mb-6`}>
          <h2 className="mb-4 font-semibold">Add work package</h2>
          <RecordForm
            fields={packageFields}
            busy={tracker.busy}
            save={async (values) => {
              if (
                await tracker.mutate("/api/work-packages", "POST", {
                  ...values,
                  project_id: project.id,
                })
              )
                setAdding(false);
            }}
          />
        </section>
      )}
      {raidView ? (
        <Raid tracker={tracker} showArchived={showArchived} />
      ) : (
        <div className="space-y-6">
          {packages.map((w) => {
            const tasks = tracker.data.tasks.filter(
              (t) =>
                t.work_package_id === w.id && (showArchived || !t.archived_at),
            );
            return (
              <section className={panelClass} key={w.id}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="rounded px-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        aria-label={`${navigation.isCollapsed(`wp:${w.id}`) ? "Expand" : "Collapse"} work package: ${w.name}`}
                        aria-expanded={!navigation.isCollapsed(`wp:${w.id}`)}
                        aria-controls={`wp-details-${w.id}`}
                        onClick={() => navigation.toggle(`wp:${w.id}`)}
                      >
                        {navigation.isCollapsed(`wp:${w.id}`) ? "▸" : "▾"}
                      </button>
                      <h2 className="font-semibold">
                        {w.name}
                        {w.archived_at && (
                          <span className="ml-2 text-xs text-neutral-500">
                            Archived
                          </span>
                        )}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {tasks.length} tasks · {label(w.status)} · Target:{" "}
                      {w.target_date ?? "Not set"}
                    </p>
                  </div>
                  <Progress
                    tasks={tracker.data.tasks.filter(
                      (t) => t.work_package_id === w.id,
                    )}
                  />
                  <OwnerOnly>
                    <div className="flex gap-2">
                      <ReorderControls
                        kind="work_package"
                        id={w.id}
                        name={w.name}
                        siblings={packages}
                        disabled={tracker.busy || !!project.archived_at}
                        mutate={tracker.mutate}
                      />
                      <WriteButton
                        disabled={!!project.archived_at}
                        className={buttonClass}
                        onClick={() => {
                          navigation.set([`wp:${w.id}`], false);
                          setEditingPackage(
                            editingPackage === w.id ? null : w.id,
                          );
                        }}
                      >
                        Edit
                      </WriteButton>
                      <WriteButton
                        disabled={tracker.busy || !!project.archived_at}
                        className={buttonClass}
                        onClick={() =>
                          tracker.mutate(
                            `/api/work-packages/${w.id}`,
                            "PATCH",
                            {
                              archived: !w.archived_at,
                            },
                          )
                        }
                      >
                        {w.archived_at ? "Restore" : "Archive"}
                      </WriteButton>
                    </div>
                  </OwnerOnly>
                </div>
                <div
                  id={`wp-details-${w.id}`}
                  hidden={navigation.isCollapsed(`wp:${w.id}`)}
                >
                  <Evidence item={w} />
                  {w.notes && (
                    <div className="mb-4 text-sm">
                      <p className="text-xs font-medium text-neutral-500">
                        Notes
                      </p>
                      <p className="whitespace-pre-wrap">{w.notes}</p>
                    </div>
                  )}
                  {w.acceptance_criteria && (
                    <p className="mb-4 whitespace-pre-wrap text-sm text-neutral-500">
                      {w.acceptance_criteria}
                    </p>
                  )}
                  {editingPackage === w.id && (
                    <div className="mb-6">
                      <RecordForm
                        fields={packageFields}
                        values={{ ...w }}
                        busy={tracker.busy}
                        save={async (values) => {
                          if (
                            await tracker.mutate(
                              `/api/work-packages/${w.id}`,
                              "PATCH",
                              values,
                            )
                          )
                            setEditingPackage(null);
                        }}
                      />
                    </div>
                  )}
                  <div>
                    {view === "list" ? (
                      tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          {...actions}
                          busy={
                            actions.busy ||
                            !!project.archived_at ||
                            !!w.archived_at
                          }
                        />
                      ))
                    ) : (
                      <div className="overflow-x-auto">
                        <TaskBoard
                          rows={tasks.map((task) => ({
                            task,
                            workPackage: w,
                            project,
                          }))}
                          {...actions}
                          busy={
                            actions.busy ||
                            !!project.archived_at ||
                            !!w.archived_at
                          }
                        />
                      </div>
                    )}
                    {!tasks.length && view === "list" && (
                      <p className="py-4 text-sm text-neutral-500">
                        No tasks in this work package.
                      </p>
                    )}
                    <OwnerOnly>
                      <fieldset
                        disabled={!!project.archived_at || !!w.archived_at}
                      >
                        <form
                          onSubmit={(event) => quickAdd(event, w)}
                          className="mt-4 flex flex-wrap items-end gap-2"
                        >
                          <label className="min-w-40 flex-1 text-xs text-neutral-500">
                            Quick add
                            <WriteInput
                              aria-label={`New task in ${w.name}`}
                              name="title"
                              placeholder="What needs to happen?"
                              required
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <label className="text-xs text-neutral-500">
                            Due date
                            <WriteInput
                              name="due_date"
                              type="date"
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <label className="w-full text-xs text-neutral-500">
                            Notes (optional)
                            <WriteTextarea
                              aria-label={`Task notes in ${w.name}`}
                              name="notes"
                              rows={2}
                              maxLength={20000}
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <WriteButton
                            type="submit"
                            disabled={tracker.busy}
                            className={buttonClass}
                          >
                            Add task
                          </WriteButton>
                        </form>
                      </fieldset>
                    </OwnerOnly>
                  </div>
                </div>
              </section>
            );
          })}
          {!packages.length && (
            <p className="rounded border border-dashed p-10 text-center text-sm text-neutral-500">
              No work packages yet.
            </p>
          )}
        </div>
      )}
      <section className={`${panelClass} mt-8`}>
        <h2 className="mb-3 font-semibold">Meetings</h2>
        {tracker.data.meetings.map((m) => (
          <p key={m.id}>
            <Link
              className="text-sm underline"
              href={`/meetings/${m.id}/review`}
            >
              {m.name}
            </Link>
          </p>
        ))}
        {!tracker.data.meetings.length && (
          <p className="text-sm text-neutral-500">No linked meetings yet.</p>
        )}
        <OwnerOnly>
          {!project.archived_at && (
            <Link
              className={`${buttonClass} mt-4 inline-block`}
              href={`/meetings/new?projectId=${project.id}`}
            >
              New meeting for this project
            </Link>
          )}
        </OwnerOnly>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Recent activity</h2>
        {!tracker.data.events.length && (
          <p className="text-sm text-neutral-500">No activity yet.</p>
        )}
        <ol className="space-y-3">
          {tracker.data.events.map((event) => (
            <li
              className="border-l-2 border-neutral-200 pl-4 text-sm dark:border-neutral-700"
              key={event.id}
            >
              <p>
                <span className="font-medium">
                  {event.entity_type === "project"
                    ? project.name
                    : event.entity_type === "work_package"
                      ? (tracker.data.workPackages.find(
                          (w) => w.id === event.entity_id,
                        )?.name ?? "Work package")
                      : event.entity_type === "raid_item"
                        ? (tracker.data.raidItems.find(
                            (r) => r.id === event.entity_id,
                          )?.title ?? "RAID item")
                        : (tracker.data.tasks.find(
                            (t) => t.id === event.entity_id,
                          )?.title ?? "Task")}
                </span>{" "}
                · {label(event.action)}{" "}
                <span className="ml-2 text-xs text-neutral-500">
                  {new Date(event.created_at)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}{" "}
                  UTC
                </span>
              </p>
              <p className="mt-1 break-words text-xs text-neutral-500">
                {activityDescription(event)}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {pane}
    </main>
  );
}

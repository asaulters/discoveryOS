"use client";
import ReadableText from "@/app/tracker/ReadableText";
import Evidence from "./Evidence";
import ReorderControls from "./ReorderControls";
import Subtasks from "./Subtasks";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  WriteButton,
  WriteInput,
  WriteSelect,
  WriteTextarea,
} from "@/app/RoleControls";
import type {
  Task,
  TaskStatus,
  TrackerData,
  WeekTask,
} from "@/lib/tracker/types";
import { STATUS_LABELS, TASK_STATUSES } from "@/lib/tracker/types";
import { progress } from "@/lib/tracker/model";

export const inputClass =
  "w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm disabled:opacity-70 dark:border-neutral-700";
export const buttonClass =
  "rounded border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800";
export const primaryClass =
  "rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";
export const panelClass =
  "rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
export function useTracker(initial: TrackerData, projectId?: string) {
  const [data, setData] = useState(initial),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const fresh = await fetch(
      projectId ? `/api/projects/${projectId}` : "/api/projects",
      { cache: "no-store" },
    );
    const snapshot = await fresh.json();
    if (!fresh.ok)
      throw new Error(snapshot.error ?? "Unable to refresh tracker");
    setData(snapshot);
  }
  async function mutate(path: string, method: "POST" | "PATCH", body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Unable to save change");
      await refresh();
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save change",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { data, error, busy, mutate, refresh };
}
const emptySubscribe = () => () => {};
export function useViewPreference(userId: string, page: string) {
  const key = `discoveryos:tracker:${userId}:${page}:view`;
  const saved = useSyncExternalStore(
    (callback) => {
      window.addEventListener("tracker-view", callback);
      return () => window.removeEventListener("tracker-view", callback);
    },
    () => {
      try {
        return localStorage.getItem(key) === "board" ? "board" : "list";
      } catch {
        return "list";
      }
    },
    () => "list",
  );
  const [override, setOverride] = useState<"list" | "board" | null>(null);
  const setView = (view: "list" | "board") => {
    setOverride(view);
    try {
      localStorage.setItem(key, view);
      window.dispatchEvent(new Event("tracker-view"));
    } catch {}
  };
  return [override ?? saved, setView] as const;
}
export function useClientToday() {
  const ready = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  return ready ? new Date() : null;
}
export function ViewToggle({
  view,
  setView,
}: {
  view: string;
  setView: (view: "list" | "board") => void;
}) {
  return (
    <div
      className="inline-flex rounded border border-neutral-300 p-1 dark:border-neutral-700"
      aria-label="View"
    >
      {(["list", "board"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`rounded px-4 py-1 text-sm ${view === v ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "text-neutral-500"}`}
        >
          {v === "list" ? "List" : "Board"}
        </button>
      ))}
    </div>
  );
}
export function Progress({ tasks }: { tasks: Task[] }) {
  const p = progress(tasks);
  return (
    <div className="min-w-40">
      <p className="mb-1 text-xs text-neutral-500">
        {p.done} of {p.total} tasks done, {p.blocked} blocked
      </p>
      <div
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuemin={0}
        aria-valuemax={p.total || 1}
        aria-valuenow={p.done}
        className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700"
      >
        <div
          className="h-full rounded bg-blue-600"
          style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
export interface FormField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "select" | "number";
  options?: readonly string[];
  required?: boolean;
}
export function RecordForm({
  fields,
  values = {},
  save,
  busy,
  children,
}: {
  fields: FormField[];
  values?: Record<string, unknown>;
  save: (values: Record<string, unknown>) => void;
  busy: boolean;
  children?: ReactNode;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      result: Record<string, unknown> = {};
    for (const field of fields) {
      const value = String(form.get(field.name) ?? "").trim();
      result[field.name] =
        field.type === "number" ? Number(value || 0) : value || null;
    }
    save(result);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <label
          className={`block text-sm ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
          key={field.name}
        >
          {field.label}
          {field.required ? " *" : ""}
          {field.type === "textarea" ? (
            <WriteTextarea
              name={field.name}
              aria-label={field.label}
              defaultValue={String(values[field.name] ?? "")}
              className={`${inputClass} mt-1 resize-y leading-7`}
              rows={6}
            />
          ) : field.type === "select" ? (
            <WriteSelect
              name={field.name}
              aria-label={field.label}
              defaultValue={String(
                values[field.name] ?? field.options?.[0] ?? "",
              )}
              className={`${inputClass} mt-1`}
            >
              {field.options?.map((option) => (
                <option key={option} value={option}>
                  {option
                    ? option === "todo"
                      ? "To do"
                      : option.replaceAll("_", " ")
                    : "Not set"}
                </option>
              ))}
            </WriteSelect>
          ) : (
            <WriteInput
              name={field.name}
              aria-label={field.label}
              type={field.type ?? "text"}
              defaultValue={String(values[field.name] ?? "")}
              required={field.required}
              min={field.type === "number" ? 0 : undefined}
              className={`${inputClass} mt-1`}
            />
          )}
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <WriteButton disabled={busy} className={primaryClass} type="submit">
          {busy ? "Saving…" : "Save"}
        </WriteButton>
        {children}
      </div>
    </form>
  );
}
export function TaskStatusMenu({
  task,
  busy,
  change,
}: {
  task: Task;
  busy: boolean;
  change: (task: Task, status: TaskStatus) => void;
}) {
  return (
    <WriteSelect
      aria-label={`Status for ${task.title}`}
      className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs disabled:opacity-60 dark:border-neutral-700"
      value={task.status}
      disabled={busy || !!task.archived_at}
      onChange={(e) => change(task, e.target.value as TaskStatus)}
    >
      {TASK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </WriteSelect>
  );
}
interface TaskDisclosure {
  collapsed: boolean;
  toggle: () => void;
  summary: string;
}
function TaskCollapseButton({
  task,
  disclosure,
}: {
  task: Task;
  disclosure?: TaskDisclosure;
}) {
  if (!disclosure) return null;
  return (
    <button
      type="button"
      className="rounded px-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
      aria-label={`${disclosure.collapsed ? "Expand" : "Collapse"} task: ${task.title}`}
      aria-expanded={!disclosure.collapsed}
      aria-controls={`task-details-${task.id}`}
      onClick={disclosure.toggle}
    >
      {disclosure.collapsed ? "▸" : "▾"}
    </button>
  );
}
export interface TaskActions {
  disclosure?: (task: Task) => TaskDisclosure;
  open: (task: Task, status?: TaskStatus) => void;
  change: (task: Task, status: TaskStatus) => void;
  busy: boolean;
  renderSubtasks?: (task: Task, disabled: boolean) => ReactNode;
  renderReorder?: (task: Task, disabled: boolean, board?: boolean) => ReactNode;
}
export function TaskRow({
  task,
  context,
  renderSubtasks,
  renderReorder,
  disclosure,
  open,
  change,
  busy,
}: { task: Task; context?: string } & TaskActions) {
  const detail = disclosure?.(task);
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 py-3 dark:border-neutral-800">
      <TaskCollapseButton task={task} disclosure={detail} />
      <button
        type="button"
        className="min-w-40 flex-1 text-left text-sm font-medium hover:underline"
        onClick={() => open(task)}
      >
        {task.title}
        {task.archived_at && (
          <span className="ml-2 text-xs text-neutral-500">Archived</span>
        )}
        {context && (
          <span className="mt-1 block text-xs font-normal text-neutral-500">
            {context}
          </span>
        )}
      </button>
      <span className="text-xs text-neutral-500">
        {task.due_date ?? "No date"}
      </span>
      {renderReorder?.(task, busy || !!task.archived_at)}
      <TaskStatusMenu task={task} busy={busy} change={change} />
      {detail?.collapsed && (
        <p className="w-full text-xs text-neutral-500">{detail.summary}</p>
      )}
      <div
        className="w-full"
        id={detail ? `task-details-${task.id}` : undefined}
        hidden={detail?.collapsed}
      >
        {task.notes && (
          <ReadableText className="mb-3">{task.notes}</ReadableText>
        )}
        {renderSubtasks?.(task, busy || !!task.archived_at)}
        <div className="w-full">
          <Evidence item={task} />
        </div>
        {task.status === "blocked" && (
          <div className="mt-3 text-amber-800 dark:text-amber-300">
            <strong className="text-sm">Blocked</strong>
            <ReadableText>
              {task.blocked_reason || "No reason provided"}
            </ReadableText>
          </div>
        )}
      </div>
    </div>
  );
}
export function TaskBoard({
  rows,
  renderSubtasks,
  renderReorder,
  disclosure,
  open,
  change,
  busy,
}: { rows: WeekTask[] } & TaskActions) {
  return (
    <div className="grid min-w-[760px] grid-cols-4 gap-3">
      {TASK_STATUSES.map((status) => (
        <section
          key={status}
          aria-label={STATUS_LABELS[status]}
          className="min-h-36 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950"
        >
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {STATUS_LABELS[status]} ·{" "}
            {rows.filter((r) => r.task.status === status).length}
          </h3>
          <div className="space-y-3">
            {rows
              .filter((r) => r.task.status === status)
              .map((row) => {
                const detail = disclosure?.(row.task);
                return (
                  <article
                    key={row.task.id}
                    className="rounded border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <TaskCollapseButton task={row.task} disclosure={detail} />
                    <button
                      type="button"
                      className="text-left text-sm font-medium hover:underline"
                      onClick={() => open(row.task)}
                    >
                      {row.task.title}
                    </button>
                    <p className="my-2 text-xs text-neutral-500">
                      <Link
                        href={`/projects/${row.project.id}`}
                        className="hover:underline"
                      >
                        {row.project.name}
                      </Link>{" "}
                      · {row.workPackage.name}
                    </p>
                    <p className="mb-2 text-xs text-neutral-500">
                      {row.task.due_date ?? "No date"}
                      {row.task.archived_at ? " · Archived" : ""}
                    </p>
                    {renderReorder?.(
                      row.task,
                      busy ||
                        !!row.project.archived_at ||
                        !!row.workPackage.archived_at ||
                        !!row.task.archived_at,
                      true,
                    )}
                    <TaskStatusMenu
                      task={row.task}
                      busy={
                        busy ||
                        !!row.project.archived_at ||
                        !!row.workPackage.archived_at
                      }
                      change={change}
                    />
                    {detail?.collapsed && (
                      <p className="mt-2 text-xs text-neutral-500">
                        {detail.summary}
                      </p>
                    )}
                    <div
                      id={detail ? `task-details-${row.task.id}` : undefined}
                      hidden={detail?.collapsed}
                    >
                      {row.task.notes && (
                        <ReadableText className="my-3">
                          {row.task.notes}
                        </ReadableText>
                      )}
                      <Evidence item={row.task} />
                      {renderSubtasks?.(
                        row.task,
                        busy ||
                          !!row.task.archived_at ||
                          !!row.project.archived_at ||
                          !!row.workPackage.archived_at,
                      )}
                      {status === "blocked" && (
                        <div className="mt-3 text-amber-800 dark:text-amber-300">
                          <strong className="text-sm">Blocked</strong>
                          <ReadableText>
                            {row.task.blocked_reason || "No reason provided"}
                          </ReadableText>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
export function TaskPane({
  task,
  initialStatus,
  close,
  save,
  busy,
  error,
  canEdit = true,
  children,
}: {
  task: Task;
  initialStatus?: TaskStatus;
  close: () => void;
  save: (id: string, values: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  canEdit?: boolean;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={close}
      aria-labelledby="task-pane-title"
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-lg border-l border-neutral-200 bg-white p-6 text-neutral-900 backdrop:bg-black/30 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <div className="mb-6 flex items-center justify-between">
        <h2 id="task-pane-title" className="text-xl font-semibold">
          Task details
        </h2>
        <button type="button" className={buttonClass} onClick={close}>
          Close
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <fieldset disabled={!canEdit || busy}>
        <RecordForm
          key={`${task.id}:${initialStatus ?? task.status}`}
          fields={[
            { name: "title", label: "Title", required: true },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: TASK_STATUSES,
            },
            { name: "due_date", label: "Due date", type: "date" },
            {
              name: "size",
              label: "Size",
              type: "select",
              options: ["", "s", "m", "l"],
            },
            { name: "notes", label: "Notes", type: "textarea" },
            {
              name: "blocked_reason",
              label: "Blocked reason (required when blocked)",
              type: "textarea",
            },
            { name: "sort_order", label: "Order", type: "number" },
          ]}
          values={{ ...task, status: initialStatus ?? task.status }}
          busy={busy}
          save={async (values) => {
            if (await save(task.id, values)) close();
          }}
        />
        <WriteButton
          type="button"
          disabled={busy}
          className={`${buttonClass} mt-6`}
          onClick={async () => {
            if (await save(task.id, { archived: !task.archived_at })) close();
          }}
        >
          {task.archived_at ? "Restore task" : "Archive task"}
        </WriteButton>
      </fieldset>
      {!canEdit && (
        <p className="mt-4 text-sm text-neutral-500">
          Restore the project and work package to edit this task.
        </p>
      )}
      <Evidence item={task} />
      {children}
    </dialog>
  );
}
export function useTaskActions(
  tracker: ReturnType<typeof useTracker>,
  inlineSubtasks = false,
  showArchived = false,
) {
  const [selected, setSelected] = useState<{
    id: string;
    status?: TaskStatus;
  } | null>(null);
  const open = (task: Task, status?: TaskStatus) =>
    setSelected({ id: task.id, status });
  const change = (task: Task, status: TaskStatus) => {
    if (status === "blocked" && !task.blocked_reason?.trim())
      open(task, status);
    else void tracker.mutate(`/api/tasks/${task.id}`, "PATCH", { status });
  };
  const task = tracker.data.tasks.find((t) => t.id === selected?.id);
  const workPackage = tracker.data.workPackages.find(
    (w) => w.id === task?.work_package_id,
  );
  const project = tracker.data.projects.find(
    (p) => p.id === workPackage?.project_id,
  );
  const renderSubtasks = (parent: Task, disabled: boolean) => (
    <Subtasks
      task={parent}
      rows={tracker.data.subtasks.filter((s) => s.task_id === parent.id)}
      disabled={disabled || tracker.busy}
      showArchived={showArchived}
      mutate={tracker.mutate}
    />
  );
  return {
    actions: {
      open,
      change,
      busy: tracker.busy,
      ...(inlineSubtasks
        ? {
            renderSubtasks,
            renderReorder: (task: Task, disabled: boolean, board = false) => (
              <ReorderControls
                kind="task"
                id={task.id}
                name={task.title}
                siblings={tracker.data.tasks.filter(
                  (t) =>
                    t.work_package_id === task.work_package_id &&
                    (!board || t.status === task.status),
                )}
                status={board ? task.status : undefined}
                disabled={disabled}
                mutate={tracker.mutate}
              />
            ),
          }
        : {}),
    },
    pane: task && (
      <TaskPane
        task={task}
        initialStatus={selected?.status}
        close={() => setSelected(null)}
        save={(id, values) =>
          tracker.mutate(`/api/tasks/${id}`, "PATCH", values)
        }
        busy={tracker.busy}
        error={tracker.error}
        canEdit={!workPackage?.archived_at && !project?.archived_at}
      >
        {renderSubtasks(
          task,
          !!task.archived_at ||
            !!workPackage?.archived_at ||
            !!project?.archived_at,
        )}
      </TaskPane>
    ),
  };
}

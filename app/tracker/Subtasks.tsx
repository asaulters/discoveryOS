"use client";
import ReorderControls from "./ReorderControls";
import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  OwnerOnly,
  WriteInput,
  WriteButton,
  WriteTextarea,
} from "@/app/RoleControls";
import type { Task, Subtask } from "@/lib/tracker/types";
import { inputClass, buttonClass } from "./shared";
export default function Subtasks({
  task,
  rows,
  disabled,
  showArchived,
  mutate,
}: {
  task: Task;
  rows: Subtask[];
  disabled: boolean;
  showArchived: boolean;
  mutate: (
    path: string,
    method: "POST" | "PATCH",
    body: object,
  ) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>(
    {},
  );
  const titleInput = useRef<HTMLInputElement>(null);
  const focusAfterSave = useRef(false);
  useEffect(() => {
    if (!disabled && focusAfterSave.current) {
      titleInput.current?.focus();
      focusAfterSave.current = false;
    }
  }, [disabled]);
  const visible = rows.filter((s) => showArchived || !s.archived_at),
    active = rows.filter((s) => !s.archived_at);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    focusAfterSave.current = true;
    if (
      await mutate("/api/subtasks", "POST", {
        task_id: task.id,
        title: data.get("title"),
        notes: data.get("notes") || null,
      })
    ) {
      form.reset();
    } else {
      focusAfterSave.current = false;
    }
  }
  return (
    <section
      aria-label={`Subtasks for ${task.title}`}
      className="mt-2 w-full border-l-2 border-neutral-200 pl-3 dark:border-neutral-700"
    >
      {!!active.length && (
        <p className="mb-2 text-xs text-neutral-500">
          Subtasks: {active.filter((s) => s.is_done).length}/{active.length}{" "}
          complete
        </p>
      )}
      {visible.map((s) => (
        <div className="my-2 text-sm" key={s.id}>
          <div className="flex items-start gap-2">
            <label className="flex flex-1 items-start gap-2">
              <WriteInput
                type="checkbox"
                aria-label={`Complete subtask: ${s.title}`}
                checked={pendingChecks[s.id] ?? s.is_done}
                disabled={disabled || !!s.archived_at}
                onChange={async (e) => {
                  const is_done = e.target.checked;
                  setPendingChecks((old) => ({ ...old, [s.id]: is_done }));
                  await mutate(`/api/subtasks/${s.id}`, "PATCH", { is_done });
                  setPendingChecks((old) => {
                    const next = { ...old };
                    delete next[s.id];
                    return next;
                  });
                }}
              />
              <span
                className={s.is_done ? "text-neutral-500 line-through" : ""}
              >
                {s.title}
                {s.archived_at ? " (Archived)" : ""}
              </span>
            </label>
            <ReorderControls
              kind="subtask"
              id={s.id}
              name={s.title}
              siblings={rows}
              disabled={disabled}
              mutate={mutate}
            />
            <OwnerOnly>
              <WriteButton
                className="text-xs text-neutral-500 underline"
                disabled={disabled}
                onClick={() =>
                  mutate(`/api/subtasks/${s.id}`, "PATCH", {
                    archived: !s.archived_at,
                  })
                }
              >
                {s.archived_at ? "Restore subtask" : "Archive subtask"}
              </WriteButton>
            </OwnerOnly>
          </div>
          {s.notes && (
            <p className="ml-6 mt-1 whitespace-pre-wrap text-xs text-neutral-500">
              {s.notes}
            </p>
          )}
        </div>
      ))}
      <OwnerOnly>
        <WriteButton
          className="text-xs font-medium underline"
          disabled={disabled}
          onClick={() => setAdding(!adding)}
        >
          {adding ? "Cancel subtask" : "+ Subtask"}
        </WriteButton>
        {adding && (
          <form onSubmit={add} className="mt-2 space-y-2">
            <fieldset disabled={disabled} className="space-y-2">
              <label className="block text-xs">
                Subtask title
                <WriteInput
                  ref={titleInput}
                  className={inputClass}
                  name="title"
                  required
                  maxLength={500}
                  autoFocus
                />
              </label>
              <label className="block text-xs">
                Subtask notes (optional)
                <WriteTextarea
                  className={inputClass}
                  name="notes"
                  rows={2}
                  maxLength={20000}
                />
              </label>
              <WriteButton type="submit" className={buttonClass}>
                Add subtask
              </WriteButton>
            </fieldset>
          </form>
        )}
      </OwnerOnly>
    </section>
  );
}

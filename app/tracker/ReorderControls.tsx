"use client";
import { OwnerOnly, WriteButton } from "@/app/RoleControls";
export default function ReorderControls({
  kind,
  id,
  name,
  siblings,
  status,
  disabled,
  mutate,
}: {
  kind: "work_package" | "task" | "subtask";
  id: string;
  name: string;
  siblings: { id: string; archived_at: string | null }[];
  status?: string;
  disabled: boolean;
  mutate: (
    path: string,
    method: "POST" | "PATCH",
    body: object,
  ) => Promise<boolean>;
}) {
  const active = siblings.filter((s) => !s.archived_at);
  const index = active.findIndex((s) => s.id === id);
  if (index < 0) return null;
  return (
    <OwnerOnly>
      <span
        className="inline-flex gap-1"
        role="group"
        aria-label={`Reorder ${name}`}
      >
        {(["up", "down"] as const).map((direction) => (
          <WriteButton
            key={direction}
            type="button"
            className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-neutral-700"
            aria-label={`Move ${name} ${direction}`}
            title={`Move ${direction}`}
            disabled={
              disabled ||
              (direction === "up" ? index === 0 : index === active.length - 1)
            }
            onClick={() =>
              mutate("/api/tracker/reorder", "POST", {
                kind,
                id,
                direction,
                ...(status ? { status } : {}),
              })
            }
          >
            {direction === "up" ? "↑" : "↓"}
          </WriteButton>
        ))}
      </span>
    </OwnerOnly>
  );
}

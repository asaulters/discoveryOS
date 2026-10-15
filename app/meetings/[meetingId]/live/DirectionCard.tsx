"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import type { HudState } from "@/lib/services/hudState";
import type { QuestionDirection } from "@/lib/types/database";

type DirectionActionKind = "use" | "dismiss" | "defer";

export default function DirectionCard({
  meetingId,
  direction,
  index,
  onUpdated,
}: {
  meetingId: string;
  direction: QuestionDirection;
  index: number;
  onUpdated: (hudState: HudState) => void;
}) {
  const [pendingAction, setPendingAction] = useState<DirectionActionKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: DirectionActionKind) {
    setError(null);
    setPendingAction(action);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/directions/${direction.id}/${action}`,
        { method: "POST" }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `Failed to ${action} direction`);
      }

      onUpdated(result as HudState);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} direction`);
      setPendingAction(null);
    }
  }

  const disabled = pendingAction !== null;

  return (
    <li className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="font-medium">
        {index + 1}. {direction.text}
      </p>
      {direction.reason && (
        <p className="mt-1 text-sm italic text-neutral-500">Why this matters: {direction.reason}</p>
      )}
      {direction.questions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
          {direction.questions.map((question, qIndex) => (
            <li key={qIndex}>{question}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <WriteButton
          onClick={() => handleAction("use")}
          disabled={disabled}
          className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pendingAction === "use" ? "Using..." : "Use"}
        </WriteButton>
        <WriteButton
          onClick={() => handleAction("defer")}
          disabled={disabled}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          {pendingAction === "defer" ? "Deferring..." : "Defer"}
        </WriteButton>
        <WriteButton
          onClick={() => handleAction("dismiss")}
          disabled={disabled}
          className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
        >
          {pendingAction === "dismiss" ? "Dismissing..." : "Dismiss"}
        </WriteButton>
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

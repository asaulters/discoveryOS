"use client";

import { WriteInput, WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import type { HudState } from "@/lib/services/hudState";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_MESSAGE_MS = 2500;

/**
 * Sprint 32 Part F: a one-line fallback for "DiscoveryOS runs mostly in
 * the background, but I need to jot one critical thing right now" -
 * deliberately smaller than the full Manual transcript textarea below it.
 * Submits through the exact same /transcript-segments route (no new data
 * model, no separate analysis path) - a quick note is a manual transcript
 * segment like any other, just captured through a narrower input. Always
 * rendered alongside Manual transcript/Live capture, so it stays reachable
 * in Quiet mode/Focus only too (see HudShell.tsx - that section is never
 * hidden by either mode).
 */
export default function QuickAnchorNote({
  meetingId,
  onAnalyzed,
}: {
  meetingId: string;
  onAnalyzed: (hudState: HudState) => void;
}) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) return;

    setError(null);
    setStatus("saving");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcript-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save note");
      }

      // The segment is saved either way (see transcriptAnalysis.ts) - a
      // fastLoopWarning here still means the note itself is safe, just
      // that analysis needs a retry, which the shared HudShell-level
      // recovery banner already surfaces. No need to duplicate that here.
      onAnalyzed(result as HudState);
      setValue("");
      setStatus("saved");
      setTimeout(() => setStatus((prev) => (prev === "saved" ? "idle" : prev)), SAVED_MESSAGE_MS);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save note");
    }
  }

  const saving = status === "saving";

  return (
    <div className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <WriteInput
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (status !== "saving") setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving && value.trim()) {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="Stakeholder said…"
          disabled={saving}
          className="flex-1 rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        <WriteButton
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className="shrink-0 rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? "Saving…" : "Save + analyze note"}
        </WriteButton>
      </div>
      {status === "saved" && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">Note saved.</p>
      )}
      {status === "error" && error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

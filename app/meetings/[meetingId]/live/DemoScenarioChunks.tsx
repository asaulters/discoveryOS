"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import { getScenarioById } from "@/lib/scenarios";

/**
 * Sprint 10, Part D. Only rendered when the meeting was created via "Load
 * demo scenario" (meeting.scenario_id set). Manual control only, matching
 * the rest of the app's "no live audio yet" stance - chunks are never
 * auto-run, only copied or inserted into the transcript box for the user
 * to review and click Analyze Chunk themselves.
 */
export default function DemoScenarioChunks({
  scenarioId,
  onInsert,
}: {
  scenarioId: string;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const scenario = getScenarioById(scenarioId);
  if (!scenario || scenario.transcriptChunks.length === 0) {
    return null;
  }

  async function handleCopy(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 2000);
    } catch {
      // Clipboard permission can be denied by the browser - Insert below is
      // a full fallback, so this stays a silent no-op rather than an error.
    }
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Demo/scenario helper
        </h2>
        <span className="text-xs text-neutral-400">{open ? "Hide" : "Show"}</span>
      </button>
      <p className="mt-1 text-xs text-neutral-500">
        {scenario.name} — {scenario.transcriptChunks.length} chunks. Only shown because this
        meeting was created from a demo scenario - nothing runs automatically; copy or insert
        one chunk at a time, then click Analyze Chunk yourself.
      </p>
      {open && (
        <ol className="mt-3 space-y-3">
          {scenario.transcriptChunks.map((chunk, index) => (
            <li
              key={chunk.label}
              className="rounded border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-neutral-500">{chunk.label}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(index, chunk.text)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                  <WriteButton
                    type="button"
                    onClick={() => onInsert(chunk.text)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
                  >
                    Insert
                  </WriteButton>
                </div>
              </div>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{chunk.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

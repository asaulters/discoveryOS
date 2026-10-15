"use client";

import { WriteTextarea, WriteButton } from "@/app/RoleControls";

import { useEffect, useRef, useState } from "react";
import type { HudState } from "@/lib/services/hudState";

type Status = "idle" | "analyzing" | "success" | "error" | "warning" | "retrying";

const SUCCESS_MESSAGE_MS = 3000;

export default function ManualTranscriptInput({
  meetingId,
  value,
  onValueChange,
  onAnalyzed,
}: {
  meetingId: string;
  /** Lifted to HudShell (rather than owned locally) so the demo-scenario chunks panel can insert a chunk's text directly into this box. */
  value: string;
  onValueChange: (text: string) => void;
  onAnalyzed: (hudState: HudState) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  async function handleAnalyze() {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus("error");
      setError("Paste a transcript chunk first.");
      return;
    }

    setError(null);
    setWarning(null);
    setStatus("analyzing");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcript-segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to analyze transcript chunk");
      }

      const hudState = result as HudState;
      onAnalyzed(hudState);
      // The transcript segment is always saved before analysis runs (see
      // transcriptAnalysis.ts), so a fastLoopWarning here means the text is
      // safe but the AI pass over it failed - never lose the paste, but
      // don't claim success either.
      if (hudState.fastLoopWarning) {
        onValueChange("");
        setStatus("warning");
        setWarning(hudState.fastLoopWarning);
        return;
      }

      onValueChange("");
      setStatus("success");
      successTimeoutRef.current = setTimeout(() => setStatus("idle"), SUCCESS_MESSAGE_MS);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to analyze transcript chunk");
    }
  }

  async function handleRetryAnalysis() {
    setStatus("retrying");
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/analyze-pending`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Retry failed");
      }

      const hudState = result as HudState;
      onAnalyzed(hudState);

      if (hudState.fastLoopWarning) {
        setStatus("warning");
        setWarning(hudState.fastLoopWarning);
        return;
      }

      setWarning(null);
      setStatus("success");
      successTimeoutRef.current = setTimeout(() => setStatus("idle"), SUCCESS_MESSAGE_MS);
    } catch (err) {
      setStatus("warning");
      setWarning(err instanceof Error ? err.message : "Retry failed");
    }
  }

  const analyzing = status === "analyzing" || status === "retrying";

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Manual transcript
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Paste one chunk of transcript at a time and analyze it manually. Use this when the
        browser mic misses remote audio. Transcript is saved before analysis runs.
      </p>
      <WriteTextarea
        className="mt-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        rows={4}
        placeholder="Paste transcript chunk..."
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          if (status !== "analyzing") setStatus("idle");
        }}
        disabled={analyzing}
      />
      <div className="mt-3 flex items-center gap-3">
        <WriteButton
          onClick={handleAnalyze}
          disabled={analyzing || !value.trim()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {status === "analyzing" ? "Analyzing..." : "Analyze Chunk"}
        </WriteButton>
        {status === "success" && (
          <p className="text-sm text-green-600 dark:text-green-400">Analyzed — HUD updated.</p>
        )}
        {status === "error" && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      {(status === "warning" || status === "retrying") && (
        <div className="mt-3 flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Transcript saved, but analysis failed or timed out. You can retry analysis.
            {warning ? ` (${warning})` : ""}
          </p>
          <WriteButton
            onClick={handleRetryAnalysis}
            disabled={status === "retrying"}
            className="shrink-0 rounded border border-amber-400 px-3 py-1 text-sm font-medium text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200"
          >
            {status === "retrying" ? "Retrying..." : "Retry analysis"}
          </WriteButton>
        </div>
      )}
    </section>
  );
}

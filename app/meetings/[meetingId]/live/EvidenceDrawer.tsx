"use client";

import { useEffect } from "react";
import type {
  ConfidenceLevel,
  EvidenceType,
  TranscriptSegment,
  WorkflowSourceOrigin,
} from "@/lib/types/database";

export interface EvidenceSelection {
  title: string;
  kind: "step" | "component" | "gap";
  evidenceType: EvidenceType;
  /** Gaps have no ordinal confidence_level - null when not applicable. */
  confidenceLevel: ConfidenceLevel | null;
  confidenceReason: string;
  sourceQuote: string | null;
  /** The full cited transcript segment, or null if nothing was cited (or the citation didn't survive validation). */
  segment: TranscriptSegment | null;
  sourceOrigin: WorkflowSourceOrigin;
  humanVerified: boolean;
  lockedByUser: boolean;
  humanNote: string | null;
}

function sourceOriginLabel(sourceOrigin: WorkflowSourceOrigin): string {
  return sourceOrigin === "ai" ? "AI-generated" : "Human edited";
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function evidenceTypeStyles(evidenceType: EvidenceType) {
  switch (evidenceType) {
    case "known":
      return "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400";
    case "inferred":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400";
    case "unknown":
      return "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";
  }
}

export function EvidenceBadge({ evidenceType }: { evidenceType: EvidenceType }) {
  const label = evidenceType === "known" ? "Known" : evidenceType === "inferred" ? "Inferred" : "Unknown";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${evidenceTypeStyles(evidenceType)}`}
    >
      {label}
    </span>
  );
}

export default function EvidenceDrawer({
  selection,
  onClose,
}: {
  selection: EvidenceSelection | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!selection) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, onClose]);

  if (!selection) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close evidence drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">{selection.title}</h3>
          <button
            onClick={onClose}
            className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium dark:border-neutral-700"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <EvidenceBadge evidenceType={selection.evidenceType} />
          {selection.confidenceLevel && (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium capitalize dark:border-neutral-700">
              {selection.confidenceLevel} confidence
            </span>
          )}
          <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700">
            {sourceOriginLabel(selection.sourceOrigin)}
          </span>
          {selection.humanVerified && (
            <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
              Verified
            </span>
          )}
          {selection.lockedByUser && (
            <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
              Locked
            </span>
          )}
        </div>

        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Confidence reason
          </h4>
          <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            {selection.confidenceReason || "No reason recorded."}
          </p>
        </div>

        {selection.humanNote && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Human note
            </h4>
            <p className="mt-1 rounded border border-neutral-200 bg-neutral-50 p-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
              {selection.humanNote}
            </p>
          </div>
        )}

        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Source quote
          </h4>
          {selection.sourceQuote ? (
            <p className="mt-1 rounded border border-neutral-200 bg-neutral-50 p-2 text-sm italic text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
              &ldquo;{selection.sourceQuote}&rdquo;
            </p>
          ) : (
            <p className="mt-1 text-sm text-neutral-400">No direct quote cited.</p>
          )}
        </div>

        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Transcript segment
          </h4>
          {selection.segment ? (
            <div className="mt-1 rounded border border-neutral-200 p-2 dark:border-neutral-800">
              <span className="text-xs text-neutral-400">
                {formatTimestamp(selection.segment.created_at)}
              </span>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                {selection.segment.raw_text}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-neutral-400">
              No transcript segment linked to this item.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import type { WorkflowSourceOrigin } from "@/lib/types/database";

/**
 * Shared badge components for anything rendering workflow steps/components/
 * gaps - originally local to WorkflowPanel.tsx, extracted in Sprint 9 so the
 * new Workflow Diagram page renders identical badges instead of duplicating
 * this markup.
 */

export function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium capitalize dark:border-neutral-700">
      {level}
    </span>
  );
}

export function SourceOriginBadge({ sourceOrigin }: { sourceOrigin: WorkflowSourceOrigin }) {
  const isAi = sourceOrigin === "ai";
  return (
    <span
      className={
        isAi
          ? "rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:border-neutral-700"
          : "rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400"
      }
    >
      {isAi ? "AI-generated" : "Human edited"}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <span className="rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
      Verified
    </span>
  );
}

export function LockedBadge() {
  return (
    <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
      Locked
    </span>
  );
}

export function GapStatusBadge({ status }: { status: "answered" | "dismissed" }) {
  return (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium capitalize text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
      {status}
    </span>
  );
}

export function componentTypeLabel(componentType: string): string {
  return componentType.replace(/_/g, " ");
}

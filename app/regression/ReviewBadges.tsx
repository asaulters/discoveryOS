import type { RegressionResult } from "@/lib/types/database";
import type { InspectionTarget, ReviewSeverity } from "@/lib/services/regressionReviewClassify";

/** Shared badge/link styling for the Sprint 24 regression review UX - used by both the single-run and batch-run review components. */

export function ResultBadge({ result }: { result: RegressionResult }) {
  const styles: Record<RegressionResult, string> = {
    pass: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    warn: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    fail: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[result]}`}>
      {result}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: ReviewSeverity }) {
  const styles: Record<ReviewSeverity, string> = {
    info: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    warning: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    critical: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  const labels: Record<ReviewSeverity, string> = { info: "Info", warning: "Warning", critical: "Critical" };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}

const INSPECTION_TARGET_LABELS: Record<InspectionTarget, string> = {
  workflow: "Workflow",
  review: "Review",
  share: "Share",
  evaluate: "Evaluate",
  debug: "Debug",
  regression: "Regression",
  live: "Live",
  unknown: "",
};

/** Meeting-scoped path for an inspection target, or null when the target has no single meeting page to jump to (e.g. "unknown"). */
export function inspectionHref(target: InspectionTarget, meetingId: string | null): string | null {
  if (!meetingId) return null;
  if (target === "unknown" || target === "regression") return null;
  return `/meetings/${meetingId}/${target}`;
}

export function inspectionLabel(target: InspectionTarget): string {
  return INSPECTION_TARGET_LABELS[target] || "Details";
}

export function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

import type { PilotIssueSeverity, PilotIssueStatus } from "@/lib/types/database";

/** Sprint 20: shared severity/status labels + badge styles for tracked pilot issues, used by both the Review page panel and the /pilot dashboard so the two never drift. */

export const PILOT_ISSUE_SEVERITY_OPTIONS: { value: PilotIssueSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const PILOT_ISSUE_STATUS_LABELS: Record<PilotIssueStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const PILOT_ISSUE_SEVERITY_STYLES: Record<PilotIssueSeverity, string> = {
  low: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
  medium:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
  high:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  critical:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
};

export const PILOT_ISSUE_STATUS_STYLES: Record<PilotIssueStatus, string> = {
  open: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  resolved:
    "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
  dismissed: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
};

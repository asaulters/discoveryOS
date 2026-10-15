/**
 * Sprint 19: deterministic keyword categorization for `issues_observed`
 * free text - no AI, no fuzzy matching. Purely a way to put a chip on an
 * issue so recurring themes are scannable on the /pilot dashboard, not a
 * classification system anything else depends on.
 */

export type IssueCategory =
  | "live_capture"
  | "suggested_directions"
  | "still_to_explore"
  | "process_extraction"
  | "evidence_quality"
  | "review_export"
  | "ui_confusion"
  | "performance"
  | "other";

export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  live_capture: "Live capture",
  suggested_directions: "Suggested directions",
  still_to_explore: "Still to explore",
  process_extraction: "Process extraction",
  evidence_quality: "Evidence quality",
  review_export: "Review/export",
  ui_confusion: "UI confusion",
  performance: "Performance",
  other: "Other",
};

const KEYWORDS: { category: IssueCategory; terms: string[] }[] = [
  { category: "live_capture", terms: ["mic", "audio", "transcript", "capture"] },
  { category: "suggested_directions", terms: ["question", "direction", "generic"] },
  { category: "still_to_explore", terms: ["still to explore", "focus", "thread"] },
  { category: "process_extraction", terms: ["process", "workflow", "step", "actor", "system"] },
  { category: "evidence_quality", terms: ["quote", "evidence", "source"] },
  { category: "review_export", terms: ["review", "export", "markdown", "share"] },
  { category: "ui_confusion", terms: ["confusing", "unclear", "ui", "button"] },
  { category: "performance", terms: ["slow", "latency", "timeout"] },
];

/** No text -> no categories. Text with no keyword match -> "other". Text can match more than one category. */
export function categorizeIssueText(text: string | null | undefined): IssueCategory[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const matched = KEYWORDS.filter(({ terms }) => terms.some((term) => lower.includes(term))).map(
    ({ category }) => category
  );

  return matched.length > 0 ? matched : ["other"];
}

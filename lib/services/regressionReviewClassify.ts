import type { RegressionResult } from "@/lib/types/database";

/**
 * Sprint 24: pure, deterministic classification of a raw regression check
 * into something a human can scan and triage - no AI, no DB access. Kept
 * in its own file, separate from lib/services/regressionReview.ts (which
 * fetches from the database), specifically so client components can import
 * only this pure module without pulling server-only code
 * (createServerSupabaseClient, env vars) into the client bundle.
 */

export type ReviewSeverity = "info" | "warning" | "critical";

export type InspectionTarget =
  | "workflow"
  | "review"
  | "share"
  | "evaluate"
  | "debug"
  | "regression"
  | "live"
  | "unknown";

export const REVIEW_GROUPS = [
  "Trust and evidence",
  "Missing expected discovery output",
  "Workflow structure",
  "People and systems",
  "Conversation state",
  "Needs clarification / mismatches",
  "Applied AI pattern fit",
  "Export/share safety",
  "Scenario metadata",
  "App/pipeline health",
  "Other",
] as const;

export type ReviewGroup = (typeof REVIEW_GROUPS)[number];

/** A raw check, loosely typed so both persisted RegressionCheck rows and ad-hoc drafts work. */
export interface RawRegressionCheckLike {
  id?: string;
  category: string;
  label: string;
  expected: string | null;
  actual: string | null;
  result: RegressionResult;
  notes: string | null;
}

export interface ClassifiedRegressionCheck {
  id: string;
  result: RegressionResult;
  category: string;
  check: string;
  expected: string | null;
  actual: string | null;
  notes: string | null;
  /** Sprint 23 evidence-quality reasons translated into plain language, when notes carries them - null when there's nothing to translate (Part E). */
  friendlyNotes: string | null;
  severity: ReviewSeverity;
  reviewGroup: ReviewGroup;
  likelyMeaning: string;
  suggestedInspectionTarget: InspectionTarget;
}

// ---------------------------------------------------------------------------
// Part E: evidence-quality reason translation. lib/evidence/evidenceQuality.ts
// already writes fairly readable sentences (not raw codes) into a check's
// notes (see lib/services/regressionRunner.ts's formatEvidenceIssue, added
// this same sprint) - this table still translates them into shorter, even
// plainer wording, and also defensively matches literal reason-code-style
// tokens (label_echo, missing_quote, ...) in case they ever appear verbatim.
// Runs are pre-Sprint-24 (or pre-Sprint-23) simply won't match anything
// here and fall back to showing the original notes untouched (Part H).
// ---------------------------------------------------------------------------

const EVIDENCE_REASON_TRANSLATIONS: { match: RegExp; friendly: string }[] = [
  { match: /label_echo|identical to the item's own label/i, friendly: "Quote only echoed the item's own label, not new information." },
  { match: /trivially_short|no specific noun\/system\/metric/i, friendly: "Quote was too short to meaningfully support a known claim." },
  { match: /generic_filler|filler phrase|dominated by filler/i, friendly: "Quote was mostly generic confirmation, not specific content." },
  { match: /missing_quote|missing source_quote/i, friendly: "Known item had no supporting quote." },
  { match: /non_substring|not a real substring/i, friendly: "Quote was not found in the cited transcript." },
  { match: /unverifiable_segment|no cited transcript segment/i, friendly: "Quote could not be verified against a transcript segment." },
  { match: /facilitator_sourced|facilitator question\/hypothesis/i, friendly: "Facilitator wording cannot support a known stakeholder workflow fact." },
  { match: /low_overlap|shares no obvious wording/i, friendly: "Quote did not clearly support the structured claim." },
];

/**
 * Translates evidence-quality reason text embedded in a check's notes into
 * short, plain-language sentences. Only applied to "Trust and evidence"
 * (Evidence safety category) checks - other categories' notes are already
 * plain prose and are shown as-is. Returns null if there's nothing
 * translatable (e.g. a passing check, or notes that don't match any known
 * evidence-quality phrasing).
 */
export function translateEvidenceNotes(notes: string | null): string | null {
  if (!notes) return null;
  const matched = new Set<string>();
  for (const { match, friendly } of EVIDENCE_REASON_TRANSLATIONS) {
    if (match.test(notes)) matched.add(friendly);
  }
  if (matched.size === 0) return null;
  return Array.from(matched).join(" ");
}

interface CategoryClassification {
  reviewGroup: ReviewGroup;
  target: InspectionTarget;
  meaning: (result: RegressionResult) => string;
}

/**
 * Maps a check's `category` string (as produced by
 * lib/services/regressionRunner.ts) to a review group/inspection target/
 * plain-language meaning. Category prefixes ("People & systems - actors",
 * "Process so far - steps") are matched with startsWith since the runner
 * appends a subtype suffix.
 */
function classifyByCategory(category: string): CategoryClassification {
  if (category === "Evidence safety") {
    return {
      reviewGroup: "Trust and evidence",
      target: "workflow",
      meaning: (result) =>
        result === "fail"
          ? "A workflow item's evidence is fabricated, unverifiable, or too weak to support a 'known' claim."
          : result === "warn"
            ? "A workflow item's evidence is real but weaker than ideal - worth a glance, not necessarily wrong."
            : "Evidence quality looks fine.",
    };
  }
  if (category === "Export safety") {
    return {
      reviewGroup: "Export/share safety",
      target: "share",
      meaning: (result) =>
        result === "fail"
          ? "Exported/shared output leaked something it shouldn't have (a raw id, a resolved item shown as open, or internal terminology)."
          : "Export/share output looks clean.",
    };
  }
  if (category === "Scenario metadata") {
    return {
      reviewGroup: "Scenario metadata",
      target: "debug",
      meaning: (result) =>
        result === "fail"
          ? "The meeting isn't correctly linked to a scenario fixture - everything else in this run may be skipped until this is fixed."
          : "Scenario metadata looks fine.",
    };
  }
  if (category === "Conversation state") {
    return {
      reviewGroup: "Conversation state",
      target: "workflow",
      meaning: (result) =>
        result === "fail"
          ? "A facilitator's own question/hypothesis was used as if it were confirmed stakeholder evidence."
          : result === "warn"
            ? "No conversation-state data was available to check this - not itself a problem, just an incomplete check."
            : "Facilitator wording is correctly kept separate from confirmed workflow facts.",
    };
  }
  if (category === "Needs clarification") {
    return {
      reviewGroup: "Needs clarification / mismatches",
      target: "workflow",
      meaning: () => "An expected ambiguity/clarification point wasn't found as an open 'Needs clarification' item.",
    };
  }
  if (category === "Possible mismatches") {
    return {
      reviewGroup: "Needs clarification / mismatches",
      target: "workflow",
      meaning: () => "An expected possible mismatch wasn't found as an open contradiction candidate.",
    };
  }
  if (category === "Applied AI pattern fit") {
    return {
      reviewGroup: "Applied AI pattern fit",
      target: "review",
      meaning: (result) =>
        result === "fail"
          ? "A high-autonomy pattern (tool-using agent, voice/conversation agent) was recommended more strongly than the evidence supports."
          : result === "warn"
            ? "An expected pattern fit wasn't found, or no Applied AI assessment has been generated yet for this meeting."
            : "Pattern fit results match expectations.",
    };
  }
  if (category === "Still unclear") {
    return {
      reviewGroup: "Missing expected discovery output",
      target: "workflow",
      meaning: () => "An expected open gap wasn't found in the workflow's 'Still unclear' list.",
    };
  }
  if (category.startsWith("Process so far")) {
    return {
      reviewGroup: "Missing expected discovery output",
      target: "workflow",
      meaning: () => "An expected process step wasn't found in the workflow.",
    };
  }
  if (category.startsWith("People & systems")) {
    return {
      reviewGroup: "People and systems",
      target: "workflow",
      meaning: () => "An expected actor or system wasn't found among the workflow's components.",
    };
  }
  if (category === "Run") {
    return {
      reviewGroup: "App/pipeline health",
      target: "debug",
      meaning: () => "The regression run itself crashed - an app/pipeline problem, not a content quality issue.",
    };
  }
  return {
    reviewGroup: "Other",
    target: "unknown",
    meaning: () => "Uncategorized check.",
  };
}

let classifiedIdCounter = 0;

/**
 * Classifies one raw regression check. Deterministic, no AI: severity is a
 * direct, unmodified reflection of the persisted pass/warn/fail result
 * (fail -> critical, warn -> warning, pass -> info) - this function only
 * adds presentation metadata (grouping/meaning/target), it never
 * reinterprets or changes the underlying result.
 */
export function classifyRegressionCheck(check: RawRegressionCheckLike): ClassifiedRegressionCheck {
  const { reviewGroup, target, meaning } = classifyByCategory(check.category);
  const severity: ReviewSeverity = check.result === "fail" ? "critical" : check.result === "warn" ? "warning" : "info";
  const friendlyNotes = reviewGroup === "Trust and evidence" ? translateEvidenceNotes(check.notes) : null;

  return {
    id: check.id ?? `check-${classifiedIdCounter++}`,
    result: check.result,
    category: check.category,
    check: check.label,
    expected: check.expected,
    actual: check.actual,
    notes: check.notes,
    friendlyNotes,
    severity,
    reviewGroup,
    likelyMeaning: meaning(check.result),
    suggestedInspectionTarget: target,
  };
}

export interface GroupedRegressionChecks {
  reviewGroup: ReviewGroup;
  checks: ClassifiedRegressionCheck[];
  failCount: number;
  warnCount: number;
  passCount: number;
}

/**
 * Groups already-classified checks by reviewGroup, in the canonical
 * REVIEW_GROUPS order (only groups with at least one check are included),
 * with fail-before-warn-before-pass ordering within each group.
 */
export function groupRegressionChecks(checks: ClassifiedRegressionCheck[]): GroupedRegressionChecks[] {
  const byGroup = new Map<ReviewGroup, ClassifiedRegressionCheck[]>();
  for (const check of checks) {
    const bucket = byGroup.get(check.reviewGroup) ?? [];
    bucket.push(check);
    byGroup.set(check.reviewGroup, bucket);
  }

  const resultOrder: Record<RegressionResult, number> = { fail: 0, warn: 1, pass: 2 };

  return REVIEW_GROUPS.filter((group) => byGroup.has(group)).map((group) => {
    const groupChecks = [...byGroup.get(group)!].sort((a, b) => resultOrder[a.result] - resultOrder[b.result]);
    return {
      reviewGroup: group,
      checks: groupChecks,
      failCount: groupChecks.filter((c) => c.result === "fail").length,
      warnCount: groupChecks.filter((c) => c.result === "warn").length,
      passCount: groupChecks.filter((c) => c.result === "pass").length,
    };
  });
}

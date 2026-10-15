import type { EvidenceType } from "@/lib/types/database";

/**
 * Sprint 23: deterministic evidence-quality validation, shared by workflow
 * persistence (lib/services/workflowExtractorService.ts) and the
 * regression evidence-safety checks (lib/services/regressionRunner.ts) so
 * the two can never quietly disagree about what counts as strong evidence.
 * No AI, no network calls - pure string/token checks only. See Sprint 22's
 * real "Support agent" finding (docs/progress.md, Sprint 23 Part A) for the
 * motivating case: a real, non-fabricated quote that was nonetheless
 * useless as evidence because it was just an echo of the item's own label.
 *
 * Design principle (Sprint 23 Part I): correct behavior is graded, not
 * binary. A missing/fake/unverifiable quote is "fail" (never persist as
 * known). A real-but-weak quote is "warn" (downgrade to inferred, keep the
 * quote for context). A strong, specific, on-topic quote is "pass" (known
 * stands). Never punish a quote merely for containing one ordinary word -
 * only for being dominated by filler with no specific content.
 */

export type EvidenceQualitySeverity = "pass" | "warn" | "fail";

/**
 * Stable, machine-readable identifiers for each rule, alongside the
 * human-readable `reasons` strings - lets a caller decide "keep the quote
 * but downgrade" (a real quote that's merely weak: label_echo,
 * trivially_short, generic_filler, low_overlap) vs. "drop the quote
 * entirely" (it's not trustworthy at all: missing_quote, non_substring,
 * facilitator_sourced) without string-matching prose.
 */
export type EvidenceQualityReasonCode =
  | "missing_quote"
  | "non_substring"
  | "unverifiable_segment"
  | "label_echo"
  | "trivially_short"
  | "generic_filler"
  | "low_overlap"
  | "facilitator_sourced";

const UNTRUSTWORTHY_QUOTE_CODES: ReadonlySet<EvidenceQualityReasonCode> = new Set([
  "missing_quote",
  "non_substring",
  "unverifiable_segment",
  "facilitator_sourced",
]);

export interface EvidenceQualityResult {
  /** True unless severity is "fail" - a "warn" result is still usable, just not strong enough for "known". */
  isValid: boolean;
  severity: EvidenceQualitySeverity;
  /** Short, human-readable reasons, worst-first - empty when severity is "pass". */
  reasons: string[];
  /** Same findings as `reasons`, as stable codes - see EvidenceQualityReasonCode. */
  reasonCodes: EvidenceQualityReasonCode[];
  /** True if the quote itself is untrustworthy (missing/fake/unverifiable/facilitator-sourced) and should be dropped rather than kept alongside a downgrade. */
  quoteIsUntrustworthy: boolean;
  normalizedQuote: string;
  normalizedClaimText?: string;
}

export interface EvidenceQualityInput {
  claimTitle: string;
  claimDescription?: string | null;
  quote: string | null;
  /** Full text of the transcript segment source_transcript_segment_id points at, or null if unknown/invalid. */
  segmentText: string | null;
  evidenceType: EvidenceType;
  /**
   * Normalized (or raw - normalized internally) excerpts of facilitator
   * questions/hypotheses for this meeting (e.g. from conversation_events).
   * Optional - omit when unavailable, the check is simply skipped.
   */
  facilitatorExcerpts?: string[];
}

// ---------------------------------------------------------------------------
// Normalization - mirrors the case-insensitive-fallback convention already
// established in lib/ai/contradictionDetectorService.ts's
// normalizeForQuoteMatch, extended with lowercasing since every comparison
// here (label echo, filler, facilitator-excerpt matching) is case-insensitive.
// ---------------------------------------------------------------------------

export function normalizeEvidenceText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stripPunctuation(text: string): string {
  return text.replace(/[.,!?;:"'()[\]{}\-–—]/g, " ").replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  const stripped = stripPunctuation(normalizeEvidenceText(text));
  return stripped.length > 0 ? stripped.split(" ") : [];
}

function tokenize(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length > 2));
}

// ---------------------------------------------------------------------------
// Rule 3: trivially short, unless a specific noun/system/metric/status
// token rescues a short quote (e.g. "Salesforce", "Legal", "$500").
// ---------------------------------------------------------------------------

const MIN_MEANINGFUL_WORDS_KNOWN = 6;
const MIN_MEANINGFUL_WORDS_INFERRED = 3;

const GENERIC_CAPITALIZED_WORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "we", "they", "it",
  "i", "you", "he", "she", "if", "so", "yes", "no", "ok", "okay",
]);

/** A raw (pre-normalization, case preserved) token that looks like a proper noun, a dollar amount, or otherwise contains a digit. */
function hasSpecificToken(rawQuote: string): boolean {
  const rawTokens = rawQuote.split(/\s+/).map((t) => t.replace(/[.,!?;:"'()[\]{}]/g, ""));
  return rawTokens.some((token) => {
    if (!token) return false;
    if (/\d/.test(token)) return true;
    if (/^[A-Z]/.test(token) && token.length >= 3 && !GENERIC_CAPITALIZED_WORDS.has(token.toLowerCase())) {
      return true;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Rule 4: generic filler. Two layers - an exact/near-exact "pure filler
// phrase" match (catches "Yes.", "It depends.", "That is correct.") and a
// ratio-based fallback for a longer quote that's still mostly padding.
// Deliberately excludes ordinary domain words ("process", "issue",
// "request") from the ratio set per Part B's own instruction not to reject
// a quote merely for containing one of them.
// ---------------------------------------------------------------------------

const PURE_FILLER_PHRASES = new Set(
  [
    "yes", "yeah", "yep", "right", "correct", "exactly", "sure", "ok", "okay",
    "that is right", "that is correct", "thats right", "thats correct",
    "we do", "it depends", "depends", "sometimes", "usually", "basically",
    "kind of", "sort of", "someone handles it", "the process", "that part",
    "the issue is there", "review process",
  ].map((p) => normalizeEvidenceText(p))
);

const FILLER_RATIO_WORDS = new Set([
  "yes", "yeah", "yep", "right", "correct", "exactly", "sure", "ok", "okay",
  "depends", "sometimes", "usually", "basically", "kind", "sort", "really",
  "actually", "mostly", "pretty", "much", "just", "like",
]);

function isPureFillerPhrase(quote: string): boolean {
  const normalized = normalizeEvidenceText(quote).replace(/[.!?]+$/g, "");
  return PURE_FILLER_PHRASES.has(normalized);
}

function isMostlyFiller(quote: string): boolean {
  const w = words(quote);
  if (w.length === 0) return false;
  const fillerCount = w.filter((token) => FILLER_RATIO_WORDS.has(token)).length;
  const nonFillerMeaningful = w.filter((token) => token.length > 2 && !FILLER_RATIO_WORDS.has(token));
  return fillerCount / w.length > 0.6 && nonFillerMeaningful.length < 3;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function meaningfulWordFloor(evidenceType: EvidenceType): number {
  return evidenceType === "known" ? MIN_MEANINGFUL_WORDS_KNOWN : MIN_MEANINGFUL_WORDS_INFERRED;
}

export function assessEvidenceQuality(input: EvidenceQualityInput): EvidenceQualityResult {
  const { claimTitle, claimDescription, quote, segmentText, evidenceType, facilitatorExcerpts } = input;

  const claimText = [claimTitle, claimDescription ?? ""].filter(Boolean).join(" ");
  const normalizedClaimText = normalizeEvidenceText(claimText);
  const normalizedQuote = quote ? normalizeEvidenceText(quote) : "";

  // Tracked as a numeric rank rather than the EvidenceQualitySeverity union
  // itself - TypeScript's control-flow narrowing doesn't follow mutations
  // made through a closure back into the enclosing function, so comparing a
  // closure-mutated union-typed `let` against string literals later in this
  // function produces false "no overlap" errors. A number has no such
  // narrowing to fight; the union string is only materialized at the end.
  const SEVERITY_RANK: Record<EvidenceQualitySeverity, number> = { pass: 0, warn: 1, fail: 2 };
  const SEVERITY_BY_RANK: EvidenceQualitySeverity[] = ["pass", "warn", "fail"];
  const reasons: string[] = [];
  const reasonCodes: EvidenceQualityReasonCode[] = [];
  let severityRank = 0;
  const escalate = (next: EvidenceQualitySeverity, code: EvidenceQualityReasonCode, reason: string) => {
    reasons.push(reason);
    reasonCodes.push(code);
    severityRank = Math.max(severityRank, SEVERITY_RANK[next]);
  };
  const finish = (): EvidenceQualityResult => {
    const severity = SEVERITY_BY_RANK[severityRank];
    return {
      isValid: severity !== "fail",
      severity,
      reasons,
      reasonCodes,
      quoteIsUntrustworthy: reasonCodes.some((code) => UNTRUSTWORTHY_QUOTE_CODES.has(code)),
      normalizedQuote,
      normalizedClaimText,
    };
  };

  // Gaps (evidence_type "unknown") only need to not be actively misleading -
  // no length/filler/overlap requirements at all.
  if (evidenceType === "unknown") {
    if (quote && segmentText !== null) {
      const normalizedSegment = normalizeEvidenceText(segmentText);
      if (!normalizedSegment.includes(normalizedQuote)) {
        escalate("fail", "non_substring", "Quote is not a real substring of its cited transcript segment.");
      }
    }
    return finish();
  }

  // Rule 1: quote existence (known only - inferred may legitimately have none).
  if (!quote || !quote.trim()) {
    if (evidenceType === "known") {
      escalate("fail", "missing_quote", "Missing source_quote for known evidence.");
    }
    return finish();
  }

  // Rule 2: real transcript substring - unverifiable is treated the same as fake.
  if (segmentText === null) {
    escalate("fail", "unverifiable_segment", "No cited transcript segment to verify the quote against.");
  } else {
    const normalizedSegment = normalizeEvidenceText(segmentText);
    if (!normalizedSegment.includes(normalizedQuote)) {
      escalate("fail", "non_substring", "Quote is not a real substring of its cited transcript segment.");
    }
  }

  // The remaining checks assume a real, verified quote - a fabricated/
  // unverifiable one is already a hard fail regardless of what else is true.
  if (severityRank < SEVERITY_RANK.fail) {
    const meaningfulWords = words(quote).length;
    const floor = meaningfulWordFloor(evidenceType);

    // Rule 5: label echo - the quote is just the item's own title/label restated.
    if (normalizedQuote === normalizeEvidenceText(claimTitle)) {
      escalate(
        evidenceType === "known" ? "fail" : "warn",
        "label_echo",
        `Quote is identical to the item's own label ("${claimTitle}") - it confirms the term was said, not that anything specific supports it.`
      );
    }

    // Rule 3: trivially short, unless a specific noun/metric rescues it.
    if (meaningfulWords < floor && !hasSpecificToken(quote)) {
      escalate(
        evidenceType === "known" ? "fail" : "warn",
        "trivially_short",
        `Quote is only ${meaningfulWords} word(s) with no specific noun/system/metric to compensate (minimum ${floor} for ${evidenceType} evidence).`
      );
    }

    // Rule 4: generic filler.
    if (isPureFillerPhrase(quote)) {
      escalate(
        evidenceType === "known" ? "fail" : "warn",
        "generic_filler",
        `Quote is a generic filler phrase ("${quote.trim()}") with no specific content.`
      );
    } else if (isMostlyFiller(quote)) {
      escalate(
        evidenceType === "known" ? "fail" : "warn",
        "generic_filler",
        "Quote is dominated by filler words with little specific content."
      );
    }

    // Rule 6: claim overlap - only a soft warn signal, never fail on its own,
    // and only applied to medium-length quotes. A long, richly-detailed quote
    // (roughly a full sentence or more) is very often a genuine paraphrase
    // that legitimately shares no literal words with a short item title
    // (e.g. claim "Failure detection" / quote "someone notices a few days
    // later when the customer follows up" - a real, strong quote with zero
    // token overlap) - penalizing that would be exactly the over-strictness
    // this helper is told to avoid, so length alone is left to vouch for it.
    const OVERLAP_CHECK_MAX_WORDS = 12;
    if (meaningfulWords >= floor && meaningfulWords < OVERLAP_CHECK_MAX_WORDS) {
      const claimTokens = tokenize(claimText);
      const quoteTokens = tokenize(quote);
      const overlap = [...claimTokens].some((t) => quoteTokens.has(t));
      const quoteInClaim = normalizedClaimText.includes(normalizedQuote) || normalizedQuote.includes(normalizedClaimText);
      if (!overlap && !quoteInClaim && claimTokens.size > 0) {
        escalate(
          "warn",
          "low_overlap",
          "Quote shares no obvious wording with the item's title/description - double-check it actually supports this specific item."
        );
      }
    }

    // Rule 7: facilitator-only guard - known evidence must come from the stakeholder, not the facilitator's own question/hypothesis.
    if (evidenceType === "known" && facilitatorExcerpts && facilitatorExcerpts.length > 0) {
      const isFacilitatorSourced = facilitatorExcerpts.some((excerpt) => {
        const normalizedExcerpt = normalizeEvidenceText(excerpt);
        return normalizedExcerpt.includes(normalizedQuote) || normalizedQuote.includes(normalizedExcerpt);
      });
      if (isFacilitatorSourced) {
        escalate(
          "fail",
          "facilitator_sourced",
          "Quote matches a facilitator question/hypothesis excerpt, not a stakeholder statement - cannot support known evidence."
        );
      }
    }
  }

  return finish();
}

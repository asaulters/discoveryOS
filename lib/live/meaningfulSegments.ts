/**
 * Sprint 13: deterministic ("no LLM") gate deciding whether the live-audio
 * transcript buffer is worth turning into a transcript_segment and running
 * the existing analysis pipeline on. Pure functions, no server-only deps,
 * so this module is safe to import from both the client buffer component
 * (for immediate "Ready to analyze" UI feedback) and the analyze-buffer
 * route (as the real enforcement gate - the client's read of these rules
 * is never trusted as the sole guard against an analysis storm).
 *
 * Token counts here are a rough word-based heuristic (filler/hedge words
 * filtered out), not a real tokenizer - "meaningful tokens" is a proxy for
 * "words that aren't just conversational noise," good enough for a
 * threshold check, not meant to match any LLM's actual tokenization.
 */

export const HIGH_SIGNAL_TERMS = [
  "approval",
  "legal",
  "security",
  "finance",
  "exception",
  "delayed",
  "wrong",
  "missing",
  "manual",
  "depends",
  "usually",
  "sometimes",
  "not always",
  "owner",
  "responsible",
  "handoff",
  "escalation",
  "compliance",
  "SLA",
  "threshold",
  "override",
  "state rule",
  "customer data",
  "new vendor",
  "contract",
  "quote",
  "duplicate",
  "outlier",
  "recheck",
  "bounced back",
  "restarted",
  "informal names",
  "system owner",
] as const;

const TOKEN_THRESHOLD = 40;
const SIGNAL_TOKEN_THRESHOLD = 15;
// A short chunk carrying multiple distinct high-signal terms at once is
// allowed to trigger below the plain single-term threshold - density of
// signal substitutes for length, but still requires real content (not a
// one-word utterance).
const MULTI_SIGNAL_TOKEN_THRESHOLD = 6;
const TIME_THRESHOLD_SECONDS = 45;
// Weakly-weighted floor for the actor+action+object regex heuristic - it
// never fires on a bare few-word fragment just because the shape matches;
// see matchesProcessStatementPattern's caller.
const PROCESS_PATTERN_MIN_TOKENS = 8;

const FILLER_PHRASES = [
  "let me think",
  "i mean",
  "you know",
  "i guess",
  "kind of",
  "sort of",
  "uh huh",
];

const FILLER_WORDS = new Set([
  "um",
  "umm",
  "uh",
  "uhh",
  "hmm",
  "mhm",
  "yeah",
  "yep",
  "yup",
  "nah",
  "okay",
  "ok",
  "so",
  "well",
  "like",
  "just",
  "actually",
  "basically",
  "literally",
  "right",
  "gonna",
  "wanna",
  "kinda",
  "guess",
]);

const PROCESS_ACTORS =
  "(agent|team|manager|rep|analyst|owner|customer|user|admin|engineer|support|specialist|reviewer|approver|system|department|group|lead|clerk|staff)";
const PROCESS_ACTIONS =
  "(checks?|reviews?|approves?|sends?|routes?|escalates?|verifies?|creates?|decides?|forwards?|assigns?|notifies?|updates?|submits?|rejects?|flags?|requires?|handles?|processes?|contacts?|confirms?|reaches?)";
const PROCESS_STATEMENT_PATTERN = new RegExp(
  `\\b${PROCESS_ACTORS}\\b(?:\\s+\\S+){0,6}?\\s+\\b${PROCESS_ACTIONS}\\b\\s+\\S+`,
  "i"
);

function normalizeForTokenCount(text: string): string {
  let normalized = text.toLowerCase();
  for (const phrase of FILLER_PHRASES) {
    normalized = normalized.split(phrase).join(" ");
  }
  return normalized;
}

/** Rough word-count-minus-filler heuristic - see module doc comment. */
export function meaningfulTokenCount(text: string): number {
  const normalized = normalizeForTokenCount(text)
    .replace(/[.,!?;:"()]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return normalized.filter((word) => !FILLER_WORDS.has(word)).length;
}

/** Case-insensitive substring match against HIGH_SIGNAL_TERMS, returned in their display casing. */
export function findSignalTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return HIGH_SIGNAL_TERMS.filter((term) => lower.includes(term.toLowerCase()));
}

function matchesProcessStatementPattern(text: string): boolean {
  return PROCESS_STATEMENT_PATTERN.test(text);
}

export type DetectionReason =
  | "empty"
  | "filler_only"
  | "analysis_paused"
  | "analysis_in_flight"
  | "manual_force"
  | "token_threshold"
  | "high_signal_short"
  | "time_threshold"
  | "process_statement_pattern"
  | "below_threshold";

export interface DetectionInput {
  /** Full accumulated not-yet-analyzed buffer text. */
  pendingText: string;
  /** Just the most recently transcribed chunk, for the high-signal-short rule. */
  latestChunkText: string;
  /** Seconds since the pending buffer went from empty to non-empty. */
  secondsSincePendingStart: number;
  analysisPaused: boolean;
  analysisInFlight: boolean;
  /** User clicked "Analyze pending" - bypasses every other rule and pause. */
  forced?: boolean;
}

export interface DetectionResult {
  shouldAnalyze: boolean;
  reason: DetectionReason;
  signalTerms: string[];
  tokenEstimate: number;
}

/**
 * Sprint 13 Part C rules, evaluated in order. Default is "do not analyze" -
 * every true result comes from an explicit rule firing, never an
 * opportunistic guess. See docs/live-audio-readiness.md for the product
 * rationale behind each threshold.
 */
export function detectMeaningfulSegment(input: DetectionInput): DetectionResult {
  const pendingTokenEstimate = meaningfulTokenCount(input.pendingText);
  const signalTerms = findSignalTerms(input.pendingText);

  if (input.forced) {
    return { shouldAnalyze: true, reason: "manual_force", signalTerms, tokenEstimate: pendingTokenEstimate };
  }

  if (input.analysisPaused) {
    return { shouldAnalyze: false, reason: "analysis_paused", signalTerms, tokenEstimate: pendingTokenEstimate };
  }

  if (input.analysisInFlight) {
    return { shouldAnalyze: false, reason: "analysis_in_flight", signalTerms, tokenEstimate: pendingTokenEstimate };
  }

  const rawWordCount = input.pendingText.trim().split(/\s+/).filter(Boolean).length;
  if (rawWordCount === 0) {
    return { shouldAnalyze: false, reason: "empty", signalTerms, tokenEstimate: 0 };
  }
  if (pendingTokenEstimate === 0) {
    return { shouldAnalyze: false, reason: "filler_only", signalTerms, tokenEstimate: 0 };
  }

  if (pendingTokenEstimate >= TOKEN_THRESHOLD) {
    return { shouldAnalyze: true, reason: "token_threshold", signalTerms, tokenEstimate: pendingTokenEstimate };
  }

  const latestSignalTerms = findSignalTerms(input.latestChunkText);
  const latestTokenEstimate = meaningfulTokenCount(input.latestChunkText);
  const highSignalShort =
    latestSignalTerms.length > 0 &&
    (latestTokenEstimate >= SIGNAL_TOKEN_THRESHOLD ||
      (latestSignalTerms.length >= 2 && latestTokenEstimate >= MULTI_SIGNAL_TOKEN_THRESHOLD));
  if (highSignalShort) {
    return {
      shouldAnalyze: true,
      reason: "high_signal_short",
      signalTerms: latestSignalTerms,
      tokenEstimate: pendingTokenEstimate,
    };
  }

  // Time-based accumulation still requires real content (guardrail: never
  // let elapsed time alone push a filler-only buffer through - the
  // pendingTokenEstimate === 0 filler_only check above already caught the
  // all-filler case, this re-affirms it can't sneak through here either).
  if (input.secondsSincePendingStart >= TIME_THRESHOLD_SECONDS && pendingTokenEstimate > 0) {
    return { shouldAnalyze: true, reason: "time_threshold", signalTerms, tokenEstimate: pendingTokenEstimate };
  }

  if (pendingTokenEstimate >= PROCESS_PATTERN_MIN_TOKENS && matchesProcessStatementPattern(input.pendingText)) {
    return {
      shouldAnalyze: true,
      reason: "process_statement_pattern",
      signalTerms,
      tokenEstimate: pendingTokenEstimate,
    };
  }

  return { shouldAnalyze: false, reason: "below_threshold", signalTerms, tokenEstimate: pendingTokenEstimate };
}

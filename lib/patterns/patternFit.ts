import {
  APPLIED_AI_PATTERNS,
  type AppliedAiPattern,
  type AppliedAiPatternId,
} from "@/lib/patterns/appliedAiPatterns";
import type { AppliedAiRecommendationType } from "@/lib/lenses/appliedAiOpportunityLens";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  Meeting,
  WorkflowComponent,
  WorkflowGap,
  WorkflowStep,
} from "@/lib/types/database";

/**
 * Sprint 26 Part B: deterministic (no AI call, ever) pattern-fit scorer.
 * Pure string/token heuristics only, same convention as
 * lib/live/meaningfulSegments.ts and lib/evidence/evidenceQuality.ts -
 * every score is traceable to an explicit, named rule, never a black box.
 *
 * Design principle: this is a *screening* tool, not a verdict. Evidence
 * is almost always thin at discovery time, so the thresholds below are
 * deliberately biased toward "possible" / "not_enough_info" over "strong" -
 * see MIN_CORPUS_TOKENS_FOR_STRONG and the ceiling rules on high-autonomy
 * patterns. A pattern can only reach "strong" when its required evidence
 * is actually present, never from signal-matching alone.
 */

export type PatternFitLevel = "strong" | "possible" | "weak" | "not_enough_info" | "not_fit";

const FIT_LEVEL_RANK: Record<PatternFitLevel, number> = {
  not_fit: 0,
  not_enough_info: 1,
  weak: 2,
  possible: 3,
  strong: 4,
};

/** Shared comparison helper - exported so callers (e.g. lib/services/regressionRunner.ts) never need to re-derive the rank ordering themselves. */
export function fitLevelAtLeast(level: PatternFitLevel, min: PatternFitLevel): boolean {
  return FIT_LEVEL_RANK[level] >= FIT_LEVEL_RANK[min];
}

export interface PatternFitResult {
  patternId: AppliedAiPatternId;
  patternName: string;
  fitLevel: PatternFitLevel;
  fitScore: number;
  supportingSignals: string[];
  missingEvidence: string[];
  risks: string[];
  whyNotYet: string[];
  suggestedValidationQuestions: string[];
  saferFirstVersion: string | null;
}

/**
 * Optional extra signal from an already-generated Applied AI opportunity
 * assessment. Deliberately a plain inline shape (not imported from
 * lib/services/appliedAiOpportunityAssessment.ts) - that service imports
 * *this* file to compute patternFits, so importing its type back here
 * would create a circular dependency.
 */
export interface PatternFitAssessmentContext {
  recommendationType?: AppliedAiRecommendationType;
  risks?: string[];
  missingInformation?: string[];
}

export interface PatternFitWorkflowView {
  steps: WorkflowStep[];
  components: WorkflowComponent[];
  gaps: WorkflowGap[];
}

export interface PatternFitInput {
  meeting: Meeting;
  workflowView: PatternFitWorkflowView | null;
  /** Only "open" ambiguity flags matter as live, unresolved signal - pass whatever set the caller considers current. */
  ambiguityFlags: AmbiguityFlag[];
  /** Only "open" contradiction candidates matter - see above. */
  contradictionCandidates: ContradictionCandidate[];
  appliedAiAssessment?: PatternFitAssessmentContext | null;
}

// ---------------------------------------------------------------------------
// Corpus building
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalize(text)
      .replace(/[.,!?;:"'()[\]{}\-–—]/g, " ")
      .split(" ")
      .filter((t) => t.length > 2)
  );
}

function buildCorpus(input: PatternFitInput): string {
  const { meeting, workflowView, ambiguityFlags, contradictionCandidates, appliedAiAssessment } = input;
  const parts: string[] = [
    meeting.goal ?? "",
    meeting.current_understanding ?? "",
    meeting.tentative_build_direction ?? "",
  ];

  if (workflowView) {
    for (const step of workflowView.steps) {
      parts.push(step.title, step.description ?? "");
    }
    for (const component of workflowView.components) {
      parts.push(component.component_type, component.label, component.description ?? "");
    }
    for (const gap of workflowView.gaps) {
      parts.push(gap.label, gap.description ?? "");
    }
  }

  for (const flag of ambiguityFlags) {
    parts.push(flag.label, flag.description ?? "");
  }
  for (const candidate of contradictionCandidates) {
    parts.push(candidate.label, candidate.description, candidate.claim_a, candidate.claim_b);
  }

  if (appliedAiAssessment) {
    parts.push(...(appliedAiAssessment.risks ?? []), ...(appliedAiAssessment.missingInformation ?? []));
  }

  return normalize(parts.filter(Boolean).join(" . "));
}

// ---------------------------------------------------------------------------
// Context flags - plain keyword detection, same style as
// lib/live/meaningfulSegments.ts's HIGH_SIGNAL_TERMS.
// ---------------------------------------------------------------------------

const KEYWORD_SETS = {
  sensitiveData: [
    "sensitive",
    "confidential",
    "health",
    "medical",
    "social security",
    "account number",
    "financial",
    "personal data",
    "privacy",
    "data request",
    "regulated",
  ],
  humanApprovalRequired: [
    "sign off",
    "signs off",
    "signed off",
    "sign-off",
    "approve",
    "approval",
    "human review",
    "manual approval",
    "requires approval",
    "still sign off",
    "review before",
    "still the one who",
    "still be the one",
    "still make every",
    "still make the call",
    "still want to be the one",
    "still review",
    "still read",
    "still decide",
    "still approve",
    "before it moves",
    "before anything moves",
    "before it actually moves",
    "look at it first",
    "looking at it first",
    "double-check",
    "double check",
    "before it goes out",
  ],
  clearRulesOrThresholds: [
    "rule-based",
    "rule based",
    "documented rule",
    "threshold",
    "policy",
    "criteria",
    "deterministic",
    "standard rule",
    "always route",
  ],
  exceptionsOrJudgment: [
    "exception",
    "judgment call",
    "judgement call",
    "depends",
    "case by case",
    "varies",
    "special case",
    "big account",
    "high-impact",
    "high impact",
    "compliance issue",
  ],
  ownershipOrVisibilityGap: [
    "who owns",
    "unclear owner",
    "no visibility",
    "don't know who",
    "status",
    "tracking",
    "nobody knows",
    "lack of visibility",
    "ownership",
  ],
  missingOrInconsistentInput: [
    "missing information",
    "missing info",
    "incomplete",
    "inconsistent",
    "different fields",
    "different amounts of detail",
    "not there",
  ],
  messyDocuments: [
    "unstructured",
    "free text",
    "messy",
    "pdf",
    "scanned",
    "handwritten",
    "spreadsheet",
    "email",
    "attachment",
  ],
  trustedKnowledgeSource: [
    "knowledge base",
    "documentation",
    "policy lookup",
    "faq",
    "wiki",
    "trusted source",
    "reference material",
    "handbook",
  ],
  draftingNeed: ["draft", "write a response", "compose", "respond to", "template", "boilerplate"],
  toolPermissionsExplicit: [
    "permission",
    "access to",
    "api access",
    "system access",
    "bounded",
    "reversible",
    "read-only",
    "scoped access",
    "explicit permission",
  ],
  voiceChannelExplicit: ["phone call", "voice channel", "call transcript", "spoken conversation", "ivr", "call center", "on the phone"],
  nonTextMedia: ["photo", "image", "screenshot", "scanned document", "handwritten", "voice recording", "audio recording"],
  multiStepToolAction: ["multiple systems", "across systems", "coordinate between", "several steps", "multi-step", "orchestrat"],
};

type ContextFlagKey = keyof typeof KEYWORD_SETS;

type DiscoveryContext = Record<ContextFlagKey, boolean> & { corpus: string; corpusTokenCount: number };

function buildContext(corpus: string): DiscoveryContext {
  const flags = {} as Record<ContextFlagKey, boolean>;
  for (const key of Object.keys(KEYWORD_SETS) as ContextFlagKey[]) {
    flags[key] = KEYWORD_SETS[key].some((term) => corpus.includes(term));
  }
  return { ...flags, corpus, corpusTokenCount: tokenize(corpus).size };
}

// ---------------------------------------------------------------------------
// Signal matching - token-overlap between the corpus and each pattern's
// own descriptive `signals` phrases (lib/patterns/appliedAiPatterns.ts),
// so the pattern library stays the single source of truth for what to
// look for instead of a second, parallel keyword list here.
// ---------------------------------------------------------------------------

const SIGNAL_MATCH_THRESHOLD = 0.3;

/**
 * Sprint 27: words common across almost every business-process
 * description regardless of which pattern actually applies ("documents",
 * "process", "system", "intake", "text"...) - excluded specifically from
 * signal/required-evidence matching so a signal phrase can't cross
 * SIGNAL_MATCH_THRESHOLD purely on generic vocabulary overlap with an
 * unrelated scenario (caught during Sprint 27 scenario verification:
 * multimodal_intake_assistant was scoring "possible" against scenarios
 * with no image/scan/audio content at all, purely from sharing words like
 * "intake"/"documents"/"text" with its signal phrases). Deliberately not
 * applied to the general-purpose `tokenize()` used for corpus size and
 * KEYWORD_SETS matching - context-flag matching is already precise
 * (literal multi-word phrase substrings), and corpusTokenCount's "is
 * there enough discovery content at all" gate is a different question
 * from "does this specific phrase meaningfully overlap."
 */
const GENERIC_TOKEN_STOPLIST = new Set([
  "the", "and", "that", "this", "with", "from", "have", "been", "were", "when",
  "what", "which", "their", "there", "about", "would", "could", "should",
  "because", "before", "after", "other", "some", "such", "than", "then",
  "them", "they", "also", "into", "only", "over", "more", "most", "much",
  "many", "being", "doing", "using", "used", "include", "includes",
  "included", "process", "processes", "system", "systems", "document",
  "documents", "text", "information", "different", "various", "need",
  "needs", "needed", "actually", "really", "still", "each", "every",
  "existing", "current", "actual", "specific", "general", "overall",
  "part", "parts", "kind", "kinds", "type", "types", "way", "ways",
  "already", "yet", "even", "quite", "fairly", "rather", "instead",
  "something", "someone", "anything", "everything", "nothing", "person",
  "people", "team", "work", "working", "worked", "item", "items", "here",
  "make", "makes", "made", "take", "takes", "took", "come", "comes",
  "came", "know", "knows", "knew", "goes", "going", "gets", "getting",
  "want", "wants", "wanted", "like", "look", "looks", "looked", "right",
  "sure", "real", "case", "cases", "understand", "understanding",
]);

function tokenizeForSignalMatch(text: string): Set<string> {
  return new Set([...tokenize(text)].filter((t) => !GENERIC_TOKEN_STOPLIST.has(t)));
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / a.size;
}

function matchedSignals(corpusTokens: Set<string>, signals: string[]): string[] {
  const filteredCorpus = new Set([...corpusTokens].filter((t) => !GENERIC_TOKEN_STOPLIST.has(t)));
  return signals.filter((signal) => tokenOverlapRatio(tokenizeForSignalMatch(signal), filteredCorpus) >= SIGNAL_MATCH_THRESHOLD);
}

const REQUIRED_EVIDENCE_THRESHOLD = 0.4;

function findMissingEvidence(corpusTokens: Set<string>, requiredEvidence: string[]): string[] {
  const filteredCorpus = new Set([...corpusTokens].filter((t) => !GENERIC_TOKEN_STOPLIST.has(t)));
  return requiredEvidence.filter(
    (item) => tokenOverlapRatio(tokenizeForSignalMatch(item), filteredCorpus) < REQUIRED_EVIDENCE_THRESHOLD
  );
}

// ---------------------------------------------------------------------------
// Per-pattern contextual adjustments - directly transcribes Sprint 26's
// "Suggested scoring approach" bullets so each rule is auditable against
// the brief, not buried in generic arithmetic.
// ---------------------------------------------------------------------------

interface ContextualAdjustment {
  points: number;
  supporting: string[];
  riskNotes: string[];
  whyNotYetNotes: string[];
}

function emptyAdjustment(): ContextualAdjustment {
  return { points: 0, supporting: [], riskNotes: [], whyNotYetNotes: [] };
}

/** Patterns whose autonomy/risk means they must never reach "strong"/"possible" without their specific required context flag confirmed - a hard safety ceiling, not just a score penalty. */
const AUTONOMY_CEILINGS: Partial<Record<AppliedAiPatternId, { flag: ContextFlagKey; ceiling: PatternFitLevel }>> = {
  tool_using_agent: { flag: "toolPermissionsExplicit", ceiling: "weak" },
  voice_conversation_agent: { flag: "voiceChannelExplicit", ceiling: "weak" },
};

function contextualAdjustment(patternId: AppliedAiPatternId, ctx: DiscoveryContext): ContextualAdjustment {
  const adj = emptyAdjustment();

  switch (patternId) {
    case "intake_triage_assistant":
      if (ctx.missingOrInconsistentInput) {
        adj.points += 10;
        adj.supporting.push("Missing or inconsistent intake information was mentioned.");
      }
      break;
    case "completeness_checker":
      if (ctx.missingOrInconsistentInput) {
        adj.points += 14;
        adj.supporting.push("Recurring missing/incomplete information was mentioned.");
      }
      break;
    case "structured_extraction":
      if (ctx.messyDocuments) {
        adj.points += 14;
        adj.supporting.push("Unstructured or messy source documents/messages were mentioned.");
      }
      break;
    case "summarization_assistant":
      break;
    case "rag_knowledge_assistant":
      if (ctx.trustedKnowledgeSource) {
        adj.points += 16;
        adj.supporting.push("A trusted knowledge source or documentation was mentioned.");
      } else {
        adj.whyNotYetNotes.push("No confirmed trusted knowledge source was named yet.");
      }
      break;
    case "draft_generation_assistant":
      if (ctx.draftingNeed) {
        adj.points += 12;
        adj.supporting.push("A recurring drafting/writing need was mentioned.");
      }
      break;
    case "review_quality_assistant":
      break;
    case "decision_support_copilot":
      if (ctx.humanApprovalRequired) {
        adj.points += 8;
        adj.supporting.push("A human decision-maker was explicitly kept in the loop.");
      }
      break;
    case "rules_automation":
      if (ctx.clearRulesOrThresholds) {
        adj.points += 16;
        adj.supporting.push("A documented rule or threshold was mentioned.");
      } else {
        adj.whyNotYetNotes.push("No documented, stable rule or threshold was confirmed yet.");
      }
      if (ctx.exceptionsOrJudgment) {
        adj.points -= 10;
        adj.whyNotYetNotes.push("Exceptions or judgment calls limit how far a pure rule can go here.");
      }
      break;
    case "workflow_orchestration":
      if (ctx.multiStepToolAction) {
        adj.points += 8;
        adj.supporting.push("Coordination across multiple systems/steps was mentioned.");
      }
      if (ctx.sensitiveData && !ctx.humanApprovalRequired) {
        adj.points -= 8;
        adj.riskNotes.push("Sensitive data plus an unclear review path raises the risk of unattended coordination errors.");
      }
      break;
    case "tool_using_agent":
      if (ctx.toolPermissionsExplicit) {
        adj.points += 16;
        adj.supporting.push("Explicit tool/system permissions or action boundaries were mentioned.");
      } else {
        adj.points -= 30;
        adj.whyNotYetNotes.push("Tool permissions, action boundaries, and reversibility are not yet confirmed.");
      }
      if (ctx.sensitiveData && !ctx.humanApprovalRequired) {
        adj.points -= 18;
        adj.riskNotes.push("Sensitive data with no confirmed human review path makes autonomous tool use unsafe right now.");
      }
      break;
    case "human_in_the_loop_review_queue":
      if (ctx.humanApprovalRequired) {
        adj.points += 16;
        adj.supporting.push("A human sign-off/approval step was explicitly described.");
      }
      break;
    case "monitoring_alerting_assistant":
      break;
    case "multimodal_intake_assistant":
      if (ctx.nonTextMedia) {
        adj.points += 14;
        adj.supporting.push("Non-text media (image/scan/audio) was mentioned as part of intake.");
      } else {
        adj.whyNotYetNotes.push("No non-text media (image/scan/audio) was confirmed as part of this workflow.");
      }
      break;
    case "voice_conversation_agent":
      if (ctx.voiceChannelExplicit) {
        adj.points += 16;
        adj.supporting.push("A voice/phone conversation channel was explicitly mentioned.");
      } else {
        adj.points -= 30;
        adj.whyNotYetNotes.push("No voice/phone channel was explicitly confirmed for this workflow.");
      }
      break;
    case "reporting_visibility_layer":
      if (ctx.ownershipOrVisibilityGap) {
        adj.points += 16;
        adj.supporting.push("A lack of ownership/status visibility was mentioned.");
      }
      break;
    case "no_build_process_fix":
      if (ctx.ownershipOrVisibilityGap) {
        adj.points += 10;
        adj.supporting.push("Ownership/process clarity, not AI reasoning, looks like the actual gap.");
      }
      if (ctx.missingOrInconsistentInput) {
        adj.points += 6;
        adj.supporting.push("Inconsistent intake fields/rules may be fixable without AI.");
      }
      break;
  }

  return adj;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const MIN_CORPUS_TOKENS_FOR_STRONG = 25;
const MIN_CORPUS_TOKENS_FOR_ANY_SIGNAL = 8;
const STRONG_SCORE_THRESHOLD = 50;
const POSSIBLE_SCORE_THRESHOLD = 20;
const WEAK_SCORE_THRESHOLD = 0;
const NOT_FIT_SCORE_THRESHOLD = -20;

/**
 * "strong" is the only tier gated on complete required evidence - every
 * other tier is reachable from signal-matching alone, deliberately, since
 * required evidence is realistically almost never fully confirmed this
 * early in discovery (see the module doc comment's "possible over strong"
 * bias).
 */
function deriveFitLevel(params: {
  patternId: AppliedAiPatternId;
  fitScore: number;
  missingEvidenceCount: number;
  corpusTokenCount: number;
  ctx: DiscoveryContext;
}): PatternFitLevel {
  const { patternId, fitScore, missingEvidenceCount, corpusTokenCount } = params;

  let level: PatternFitLevel;
  if (corpusTokenCount < MIN_CORPUS_TOKENS_FOR_ANY_SIGNAL) {
    level = "not_enough_info";
  } else if (
    fitScore >= STRONG_SCORE_THRESHOLD &&
    missingEvidenceCount === 0 &&
    corpusTokenCount >= MIN_CORPUS_TOKENS_FOR_STRONG
  ) {
    level = "strong";
  } else if (fitScore >= POSSIBLE_SCORE_THRESHOLD) {
    level = "possible";
  } else if (fitScore >= WEAK_SCORE_THRESHOLD) {
    level = "weak";
  } else if (fitScore <= NOT_FIT_SCORE_THRESHOLD) {
    level = "not_fit";
  } else {
    level = "weak";
  }

  const ceiling = AUTONOMY_CEILINGS[patternId];
  if (ceiling && !params.ctx[ceiling.flag] && FIT_LEVEL_RANK[level] > FIT_LEVEL_RANK[ceiling.ceiling]) {
    level = ceiling.ceiling;
  }

  return level;
}

function scorePattern(pattern: AppliedAiPattern, ctx: DiscoveryContext): PatternFitResult {
  const corpusTokens = tokenize(ctx.corpus);
  const supportingFromSignals = matchedSignals(corpusTokens, pattern.signals);
  const missingEvidence = findMissingEvidence(corpusTokens, pattern.requiredEvidence);
  const adjustment = contextualAdjustment(pattern.id, ctx);

  const signalRatio = pattern.signals.length > 0 ? supportingFromSignals.length / pattern.signals.length : 0;
  const evidenceRatio = pattern.requiredEvidence.length > 0 ? missingEvidence.length / pattern.requiredEvidence.length : 0;

  const rawScore = signalRatio * 60 - evidenceRatio * 10 + adjustment.points;
  const fitScore = Math.round(Math.max(-100, Math.min(100, rawScore)));

  const fitLevel = deriveFitLevel({
    patternId: pattern.id,
    fitScore,
    missingEvidenceCount: missingEvidence.length,
    corpusTokenCount: ctx.corpusTokenCount,
    ctx,
  });

  const supportingSignals = [...supportingFromSignals, ...adjustment.supporting];

  const whyNotYet: string[] = [];
  if (fitLevel !== "strong") {
    whyNotYet.push(...adjustment.whyNotYetNotes);
    if (missingEvidence.length > 0) {
      whyNotYet.push(`Not yet evidenced: ${missingEvidence.join("; ")}`);
    }
    if (fitLevel === "not_enough_info" && ctx.corpusTokenCount < MIN_CORPUS_TOKENS_FOR_ANY_SIGNAL) {
      whyNotYet.push("Too little discovery content yet to assess this pattern meaningfully.");
    }
  }

  const risks = [...pattern.risks, ...adjustment.riskNotes];

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    fitLevel,
    fitScore,
    supportingSignals,
    missingEvidence,
    risks,
    whyNotYet,
    suggestedValidationQuestions: pattern.exampleQuestions.slice(0, 3),
    saferFirstVersion: fitLevel === "not_fit" ? null : (pattern.goodFirstVersion[0] ?? null),
  };
}

/**
 * Scores every pattern in the library against the given discovery
 * evidence, ranked strongest-first (ties broken by the library's own
 * declaration order). Deterministic - no AI/network call anywhere in this
 * function or anything it calls.
 */
export function scoreAllPatternFits(input: PatternFitInput): PatternFitResult[] {
  const corpus = buildCorpus(input);
  const ctx = buildContext(corpus);

  return APPLIED_AI_PATTERNS.map((pattern) => scorePattern(pattern, ctx)).sort(
    (a, b) => b.fitScore - a.fitScore
  );
}

/** Top N pattern fits at "possible" or better - "not_fit"/"weak"/"not_enough_info" results are never surfaced as a top recommendation, only as full results for transparency. */
export function pickTopPatternFits(results: PatternFitResult[], max = 3): PatternFitResult[] {
  return results.filter((r) => FIT_LEVEL_RANK[r.fitLevel] >= FIT_LEVEL_RANK.possible).slice(0, max);
}

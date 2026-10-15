import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getScenarioById, type DiscoveryScenario } from "@/lib/scenarios";
import { getWorkflowView, type WorkflowView } from "@/lib/services/workflows";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import { getConversationEventsForMeeting } from "@/lib/services/conversationEvents";
import { getOrderedTranscriptSegmentsForMeeting } from "@/lib/services/transcriptSegments";
import { buildMeetingExport } from "@/lib/services/meetingExportBuilder";
import { buildMeetingMarkdown } from "@/lib/services/meetingMarkdownExport";
import { assessEvidenceQuality } from "@/lib/evidence/evidenceQuality";
import { getLatestAppliedAiOpportunityAssessment } from "@/lib/services/appliedAiOpportunityAssessment";
import { fitLevelAtLeast, type PatternFitResult } from "@/lib/patterns/patternFit";
import type { ScenarioExpectedPatternFits } from "@/lib/scenarios";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  ConversationEvent,
  Meeting,
  RegressionCheck,
  RegressionResult,
  RegressionRun,
  RegressionRunStatus,
  WorkflowComponent,
  WorkflowComponentType,
  WorkflowStep,
} from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Matching helpers - local per-file convention (mirrors ambiguityFlags.ts,
// workflows.ts, conversationStateAnalyzerService.ts), deliberately simple
// per Sprint 16's "do not overbuild semantic matching" scope.
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((token) => token.length > 2));
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Looser than the 0.6 threshold used elsewhere (e.g. workflows.ts's own
// duplicate-suppression) - scenario-fixture wording and what the extractor
// actually produces legitimately diverge more than two AI runs of the same
// extractor do, and a missing item here is only ever a "warn", not a
// silently-wrong dedup decision.
const TOKEN_MATCH_THRESHOLD = 0.4;

function textsMatch(expected: string, candidate: string): boolean {
  const normalizedExpected = normalize(expected);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedExpected || !normalizedCandidate) return false;
  if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) {
    return true;
  }
  return tokenOverlapRatio(tokenize(expected), tokenize(candidate)) >= TOKEN_MATCH_THRESHOLD;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Check drafts
// ---------------------------------------------------------------------------

interface CheckDraft {
  category: string;
  label: string;
  expected: string | null;
  actual: string | null;
  result: RegressionResult;
  notes: string | null;
}

function makeCheck(
  category: string,
  label: string,
  expected: string | null,
  actual: string | null,
  result: RegressionResult,
  notes: string | null = null
): CheckDraft {
  return { category, label, expected, actual, result, notes };
}

/** One crashing check becomes a single fail row instead of aborting the whole run - Part D: "does not fail whole app if some checks cannot run." */
function safeChecks(category: string, label: string, fn: () => CheckDraft[]): CheckDraft[] {
  try {
    return fn();
  } catch (err) {
    return [
      makeCheck(category, label, null, null, "fail", `Check crashed: ${err instanceof Error ? err.message : String(err)}`),
    ];
  }
}

// ---------------------------------------------------------------------------
// Check group 1: scenario metadata
// ---------------------------------------------------------------------------

function checkScenarioMetadata(meeting: Meeting, scenario: DiscoveryScenario | undefined): CheckDraft[] {
  const checks: CheckDraft[] = [
    makeCheck(
      "Scenario metadata",
      "Meeting has scenario_id",
      "non-null scenario_id",
      meeting.scenario_id ?? "(none)",
      meeting.scenario_id ? "pass" : "fail"
    ),
  ];

  if (meeting.scenario_id) {
    checks.push(
      makeCheck(
        "Scenario metadata",
        "Scenario fixture resolves",
        meeting.scenario_id,
        scenario ? scenario.id : "(no matching fixture in lib/scenarios/)",
        scenario ? "pass" : "fail"
      )
    );
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Check groups 2/5/6/7: expected-text-list vs. candidate-text-list
// ---------------------------------------------------------------------------

function checkExpectedAgainstTexts(category: string, expectedItems: string[], candidateTexts: string[]): CheckDraft[] {
  return expectedItems.map((expected) => {
    const match = candidateTexts.find((candidate) => textsMatch(expected, candidate));
    return makeCheck(
      category,
      truncate(expected, 70),
      expected,
      match ? truncate(match, 150) : "(not found)",
      match ? "pass" : "warn"
    );
  });
}

// ---------------------------------------------------------------------------
// Check groups 3/4: expected actors/systems vs. workflow_components
// ---------------------------------------------------------------------------

function checkExpectedComponents(
  category: string,
  expectedItems: string[],
  components: WorkflowComponent[],
  preferredType: WorkflowComponentType
): CheckDraft[] {
  return expectedItems.map((expected) => {
    const match = components.find((c) => textsMatch(expected, c.label));
    if (!match) {
      return makeCheck(category, truncate(expected, 70), expected, "(not found)", "warn");
    }
    const notes =
      match.component_type !== preferredType
        ? `Matched but classified as "${match.component_type}", not "${preferredType}".`
        : null;
    return makeCheck(category, truncate(expected, 70), expected, truncate(match.label, 150), "pass", notes);
  });
}

// ---------------------------------------------------------------------------
// Check group 8: conversation state - facilitator hypotheses vs. workflow facts
// ---------------------------------------------------------------------------

function itemLabel(item: WorkflowStep | WorkflowComponent): string {
  return "title" in item ? item.title : item.label;
}

const FACILITATOR_FRAMING_EVENT_TYPES = new Set(["facilitator_question", "facilitator_hypothesis", "facilitator_focus_shift"]);

function checkConversationState(
  scenario: DiscoveryScenario,
  workflow: WorkflowView | null,
  events: ConversationEvent[]
): CheckDraft[] {
  const speakerRoleNotes = scenario.expectedOutputs.expectedSpeakerRoleNotes;
  if (!speakerRoleNotes || speakerRoleNotes.length === 0) {
    return [];
  }

  const expected = speakerRoleNotes.join(" | ");
  const label = "Facilitator hypotheses not treated as confirmed facts";

  if (events.length === 0) {
    return [
      makeCheck(
        "Conversation state",
        label,
        expected,
        "(no conversation_events recorded for this meeting)",
        "warn",
        "No conversation-state data available - this meeting may predate Sprint 15 or never ran through the analyzer."
      ),
    ];
  }

  const facilitatorFramingExcerpts = events
    .filter((e) => e.source_role === "facilitator" && FACILITATOR_FRAMING_EVENT_TYPES.has(e.event_type))
    .map((e) => e.evidence_excerpt)
    .filter((excerpt): excerpt is string => !!excerpt)
    .map(normalize);

  const items: (WorkflowStep | WorkflowComponent)[] = [...(workflow?.steps ?? []), ...(workflow?.components ?? [])];
  const violations: string[] = [];
  for (const item of items) {
    if (item.evidence_type !== "known" || !item.source_quote) continue;
    const normalizedQuote = normalize(item.source_quote);
    if (facilitatorFramingExcerpts.some((excerpt) => excerpt.includes(normalizedQuote) || normalizedQuote.includes(excerpt))) {
      violations.push(itemLabel(item));
    }
  }

  if (violations.length > 0) {
    return [
      makeCheck(
        "Conversation state",
        label,
        expected,
        `Facilitator-sourced quote used as known evidence for: ${violations.join(", ")}`,
        "fail",
        "A workflow item's source_quote matches a facilitator question/hypothesis excerpt rather than stakeholder evidence."
      ),
    ];
  }

  return [
    makeCheck(
      "Conversation state",
      label,
      expected,
      `${events.length} conversation event(s) recorded; no facilitator-sourced quotes found in workflow evidence.`,
      "pass"
    ),
  ];
}

// ---------------------------------------------------------------------------
// Check group 8.5 (Sprint 26 Part H): Applied AI pattern fit expectations -
// only runs when the scenario declares expectedPatternFits (currently just
// Applied AI Intake Triage Demo). Deliberately tolerant of "no assessment
// generated yet" - assessment generation is a separate, optional facilitator
// action (Sprint 25 Part F), never something scenario replay triggers
// automatically, so its absence must warn, never fail (Part H's own "no
// failures introduced by UI-only absence" acceptance criterion).
// ---------------------------------------------------------------------------

function checkPatternFits(
  expectedPatternFits: ScenarioExpectedPatternFits | undefined,
  patternFits: PatternFitResult[] | null
): CheckDraft[] {
  if (!expectedPatternFits) {
    return [];
  }

  const category = "Applied AI pattern fit";

  if (!patternFits) {
    return [
      makeCheck(
        category,
        "Applied AI opportunity assessment generated",
        "an assessment with pattern fits exists",
        "(none generated yet)",
        "warn",
        "Pattern-fit expectations can't be checked until 'Generate Applied AI assessment' has been run on this meeting - this is expected for a fresh replay and is not itself a failure."
      ),
    ];
  }

  const byId = new Map<string, PatternFitResult>(patternFits.map((f) => [f.patternId, f]));
  const checks: CheckDraft[] = [];

  for (const patternId of expectedPatternFits.expectedPossibleOrStrongPatternIds) {
    const fit = byId.get(patternId);
    checks.push(
      makeCheck(
        category,
        `${patternId} reaches at least "possible"`,
        "fitLevel is possible or strong",
        fit ? `${fit.fitLevel} (score ${fit.fitScore})` : "(pattern not found in results)",
        fit && fitLevelAtLeast(fit.fitLevel, "possible") ? "pass" : "warn",
        fit ? null : `Pattern id "${patternId}" was missing from the persisted pattern fit results entirely.`
      )
    );
  }

  for (const patternId of expectedPatternFits.expectedWeakOrNotReadyPatternIds) {
    const fit = byId.get(patternId);
    const isCautious = !fit || !fitLevelAtLeast(fit.fitLevel, "possible");
    checks.push(
      makeCheck(
        category,
        `${patternId} is not strongly recommended`,
        "fitLevel stays below possible (weak / not_enough_info / not_fit)",
        fit ? `${fit.fitLevel} (score ${fit.fitScore})` : "(pattern not found in results)",
        isCautious ? "pass" : "fail",
        isCautious
          ? null
          : `High-autonomy pattern "${patternId}" reached "${fit?.fitLevel}" - this should never happen without explicit permission/channel evidence.`
      )
    );

    if (fit) {
      const hasCaution = fit.missingEvidence.length > 0 || fit.risks.length > 0 || fit.whyNotYet.length > 0;
      checks.push(
        makeCheck(
          category,
          `${patternId} carries visible missing-evidence/risk notes`,
          "missingEvidence, risks, or whyNotYet is non-empty",
          hasCaution
            ? `${fit.missingEvidence.length} missing evidence, ${fit.risks.length} risks, ${fit.whyNotYet.length} why-not-yet notes`
            : "none present",
          hasCaution ? "pass" : "warn",
          hasCaution ? null : "A high-autonomy pattern should always surface at least one caution note for a facilitator to read."
        )
      );
    }
  }

  return checks;
}

/**
 * Sprint 27 Part C: checks a scenario's `expectedPrimaryRecommendation`
 * (Part B metadata) against the persisted assessment's actual
 * `recommendationType` - always a "warn" on mismatch, never a "fail".
 * recommendationType is the AI's own judgment call, not a trust/safety
 * matter, so this exists purely to flag drift for a human to notice, the
 * same tolerant spirit as checkPatternFits above. No-op if the scenario
 * doesn't declare an expectation, or if no assessment has been generated
 * yet (that absence is already reported once by checkPatternFits/the
 * caller - this function does not duplicate that warning).
 */
function checkExpectedRecommendationType(
  expectedPrimaryRecommendation: DiscoveryScenario["expectedPrimaryRecommendation"],
  actualRecommendationType: string | undefined
): CheckDraft[] {
  if (!expectedPrimaryRecommendation || !actualRecommendationType) {
    return [];
  }

  const matches = actualRecommendationType === expectedPrimaryRecommendation;
  return [
    makeCheck(
      "Applied AI pattern fit",
      "Applied AI recommendation type matches expectation",
      expectedPrimaryRecommendation,
      actualRecommendationType,
      matches ? "pass" : "warn",
      matches
        ? null
        : "Recommendation type is an AI judgment call and can reasonably vary run to run - a mismatch here is worth a human glance, not a defect."
    ),
  ];
}

// ---------------------------------------------------------------------------
// Check group 9: evidence safety (always runs)
// ---------------------------------------------------------------------------

/** Item description, mirroring itemLabel's "title or label" branch - both WorkflowStep and WorkflowComponent carry a `description` field under the same name. */
function itemDescription(item: WorkflowStep | WorkflowComponent): string | null {
  return item.description;
}

/**
 * Sprint 24: carries an evidence-quality result's actual reason codes/text
 * (not just the affected item's name) into a regression check's `notes`
 * field, so lib/services/regressionReview.ts's friendly-text translation
 * has real reason content to work with instead of just a bare item list.
 * Purely a notes-formatting change - does not affect any check's
 * category/label/expected/actual/result.
 */
function formatEvidenceIssue(label: string, result: ReturnType<typeof assessEvidenceQuality>): string {
  return `${label} [${result.reasonCodes.join(", ")}]: ${result.reasons.join("; ")}`;
}

function checkEvidenceSafety(
  workflow: WorkflowView | null,
  contradictionCandidates: ContradictionCandidate[],
  segmentTextById: Map<string, string>
): CheckDraft[] {
  const checks: CheckDraft[] = [];
  const items: (WorkflowStep | WorkflowComponent)[] = [...(workflow?.steps ?? []), ...(workflow?.components ?? [])];
  const knownItems = items.filter((i) => i.evidence_type === "known");
  const inferredItems = items.filter((i) => i.evidence_type === "inferred");
  const gaps = workflow?.gaps ?? [];
  const missingQuote = knownItems.filter((i) => !i.source_quote || !i.source_quote.trim());

  checks.push(
    makeCheck(
      "Evidence safety",
      "Known items have a source quote",
      "every 'known'-evidence step/component has a non-empty source_quote",
      `${knownItems.length - missingQuote.length}/${knownItems.length} known items have quotes`,
      missingQuote.length === 0 ? "pass" : "fail",
      missingQuote.length > 0 ? `Missing quote on: ${missingQuote.map(itemLabel).join(", ")}` : null
    )
  );

  const quotePairs: { quote: string; segmentId: string; label: string }[] = [];
  for (const candidate of contradictionCandidates) {
    if (candidate.source_quote_a && candidate.source_transcript_segment_id_a) {
      quotePairs.push({
        quote: candidate.source_quote_a,
        segmentId: candidate.source_transcript_segment_id_a,
        label: `${candidate.label} (claim A)`,
      });
    }
    if (candidate.source_quote_b && candidate.source_transcript_segment_id_b) {
      quotePairs.push({
        quote: candidate.source_quote_b,
        segmentId: candidate.source_transcript_segment_id_b,
        label: `${candidate.label} (claim B)`,
      });
    }
  }
  const invalidQuotes = quotePairs.filter(({ quote, segmentId }) => {
    const segmentText = segmentTextById.get(segmentId);
    if (!segmentText) return true;
    return !normalize(segmentText).includes(normalize(quote));
  });
  checks.push(
    makeCheck(
      "Evidence safety",
      "Possible-mismatch quotes are real transcript substrings",
      "every persisted contradiction-candidate quote is a substring of its cited segment",
      `${quotePairs.length - invalidQuotes.length}/${quotePairs.length} verified`,
      invalidQuotes.length === 0 ? "pass" : "fail",
      invalidQuotes.length > 0 ? `Unverifiable: ${invalidQuotes.map((q) => q.label).join(", ")}` : null
    )
  );

  // Sprint 23: replaces the old crude "quote.length < 5 || quote === label"
  // rule with the same deterministic evidence-quality helper persistence
  // now gates on (lib/evidence/evidenceQuality.ts) - catches label echoes,
  // generic filler, and trivially-short quotes, not just an exact label
  // match. A known item failing this after Sprint 23's persistence-time
  // downgrade is already in place would mean either older pre-Sprint-23
  // data, or a genuinely new weak-evidence case slipping through - either
  // way, still a real fail, never silently softened.
  const knownQualityFailures = knownItems
    .map((i) => {
      const segmentText = i.source_transcript_segment_id ? (segmentTextById.get(i.source_transcript_segment_id) ?? null) : null;
      const result = assessEvidenceQuality({
        claimTitle: itemLabel(i),
        claimDescription: itemDescription(i),
        quote: i.source_quote,
        segmentText,
        evidenceType: "known",
      });
      return { item: i, result };
    })
    .filter((r) => r.result.severity === "fail");
  checks.push(
    makeCheck(
      "Evidence safety",
      "Known-evidence quotes meaningfully support their claim",
      "known-evidence quotes aren't fabricated, trivially short, generic filler, or a bare echo of the item's own label",
      knownQualityFailures.length === 0
        ? "no low-value known-evidence quotes found"
        : `${knownQualityFailures.length} low-value quote(s)`,
      knownQualityFailures.length === 0 ? "pass" : "fail",
      // Sprint 24: includes the underlying evidenceQuality reason codes/text
      // (not just the item label) so the review UX can translate them into
      // friendly wording instead of a bare list of names.
      knownQualityFailures.length > 0
        ? knownQualityFailures.map((r) => formatEvidenceIssue(itemLabel(r.item), r.result)).join(" | ")
        : null
    )
  );

  // Sprint 23: inferred evidence is held to a lower bar (a weak-but-real
  // quote only warns), but a fabricated/unverifiable quote is still a trust
  // problem regardless of evidence_type, so that specific case still fails.
  const inferredResults = inferredItems
    .filter((i) => !!i.source_quote)
    .map((i) => {
      const segmentText = i.source_transcript_segment_id ? (segmentTextById.get(i.source_transcript_segment_id) ?? null) : null;
      const result = assessEvidenceQuality({
        claimTitle: itemLabel(i),
        claimDescription: itemDescription(i),
        quote: i.source_quote,
        segmentText,
        evidenceType: "inferred",
      });
      return { item: i, result };
    });
  const inferredUntrustworthy = inferredResults.filter((r) => r.result.quoteIsUntrustworthy);
  const inferredWeak = inferredResults.filter((r) => !r.result.quoteIsUntrustworthy && r.result.severity !== "pass");
  checks.push(
    makeCheck(
      "Evidence safety",
      "Inferred-evidence quotes are not fabricated",
      "inferred-evidence quotes, when present, are real transcript substrings (weak-but-real quotes are acceptable at this tier)",
      inferredUntrustworthy.length === 0
        ? `${inferredResults.length - inferredWeak.length}/${inferredResults.length} inferred quotes verified, ${inferredWeak.length} weak-but-real`
        : `${inferredUntrustworthy.length} unverifiable/fabricated quote(s)`,
      inferredUntrustworthy.length === 0 ? (inferredWeak.length === 0 ? "pass" : "warn") : "fail",
      inferredUntrustworthy.length > 0
        ? inferredUntrustworthy.map((r) => formatEvidenceIssue(itemLabel(r.item), r.result)).join(" | ")
        : inferredWeak.length > 0
          ? inferredWeak.map((r) => formatEvidenceIssue(itemLabel(r.item), r.result)).join(" | ")
          : null
    )
  );

  // Sprint 23: gaps tolerate vague/short quotes by design (they're open
  // questions, not claims) - only an outright fabricated/unverifiable quote
  // is misleading enough to flag, and even then only as a warn, never a
  // fail (gaps never claim something is confirmed).
  const gapUntrustworthy = gaps
    .filter((g) => !!g.source_quote)
    .map((g) => {
      const segmentText = g.source_transcript_segment_id ? (segmentTextById.get(g.source_transcript_segment_id) ?? null) : null;
      const result = assessEvidenceQuality({
        claimTitle: g.label,
        claimDescription: g.description,
        quote: g.source_quote,
        segmentText,
        evidenceType: "unknown",
      });
      return { item: g, result };
    })
    .filter((r) => r.result.quoteIsUntrustworthy);
  checks.push(
    makeCheck(
      "Evidence safety",
      "Gap quotes are not fabricated",
      "gap quotes, when present, are real transcript substrings (vague/short quotes are acceptable for an open question)",
      gapUntrustworthy.length === 0 ? "no unverifiable gap quotes found" : `${gapUntrustworthy.length} unverifiable quote(s)`,
      gapUntrustworthy.length === 0 ? "pass" : "warn",
      gapUntrustworthy.length > 0
        ? gapUntrustworthy.map((r) => formatEvidenceIssue(r.item.label, r.result)).join(" | ")
        : null
    )
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Check group 10: export safety (always runs, reuses Sprint 14's builder)
// ---------------------------------------------------------------------------

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const OLD_TERMINOLOGY = ["ambiguity flag", "contradiction candidate", "workflow gap"];

function checkExportSafety(
  markdown: string,
  ambiguityFlags: AmbiguityFlag[],
  contradictionCandidates: ContradictionCandidate[]
): CheckDraft[] {
  const checks: CheckDraft[] = [];

  const uuidMatches = markdown.match(UUID_PATTERN) ?? [];
  checks.push(
    makeCheck(
      "Export safety",
      "No raw UUIDs in export",
      "0 UUID-shaped strings",
      `${uuidMatches.length} found`,
      uuidMatches.length === 0 ? "pass" : "fail",
      uuidMatches.length > 0 ? `e.g. ${uuidMatches[0]}` : null
    )
  );

  const normalizedMarkdown = normalize(markdown);
  const resolvedLabels = [
    ...ambiguityFlags.filter((f) => f.status !== "open").map((f) => f.label),
    ...contradictionCandidates.filter((c) => c.status !== "open").map((c) => c.label),
  ];
  const leaked = resolvedLabels.filter((label) => label.trim().length > 3 && normalizedMarkdown.includes(normalize(label)));
  checks.push(
    makeCheck(
      "Export safety",
      "Resolved/dismissed items not shown as open",
      "no resolved/dismissed ambiguity-flag or contradiction-candidate label appears in the export",
      leaked.length === 0 ? "none found" : `${leaked.length} leaked`,
      leaked.length === 0 ? "pass" : "fail",
      leaked.length > 0 ? `Leaked: ${leaked.join(", ")}` : null
    )
  );

  const leakedTerms = OLD_TERMINOLOGY.filter((term) => normalizedMarkdown.includes(term));
  checks.push(
    makeCheck(
      "Export safety",
      "No leaked internal terminology",
      `none of: ${OLD_TERMINOLOGY.join(", ")}`,
      leakedTerms.length === 0 ? "none found" : leakedTerms.join(", "),
      leakedTerms.length === 0 ? "pass" : "fail",
      leakedTerms.length > 0
        ? "User-facing export text should use Sprint 13.5 terminology (possible mismatch, needs clarification, still unclear, process so far)."
        : null
    )
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function computeOverallResult(checks: CheckDraft[]): RegressionResult {
  if (checks.some((c) => c.result === "fail")) return "fail";
  if (checks.some((c) => c.result === "warn")) return "warn";
  return "pass";
}

function buildSummary(checks: CheckDraft[]): string {
  const pass = checks.filter((c) => c.result === "pass").length;
  const warn = checks.filter((c) => c.result === "warn").length;
  const fail = checks.filter((c) => c.result === "fail").length;
  return `${checks.length} check${checks.length === 1 ? "" : "s"}: ${pass} pass, ${warn} warn, ${fail} fail.`;
}

async function persistRun(
  meetingId: string,
  scenarioId: string,
  status: RegressionRunStatus,
  overallResult: RegressionResult,
  summary: string,
  notes: string | null,
  startedAt: string,
  checks: CheckDraft[]
): Promise<{ run: RegressionRun; checks: RegressionCheck[] }> {
  const supabase = await createServerSupabaseClient();

  const { data: run, error: runError } = await supabase
    .from("regression_runs")
    .insert({
      meeting_id: meetingId,
      scenario_id: scenarioId,
      status,
      overall_result: overallResult,
      summary,
      notes,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to save regression run: ${runError?.message}`);
  }

  let savedChecks: RegressionCheck[] = [];
  if (checks.length > 0) {
    const { data, error } = await supabase
      .from("regression_checks")
      .insert(
        checks.map((c) => ({
          regression_run_id: run.id,
          category: c.category,
          label: c.label,
          expected: c.expected,
          actual: c.actual,
          result: c.result,
          notes: c.notes,
        }))
      )
      .select();

    if (error) {
      throw new Error(`Failed to save regression checks: ${error.message}`);
    }
    savedChecks = data ?? [];
  }

  return { run, checks: savedChecks };
}

/**
 * Runs Sprint 16's deterministic regression checks for a scenario-created
 * meeting and persists the result. No AI calls anywhere - every check is a
 * plain string/data comparison of the meeting's *current* structured state
 * against its scenario's expectedOutputs (lib/scenarios/*.ts). A meeting
 * with no scenario_id, or one whose scenario_id doesn't resolve to a real
 * fixture, still produces a saved run - that's the "Scenario metadata"
 * check failing, not a thrown error.
 */
export async function runRegression(meetingId: string): Promise<{ run: RegressionRun; checks: RegressionCheck[] }> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }
  const { meeting } = details;

  const startedAt = new Date().toISOString();
  const checks: CheckDraft[] = [];
  let status: RegressionRunStatus = "completed";
  let notes: string | null = null;

  try {
    const scenario = meeting.scenario_id ? getScenarioById(meeting.scenario_id) : undefined;
    const metadataChecks = checkScenarioMetadata(meeting, scenario);
    checks.push(...metadataChecks);
    const metadataOk = metadataChecks.every((c) => c.result === "pass");

    if (metadataOk && scenario) {
      const [workflow, ambiguityFlags, contradictionCandidates, conversationEvents, transcriptSegments] = await Promise.all([
        getWorkflowView(meetingId),
        getAmbiguityFlagsForMeeting(meetingId),
        listContradictionCandidates(meetingId),
        getConversationEventsForMeeting(meetingId),
        getOrderedTranscriptSegmentsForMeeting(meetingId),
      ]);
      const segmentTextById = new Map(transcriptSegments.map((s) => [s.id, s.raw_text]));
      const openGaps = (workflow?.gaps ?? []).filter((g) => g.gap_status === "open");
      const openAmbiguityFlags = ambiguityFlags.filter((f) => f.status === "open");
      const openContradictionCandidates = contradictionCandidates.filter((c) => c.status === "open");
      const { expectedOutputs } = scenario;

      checks.push(
        ...safeChecks("Process so far - steps", "Expected step check", () =>
          checkExpectedAgainstTexts(
            "Process so far - steps",
            expectedOutputs.expectedWorkflowSteps,
            (workflow?.steps ?? []).map((s) => `${s.title} ${s.description ?? ""}`)
          )
        )
      );

      checks.push(
        ...safeChecks("People & systems - actors", "Expected actor check", () =>
          checkExpectedComponents("People & systems - actors", expectedOutputs.expectedActors, workflow?.components ?? [], "actor")
        )
      );

      checks.push(
        ...safeChecks("People & systems - systems", "Expected system check", () =>
          checkExpectedComponents("People & systems - systems", expectedOutputs.expectedSystems, workflow?.components ?? [], "system")
        )
      );

      checks.push(
        ...safeChecks("Still unclear", "Expected gap check", () =>
          checkExpectedAgainstTexts(
            "Still unclear",
            expectedOutputs.expectedGaps,
            openGaps.map((g) => `${g.label} ${g.description ?? ""}`)
          )
        )
      );

      if (expectedOutputs.expectedAmbiguities?.length) {
        checks.push(
          ...safeChecks("Needs clarification", "Expected ambiguity check", () =>
            checkExpectedAgainstTexts(
              "Needs clarification",
              expectedOutputs.expectedAmbiguities!,
              openAmbiguityFlags.map((f) => `${f.label} ${f.description ?? ""}`)
            )
          )
        );
      }

      if (expectedOutputs.expectedClarifications?.length) {
        checks.push(
          ...safeChecks("Possible mismatches", "Expected clarification check", () =>
            checkExpectedAgainstTexts(
              "Possible mismatches",
              expectedOutputs.expectedClarifications!,
              openContradictionCandidates.map((c) => `${c.label} ${c.description} ${c.claim_a} ${c.claim_b}`)
            )
          )
        );
      }

      checks.push(
        ...safeChecks("Conversation state", "Facilitator hypothesis check", () =>
          checkConversationState(scenario, workflow, conversationEvents)
        )
      );

      if (expectedOutputs.expectedPatternFits || scenario.expectedPrimaryRecommendation) {
        checks.push(
          ...(await (async () => {
            try {
              const assessment = await getLatestAppliedAiOpportunityAssessment(meetingId);
              return [
                ...checkPatternFits(expectedOutputs.expectedPatternFits, assessment?.patternFits ?? null),
                ...checkExpectedRecommendationType(scenario.expectedPrimaryRecommendation, assessment?.recommendationType),
              ];
            } catch (err) {
              return [
                makeCheck(
                  "Applied AI pattern fit",
                  "Pattern fit check",
                  null,
                  null,
                  "fail",
                  `Check crashed: ${err instanceof Error ? err.message : String(err)}`
                ),
              ];
            }
          })())
        );
      }

      checks.push(
        ...safeChecks("Evidence safety", "Evidence safety check", () =>
          checkEvidenceSafety(workflow, contradictionCandidates, segmentTextById)
        )
      );

      checks.push(
        ...(await (async () => {
          try {
            const exportModel = await buildMeetingExport(meetingId);
            const markdown = exportModel ? buildMeetingMarkdown(exportModel) : "";
            return checkExportSafety(markdown, ambiguityFlags, contradictionCandidates);
          } catch (err) {
            return [
              makeCheck(
                "Export safety",
                "Export safety check",
                null,
                null,
                "fail",
                `Check crashed: ${err instanceof Error ? err.message : String(err)}`
              ),
            ];
          }
        })())
      );
    }
  } catch (err) {
    status = "failed";
    notes = err instanceof Error ? err.message : "Regression run crashed unexpectedly";
    checks.push(makeCheck("Run", "Unexpected error", null, null, "fail", notes));
  }

  const overallResult = computeOverallResult(checks);
  const summary = buildSummary(checks);

  return persistRun(meetingId, meeting.scenario_id ?? "(missing)", status, overallResult, summary, notes, startedAt, checks);
}

export async function getRegressionRun(runId: string): Promise<{ run: RegressionRun; checks: RegressionCheck[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: run, error: runError } = await supabase.from("regression_runs").select("*").eq("id", runId).maybeSingle();
  if (runError) {
    throw new Error(`Failed to load regression run: ${runError.message}`);
  }
  if (!run) return null;

  const { data: checks, error: checksError } = await supabase
    .from("regression_checks")
    .select("*")
    .eq("regression_run_id", runId)
    .order("created_at", { ascending: true });
  if (checksError) {
    throw new Error(`Failed to load regression checks: ${checksError.message}`);
  }

  return { run, checks: checks ?? [] };
}

export interface RecentRegressionRun {
  run: RegressionRun;
  meetingName: string | null;
}

/** Latest regression_runs rows, newest first, joined with meeting names for display - not a foreign-key join, just a batched second query. */
export async function getRecentRegressionRuns(limit = 20): Promise<RecentRegressionRun[]> {
  const supabase = await createServerSupabaseClient();
  const { data: runs, error } = await supabase
    .from("regression_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to load regression runs: ${error.message}`);
  }
  const runList = runs ?? [];

  const meetingIds = Array.from(new Set(runList.map((r) => r.meeting_id)));
  let namesByMeetingId = new Map<string, string>();
  if (meetingIds.length > 0) {
    const { data: meetings, error: meetingsError } = await supabase.from("meetings").select("id, name").in("id", meetingIds);
    if (meetingsError) {
      throw new Error(`Failed to load meeting names: ${meetingsError.message}`);
    }
    namesByMeetingId = new Map((meetings ?? []).map((m) => [m.id, m.name]));
  }

  return runList.map((run) => ({ run, meetingName: namesByMeetingId.get(run.meeting_id) ?? null }));
}

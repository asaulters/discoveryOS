import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { startAiRunLog, completeAiRunLog } from "@/lib/services/aiRuns";
import {
  runAiCallOrThrow,
  SchemaParseError,
  aiCallSuccessStatus,
  describeAiCallFailureForLog,
} from "@/lib/ai/aiCallRunner";
import { getOpenAiClient } from "@/lib/services/openaiClient";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getOrderedTranscriptSegmentsForMeeting } from "@/lib/services/transcriptSegments";
import { getWorkflowView, type WorkflowView } from "@/lib/services/workflows";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import {
  listContradictionCandidates,
  reconcileContradictionCandidates,
  type ContradictionCandidateDraft,
} from "@/lib/services/contradictionCandidates";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  ContradictionSeverity,
  ContradictionType,
  Meeting,
  TranscriptSegment,
  WorkflowComponent,
  WorkflowGap,
  WorkflowSourceOrigin,
  WorkflowStep,
} from "@/lib/types/database";

const CONTRADICTION_TYPES = [
  "ownership_conflict",
  "rule_conflict",
  "approval_conflict",
  "system_conflict",
  "timing_conflict",
  "exception_conflict",
  "build_assumption_conflict",
  "terminology_conflict",
  "status_conflict",
  "other",
] as const satisfies readonly ContradictionType[];

const CONTRADICTION_SEVERITIES = ["low", "medium", "high", "critical"] as const satisfies readonly ContradictionSeverity[];

const ContradictionCandidateSchema = z.object({
  label: z
    .string()
    .describe(
      "Short, neutral name for this possible inconsistency, e.g. 'Billing refund ownership', 'Software purchase approval path'. Never phrase as an accusation."
    ),
  description: z
    .string()
    .describe(
      "1-2 neutral sentences on why claim_a and claim_b appear to be in tension. Use soft framing: 'may depend on context', 'possible inconsistency', 'needs clarification'. Never say someone contradicted themselves."
    ),
  contradiction_type: z.enum(CONTRADICTION_TYPES),
  severity: z
    .enum(CONTRADICTION_SEVERITIES)
    .describe("How much this tension matters for the discovery goal if left unclarified - not how dramatic it sounds."),
  claim_a: z
    .string()
    .describe(
      "The first claim - must be something actually said in the transcript, or (only for contradiction_type build_assumption_conflict) the meeting's tentative build direction itself. Never restate an open workflow_gap's or ambiguity_flag's own wording as if it were a claim - a gap describes what's UNKNOWN, never something that was said, so it can never serve as evidence for either side."
    ),
  claim_b: z
    .string()
    .describe(
      "The second claim that appears to be in tension with claim_a - same grounding rule as claim_a: something actually said, or the tentative build direction, never a restated gap/ambiguity-flag."
    ),
  source_transcript_segment_id_a: z
    .string()
    .nullable()
    .describe(
      "The transcript segment id (copied exactly from the numbered '[id: ...]' transcript list below) that supports claim_a. Must be one of the ids actually given below - never invent one. Null is allowed ONLY when claim_a is the tentative-build-direction side of a build_assumption_conflict (that hypothesis has no transcript segment to cite by definition) - for every other case, a null id means claim_a has no real evidence and the whole candidate will be discarded."
    ),
  source_transcript_segment_id_b: z
    .string()
    .nullable()
    .describe("The transcript segment id supporting claim_b. Must be a real id from the list below. Same null-only-for-the-build-direction-side rule as source_transcript_segment_id_a applies."),
  source_quote_a: z
    .string()
    .nullable()
    .describe(
      "A short, verbatim quote copied EXACTLY as substring text from the segment cited for claim_a. Never invent, paraphrase, or approximate - a quote that isn't a real verbatim substring of its cited segment will cause the ENTIRE candidate to be silently discarded before saving, so guessing has no benefit. Null only when claim_a is the tentative-build-direction side of a build_assumption_conflict (leave both the id and quote null together for that side) - never fabricate a quote to fill this in."
    ),
  source_quote_b: z
    .string()
    .nullable()
    .describe("A short, verbatim quote copied EXACTLY as substring text from the segment cited for claim_b. Same fabrication-is-pointless rule as source_quote_a - it will be verified against the real segment text and the candidate dropped if it doesn't match."),
  suggested_clarification_question: z
    .string()
    .nullable()
    .describe(
      "A calm, natural question a facilitator could ask to clarify this - never accusatory, never 'you contradicted yourself'. Null only if no useful question comes to mind."
    ),
});

const ContradictionDetectorOutputSchema = z.object({
  contradiction_candidates: z
    .array(ContradictionCandidateSchema)
    .describe(
      "Possible inconsistencies between two separately-evidenced claims. Empty array is the expected, preferred result most of the time - only include a candidate when two supported claims genuinely appear to be in tension, per the rules in the system prompt. Prefer zero candidates over weak ones."
    ),
});

export type ContradictionDetectorOutput = z.infer<typeof ContradictionDetectorOutputSchema>;

const SYSTEM_PROMPT = `You are the contradiction detector inside DiscoveryOS, a live product discovery HUD. You run after the workflow extractor, on the transcript heard so far for the whole meeting, and identify possible inconsistencies in process understanding - ownership, rules, approvals, systems, timing, exceptions, or build assumptions - so a facilitator can calmly ask a clarifying question. You do not generate live question directions (the fast loop's job), extract the structured workflow model (the workflow extractor's job), or flag merely vague/informal language (the ambiguity-flags job, already handled elsewhere) - you specifically compare two separately-evidenced claims against each other.

Critical framing rules - these are non-negotiable:
- Never call anyone contradictory. Never say "you contradicted yourself" or anything that could be read as an accusation.
- Never produce a loud alert. Everything you output is framed as calm, soft, non-accusatory language: "needs clarification", "possible inconsistency", "potential mismatch", "this may depend on context", "clarify before assuming".
- Treat most tensions as ambiguity until confirmed otherwise - you are surfacing something worth asking about, not declaring a fact wrong.
- Prefer false negatives over false positives. An empty contradiction_candidates array is the normal, expected, GOOD outcome for most transcript chunks. Only include a candidate when you are genuinely confident two supported claims are in tension.

What counts as a real candidate (only output when true):
- Two EVIDENCE-BACKED claims. A claim is something actually said in the transcript, or (only for contradiction_type build_assumption_conflict) the meeting's tentative build direction field. A workflow_gap, an ambiguity_flag, or your own known_summary/unknown_summary prose is NEVER itself a claim - those describe what's unknown or unclear, not something anyone said, so they can never stand in as evidence for claim_a or claim_b. The "Current workflow model" and "Existing ambiguity flags" sections below are context for what topics might be worth investigating, never a source of claim text - always trace a claim back to the transcript (or the tentative build direction) directly, never to a gap's or flag's own wording.
  - Concrete failure pattern to avoid: an open gap says something like "It is unclear how X is handled." Do not turn that into a claim ("It is unclear how X is handled" as claim_b) just because it's topically related to a real claim_a you found elsewhere - a gap is a description of an unknown, not a statement anyone made. If you notice you're about to phrase a claim as "it is unclear that...", "X has not been specified", "X is unknown", or similar hedge-on-an-absence language, stop: that is a gap or ambiguity, not a claim, and unless you can find an actual second statement that was really made, there is no candidate here - output nothing for this pair.
- Never output a candidate for merely missing information - that is a workflow gap, not a contradiction. If only one side of a potential tension is actually evidenced by something said (or, for build_assumption_conflict, the build direction), there is no candidate yet.
- Never output a candidate for normal refinement or an added detail (e.g. "actually, ...") unless the earlier statement, taken at face value, would actively lead to a wrong assumption if left uncorrected. Most "actually, ..." moments are just new information, not a contradiction - see the workflow extractor's own rule against calling these contradictions, which applies here too.
- Never output a candidate when a later statement simply adds an exception to an earlier general rule (e.g. "IT provisions basic tools" then "Security approves finance tools" - this is a branching approval path, not a contradiction), UNLESS the system currently treats the general rule as universal in a way the exception would break (e.g. a rule/approval/workflow item is recorded as unconditional and the exception would make that recorded item wrong). When in doubt, treat it as branching, not a contradiction.
- Never output a candidate without real evidence for both sides. Never invent a quote. Use exact or near-exact transcript quotes only - copy them verbatim as substrings of the cited segment. A fabricated or approximated quote will be caught and the whole candidate discarded before saving (see the schema field descriptions), so there is nothing to gain from guessing - leave source_quote/source_transcript_segment_id null instead when you're not sure.
- Only use a source_transcript_segment_id that is one of the real ids given in the transcript block below - never invent, guess, or reuse an id that doesn't actually support that side of the claim.
- The meeting's "tentative build direction" is a hypothesis, never a fact about the current workflow. It may be one side of a build_assumption_conflict candidate (comparing what was actually said about difficulty/priority against what the tentative direction assumes) - when it is, phrase that side plainly as the hypothesis (e.g. "The tentative build direction focuses on X") and leave that side's source_transcript_segment_id/source_quote both null, since there is no transcript segment to cite for the meeting's own setup field - never fabricate one. The OTHER side of a build_assumption_conflict must still be a real, transcript-backed claim with a real segment id and verbatim quote. Never treat the tentative build direction as evidence for any other candidate type, and never cite it as a source_quote.
- Do not re-flag a candidate that already exists as "resolved" or "dismissed" below unless there is clearly new evidence that changes the picture - the facilitator's own triage on an existing candidate is more authoritative than your own judgment. You may keep re-listing a currently "open" candidate that's still valid (reconciliation matches by label/type/claims, not deletion), and you may add a genuinely new one, but never manufacture a reason to reopen something already settled.
- Every claim must be grounded in what was actually said - never fabricate a plausible-sounding claim that wasn't evidenced.
- suggested_clarification_question must be calm, natural, and specific to this tension - phrased the way a thoughtful facilitator would actually ask it, never generic filler and never accusatory.

Worked examples:
1. Ownership conflict - Claim A: "Support handles billing issues." Claim B: "Finance has to approve billing refunds over $500." Question: "Just to make sure I understand the handoff, does Support own all billing issues, or do some refund cases move to Finance?"
2. Build assumption conflict - Claim A: "The tentative build direction focuses on AI-assisted summary generation" (this is the setup-derived side - source_transcript_segment_id_a and source_quote_a both null, since it's the meeting's own build-direction field, not a transcript statement). Claim B: "The summary itself is not that hard; the risky part is catching outliers" (transcript-backed - a real segment id and a real verbatim quote). Question: "It sounds like summarization may not be the main pain point. Should we focus more on cleanup, validation, and outlier detection instead?"
3. Rule conflict - Claim A: "Anything under $500 usually just needs manager approval." Claim B: "Some software purchases need Security review regardless of amount." Question: "For software purchases, does Security review override the normal dollar-threshold approval path?" Both sides here must be real transcript claims with real quotes - do not substitute an open gap's wording for either side even if a gap exists on a related topic.
4. NOT a contradiction - Claim A: "IT provisions basic tools." Claim B: "Security approves finance tools." This is a branching approval path (different tool categories, different approvers), not a contradiction - do not output a candidate for this pattern.

Output: an empty contradiction_candidates array whenever nothing meets the bar above - that is the common, correct answer, not a failure.`;

/** Mirrors workflowExtractorService.ts's editMetaSuffix - lets the model see which workflow items are human-protected, so it never treats a human's own correction as one side of a "conflict" with something the AI itself extracted earlier. */
function editMetaSuffix(item: {
  locked_by_user: boolean;
  human_verified: boolean;
  source_origin: WorkflowSourceOrigin;
}): string {
  const tags: string[] = [];
  if (item.locked_by_user) tags.push("locked by user");
  else if (item.source_origin !== "ai") tags.push("edited by user");
  if (item.human_verified) tags.push("human-verified");
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

function buildWorkflowBlock(workflow: WorkflowView | null): string {
  if (!workflow) return "(no workflow extracted yet)";

  const stepLine = (s: WorkflowStep) => `- ${s.title}${editMetaSuffix(s)}: ${s.description ?? ""}`;
  const componentLine = (c: WorkflowComponent) =>
    `- [${c.component_type}] ${c.label}${editMetaSuffix(c)}: ${c.description ?? ""}`;
  const gapLine = (g: WorkflowGap) => `- [${g.gap_status}] ${g.label}: ${g.description ?? ""}`;

  return `Steps:
${workflow.steps.length > 0 ? workflow.steps.map(stepLine).join("\n") : "(none yet)"}

Components:
${workflow.components.length > 0 ? workflow.components.map(componentLine).join("\n") : "(none yet)"}

Gaps:
${workflow.gaps.length > 0 ? workflow.gaps.map(gapLine).join("\n") : "(none yet)"}`;
}

function buildAmbiguityBlock(flags: AmbiguityFlag[]): string {
  const open = flags.filter((f) => f.status === "open");
  if (open.length === 0) return "(none noted - these are separate from contradictions, just context)";
  return open
    .map((f) => `- [${f.ambiguity_type}] ${f.label}: ${f.description ?? ""}`)
    .join("\n");
}

function buildExistingCandidatesBlock(candidates: ContradictionCandidate[]): string {
  if (candidates.length === 0) return "(none yet)";
  return candidates
    .map(
      (c) =>
        `- [${c.status}, ${c.contradiction_type}] ${c.label}: claim A: "${c.claim_a}" vs claim B: "${c.claim_b}"`
    )
    .join("\n");
}

function buildUserPrompt(
  meeting: Meeting,
  transcriptSegments: TranscriptSegment[],
  latestTranscriptSegmentId: string,
  workflow: WorkflowView | null,
  ambiguityFlags: AmbiguityFlag[],
  existingCandidates: ContradictionCandidate[]
): string {
  const transcriptBlock = transcriptSegments
    .map((segment, i) => {
      const marker = segment.id === latestTranscriptSegmentId ? " <- newest segment just heard" : "";
      return `${i + 1}. [id: ${segment.id}] ${segment.raw_text}${marker}`;
    })
    .join("\n");

  return `Meeting setup:
- Name: ${meeting.name}
- Meeting type: ${meeting.meeting_type}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding going in: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction (a hypothesis only, not a fact - may be one side of a build_assumption_conflict, never evidence for anything else): ${meeting.tentative_build_direction ?? "none given"}

Current workflow model (human-edited/locked/verified items are tagged inline - never treat a human's own correction as conflicting with something the AI extracted earlier):
${buildWorkflowBlock(workflow)}

Existing ambiguity flags (separate concept - "something was said vaguely", not a contradiction; shown only as context):
${buildAmbiguityBlock(ambiguityFlags)}

Existing contradiction candidates already tracked for this meeting (never re-flag a resolved/dismissed one without clearly new evidence; you may keep listing a still-valid open one, or add a genuinely new one):
${buildExistingCandidatesBlock(existingCandidates)}

Full transcript heard so far for this meeting (oldest to newest):
${transcriptBlock}

Identify any possible inconsistencies per the system prompt's rules and return the structured result. An empty array is expected and correct most of the time.`;
}

function sanitizeSourceSegmentId(
  candidateId: string | null,
  validSegmentIds: ReadonlySet<string>
): string | null {
  if (candidateId && validSegmentIds.has(candidateId)) {
    return candidateId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sprint 12.1: evidence hardening. The detector's own prompt already tells
// the model never to invent a quote or use a gap's wording as a claim, but
// Part I QA (Sprint 12) found gpt-4o-mini doesn't reliably follow that on its
// own - one persisted candidate had a hallucinated quote, and its claim text
// was actually a paraphrase of an already-open workflow_gap. Everything
// below is a code-level backstop that runs before reconciliation: a
// candidate that fails it is dropped entirely (never partially saved with a
// null'd-out bad field) - the safest option per the hardening request, since
// a contradiction candidate is only useful if both sides are trustworthy.
// ---------------------------------------------------------------------------

/** Curly quotes/whitespace variance shouldn't cause an otherwise-real quote to fail verification. */
function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, " ");
}

type ClaimGrounding = "grounded" | "ungrounded" | "invalid";

/**
 * grounded: has a real segment id (a quote, if present, verified as an actual
 * substring of that segment's text - case-insensitive fallback accepted and
 * logged, matching the harmless transcription-casing artifacts already
 * documented elsewhere in this app, e.g. "Security" vs "security").
 * ungrounded: no segment id and no quote at all - only ever acceptable for
 * the tentative-build-direction side of a build_assumption_conflict.
 * invalid: a quote that doesn't actually appear in its cited segment, or a
 * quote given with no segment id to verify it against - never acceptable,
 * this is exactly the hallucinated-quote failure mode Sprint 12.1 targets.
 */
function classifyClaimGrounding(
  quote: string | null,
  segmentId: string | null,
  segmentTextById: ReadonlyMap<string, string>,
  logLabel: string
): ClaimGrounding {
  if (!segmentId) {
    return quote ? "invalid" : "ungrounded";
  }
  const segmentText = segmentTextById.get(segmentId);
  if (!segmentText) {
    // Shouldn't happen - segmentId was already sanitized against the real
    // id set before this runs - but never trust an unverifiable citation.
    return quote ? "invalid" : "ungrounded";
  }
  if (!quote) {
    return "grounded";
  }

  const normalizedQuote = normalizeForQuoteMatch(quote);
  const normalizedSegment = normalizeForQuoteMatch(segmentText);
  if (normalizedSegment.includes(normalizedQuote)) {
    return "grounded";
  }
  if (normalizedSegment.toLowerCase().includes(normalizedQuote.toLowerCase())) {
    console.info(
      `[contradiction-detector] "${logLabel}" quote matched only case-insensitively - accepted as a harmless transcription-casing artifact: "${quote}"`
    );
    return "grounded";
  }
  return "invalid";
}

function tokenizeForGapMatch(text: string): Set<string> {
  return new Set(
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .split(" ")
      .filter((token) => token.length > 2)
  );
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  return shared / Math.min(a.size, b.size);
}

/** How similar an ungrounded claim's wording must be to an open gap/ambiguity flag's own label+description to count as "this is just restating the gap, not a claim" - same convention as contradictionCandidates.ts's own SAME_CLAIMS_MATCH_THRESHOLD. */
const GAP_WORDING_MATCH_THRESHOLD = 0.6;

/**
 * Defense-in-depth for the exact Sprint 12 QA failure: an ungrounded claim
 * (only ever allowed for a build_assumption_conflict's setup-derived side)
 * must actually resemble the tentative build direction, not an open gap or
 * ambiguity flag's own wording restated as if it were a claim.
 */
function claimMatchesTrackedIssueWording(
  claimText: string,
  openGaps: WorkflowGap[],
  openAmbiguityFlags: AmbiguityFlag[]
): boolean {
  const claimTokens = tokenizeForGapMatch(claimText);
  for (const gap of openGaps) {
    const gapTokens = tokenizeForGapMatch(`${gap.label} ${gap.description ?? ""}`);
    if (tokenOverlapRatio(claimTokens, gapTokens) >= GAP_WORDING_MATCH_THRESHOLD) {
      return true;
    }
  }
  for (const flag of openAmbiguityFlags) {
    const flagTokens = tokenizeForGapMatch(`${flag.label} ${flag.description ?? ""}`);
    if (tokenOverlapRatio(claimTokens, flagTokens) >= GAP_WORDING_MATCH_THRESHOLD) {
      return true;
    }
  }
  return false;
}

interface DroppedCandidateNote {
  label: string;
  reason: string;
}

/**
 * The single evidence gate every candidate must pass before it's ever
 * reconciled/persisted. Returns a reason string when dropping so the
 * decision is visible in ai_run_logs.output.droppedCandidates rather than
 * silently disappearing - mirrors the visibility
 * workflowExtractorService/workflows.ts already give duplicate suppressions.
 */
function evaluateCandidateEvidence(
  draft: ContradictionCandidateDraft,
  segmentTextById: ReadonlyMap<string, string>,
  openGaps: WorkflowGap[],
  openAmbiguityFlags: AmbiguityFlag[]
): { keep: true } | { keep: false; reason: string } {
  const groundingA = classifyClaimGrounding(
    draft.sourceQuoteA,
    draft.sourceTranscriptSegmentIdA,
    segmentTextById,
    "claim_a"
  );
  const groundingB = classifyClaimGrounding(
    draft.sourceQuoteB,
    draft.sourceTranscriptSegmentIdB,
    segmentTextById,
    "claim_b"
  );

  if (groundingA === "invalid") {
    return {
      keep: false,
      reason:
        "claim_a's source_quote is not a real substring of its cited transcript segment (or was given without a segment id to verify against) - possible hallucinated quote",
    };
  }
  if (groundingB === "invalid") {
    return {
      keep: false,
      reason:
        "claim_b's source_quote is not a real substring of its cited transcript segment (or was given without a segment id to verify against) - possible hallucinated quote",
    };
  }

  const isBuildAssumption = draft.contradictionType === "build_assumption_conflict";

  if (!isBuildAssumption) {
    if (groundingA === "ungrounded") {
      return {
        keep: false,
        reason:
          "claim_a has no transcript grounding (no segment id/quote) and this candidate isn't a build_assumption_conflict - missing information belongs in workflow_gaps/ambiguity_flags, not a contradiction candidate",
      };
    }
    if (groundingB === "ungrounded") {
      return {
        keep: false,
        reason:
          "claim_b has no transcript grounding (no segment id/quote) and this candidate isn't a build_assumption_conflict - missing information belongs in workflow_gaps/ambiguity_flags, not a contradiction candidate",
      };
    }
  } else if (groundingA === "ungrounded" && groundingB === "ungrounded") {
    return {
      keep: false,
      reason: "both claims are ungrounded - a build_assumption_conflict still needs at least one real transcript-backed claim",
    };
  }

  if (groundingA === "ungrounded" && claimMatchesTrackedIssueWording(draft.claimA, openGaps, openAmbiguityFlags)) {
    return {
      keep: false,
      reason: "claim_a closely matches an open workflow_gap/ambiguity_flag's own wording rather than the transcript or meeting setup - looks like a gap restated as a claim",
    };
  }
  if (groundingB === "ungrounded" && claimMatchesTrackedIssueWording(draft.claimB, openGaps, openAmbiguityFlags)) {
    return {
      keep: false,
      reason: "claim_b closely matches an open workflow_gap/ambiguity_flag's own wording rather than the transcript or meeting setup - looks like a gap restated as a claim",
    };
  }

  return { keep: true };
}

/**
 * Runs the contradiction detector over everything heard so far in the
 * meeting and reconciles the resulting candidates. Called after the
 * workflow extractor (see lib/services/transcriptAnalysis.ts) - kept as a
 * fully separate model/table set so a failure here never blocks the
 * fast-loop/workflow-extractor results the facilitator is waiting on. No
 * separate reasoning path for live audio: this runs on the same
 * accumulated transcript regardless of how segments were captured.
 */
export async function detectContradictions(
  meetingId: string,
  latestTranscriptSegmentId: string
): Promise<ContradictionCandidate[]> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const [transcriptSegments, workflow, ambiguityFlags, existingCandidates] = await Promise.all([
    getOrderedTranscriptSegmentsForMeeting(meetingId),
    getWorkflowView(meetingId),
    getAmbiguityFlagsForMeeting(meetingId),
    listContradictionCandidates(meetingId),
  ]);
  const validSegmentIds = new Set(transcriptSegments.map((s) => s.id));

  const model = process.env.OPENAI_CONTRADICTION_DETECTOR_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(
    "contradiction_detector",
    {
      meetingId,
      latestTranscriptSegmentId,
      segmentCount: transcriptSegments.length,
      model,
    },
    meetingId
  );

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "contradiction_detection",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            // Deterministic, conservative judgment - not a creative task.
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt(
                  details.meeting,
                  transcriptSegments,
                  latestTranscriptSegmentId,
                  workflow,
                  ambiguityFlags,
                  existingCandidates
                ),
              },
            ],
            response_format: zodResponseFormat(ContradictionDetectorOutputSchema, "contradiction_detector_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const segmentTextById = new Map(transcriptSegments.map((s) => [s.id, s.raw_text]));
    const openGaps = (workflow?.gaps ?? []).filter((g) => g.gap_status === "open");
    const openAmbiguityFlags = ambiguityFlags.filter((f) => f.status === "open");

    const drafts: ContradictionCandidateDraft[] = parsed.contradiction_candidates.map((c) => ({
      label: c.label,
      description: c.description,
      contradictionType: c.contradiction_type,
      severity: c.severity,
      claimA: c.claim_a,
      claimB: c.claim_b,
      sourceTranscriptSegmentIdA: sanitizeSourceSegmentId(c.source_transcript_segment_id_a, validSegmentIds),
      sourceTranscriptSegmentIdB: sanitizeSourceSegmentId(c.source_transcript_segment_id_b, validSegmentIds),
      sourceQuoteA: c.source_quote_a,
      sourceQuoteB: c.source_quote_b,
      suggestedClarificationQuestion: c.suggested_clarification_question,
    }));

    const keptDrafts: ContradictionCandidateDraft[] = [];
    const droppedCandidates: DroppedCandidateNote[] = [];
    for (const draft of drafts) {
      const result = evaluateCandidateEvidence(draft, segmentTextById, openGaps, openAmbiguityFlags);
      if (result.keep) {
        keptDrafts.push(draft);
      } else {
        droppedCandidates.push({ label: draft.label, reason: result.reason });
        console.info(`[contradiction-detector] dropped candidate "${draft.label}" - ${result.reason}`);
      }
    }

    await reconcileContradictionCandidates(meetingId, keptDrafts);

    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), { ...parsed, droppedCandidates });

    return listContradictionCandidates(meetingId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contradiction detection failed";
    const failureInfo = describeAiCallFailureForLog(err, "contradiction_detection");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

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
import { getHypothesesForMeeting } from "@/lib/services/hypotheses";
import { getAllDirectionsForMeeting } from "@/lib/services/questionDirections";
import { getOrderedTranscriptSegmentsForMeeting } from "@/lib/services/transcriptSegments";
import { getWorkflowView, type WorkflowView } from "@/lib/services/workflows";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import {
  createPostMeetingReview,
  getLatestPostMeetingReview,
} from "@/lib/services/postMeetingReviews";
import { logUserAction } from "@/lib/services/userActions";
import type {
  AmbiguityFlag,
  Assumption,
  ContradictionCandidate,
  Hypothesis,
  Meeting,
  PostMeetingReview,
  QuestionDirection,
  TranscriptSegment,
  WorkflowComponent,
  WorkflowGap,
  WorkflowSourceOrigin,
  WorkflowStep,
} from "@/lib/types/database";

const REVIEW_EVIDENCE_TYPES = ["known", "inferred"] as const;
const REVIEW_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const ASSUMPTION_UPDATE_STATUSES = ["supported", "weakened", "unresolved", "changed"] as const;
const BUILD_DIRECTION_STATUSES = [
  "supported",
  "partially_supported",
  "weakened",
  "needs_reframing",
] as const;
const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;

const KeyLearningSchema = z.object({
  learning: z.string().describe("One concrete, specific thing actually learned - not a generic observation."),
  evidence_type: z
    .enum(REVIEW_EVIDENCE_TYPES)
    .describe("known: directly stated in the transcript or a known workflow item. inferred: a reasonable synthesis, not itself verbatim."),
  supporting_workflow_item: z
    .string()
    .nullable()
    .describe("Title/label of the specific workflow step, component, or gap this learning is grounded in, if any. Null if not tied to one specific item."),
  source_quote: z
    .string()
    .nullable()
    .describe("A short verbatim quote from the transcript (or the supporting item's own source_quote) backing this learning. Null if none applies. Never fabricate a quote."),
});

const OpenQuestionSchema = z.object({
  question: z
    .string()
    .describe("An open unknown, phrased as a question - must correspond to a gap whose gap_status is actually 'open'. Never phrase an answered or dismissed gap as an open question."),
  why_it_matters: z.string(),
  priority: z.enum(REVIEW_PRIORITIES),
});

const AssumptionUpdateSchema = z.object({
  assumption: z.string().describe("The starting assumption's text, copied from the assumptions list given."),
  status: z
    .enum(ASSUMPTION_UPDATE_STATUSES)
    .describe("supported: evidence backs it up. weakened: evidence complicates or partially undercuts it. unresolved: still no evidence either way. changed: evidence directly contradicts or replaces it."),
  reason: z.string().describe("The specific evidence behind this status - never a generic phrase."),
});

const BuildDirectionAssessmentSchema = z.object({
  status: z
    .enum(BUILD_DIRECTION_STATUSES)
    .describe("Assessed strictly against the actual workflow evidence, never assumed correct by default just because it was stated first."),
  assessment: z
    .string()
    .describe("Specific assessment naming the actual workflow complexity (routing/decision logic, jurisdiction variation, reviewer/ownership determination, compliance approval, failure detection/recovery, systems/tooling) that supports this status - grounded in the real steps/components/gaps, not generic caution."),
  recommended_reframe: z
    .string()
    .nullable()
    .describe("If status is 'weakened' or 'needs_reframing', a specific alternative or broadened framing the evidence actually supports. Null if status is 'supported' or 'partially_supported' and no reframe is needed."),
});

const RecommendedFollowupSchema = z.object({
  topic: z.string().describe("Short topic name for a future discovery conversation."),
  question: z.string().describe("A specific, concrete question to ask next - not a generic 'learn more about X'."),
  priority: z.enum(REVIEW_PRIORITIES),
});

const RiskSchema = z.object({
  risk: z.string().describe("A specific unresolved risk - not a generic caution."),
  severity: z.enum(RISK_SEVERITIES),
  reason: z.string().describe("The specific evidence or gap behind this risk."),
});

const PostMeetingReviewOutputSchema = z.object({
  executive_summary: z
    .string()
    .describe("3-5 sentences: what this discovery meeting actually revealed, for someone who wasn't there."),
  key_learnings: z
    .array(KeyLearningSchema)
    .describe("Concrete, specific learnings grounded in the transcript/workflow. Empty array if genuinely none."),
  workflow_summary: z
    .string()
    .describe("Short explanation (3-6 sentences) of the current workflow: major steps, actors, approvals, handoffs, tools/systems, failure points, and recovery/ownership where known. Grounded in the actual workflow_steps/workflow_components given, not the workflow's own possibly-stale known_summary."),
  known_facts: z
    .array(z.string())
    .describe("Concrete facts directly established (known evidence_type, or human-verified/human-edited items). Distinct from inferences."),
  inferences: z
    .array(z.string())
    .describe("Reasonable interpretations/synthesis that aren't themselves directly stated - distinct from known_facts."),
  open_questions: z
    .array(OpenQuestionSchema)
    .describe("Open unknowns - must correspond only to gaps whose gap_status is 'open'. Never include an answered or dismissed gap here."),
  assumption_updates: z
    .array(AssumptionUpdateSchema)
    .describe("One entry per starting assumption given - empty array only if no assumptions were recorded."),
  build_direction_assessment: BuildDirectionAssessmentSchema,
  recommended_followups: z
    .array(RecommendedFollowupSchema)
    .describe("Specific next discovery questions/topics for a future meeting - not implementation tickets or stories."),
  risks: z
    .array(RiskSchema)
    .describe("Unresolved risks, especially compliance, rule/jurisdiction complexity, data availability, reviewer/ownership, systems/tooling uncertainty, and delayed failure detection where evidenced."),
});

export type PostMeetingReviewOutput = z.infer<typeof PostMeetingReviewOutputSchema>;

const SYSTEM_PROMPT = `You are the post-meeting review analyst inside DiscoveryOS, a live product discovery HUD. You run once, after a discovery meeting, to produce a lightweight retrospective: what was actually learned, what remains unknown, and what should happen next. You are a reporting/synthesis role - you do not generate live question directions (the fast loop's job) or extract the structured workflow model (the workflow extractor's job); you consume their output and report on it.

Source priority - the workflow's own known_summary/unknown_summary free-text fields are regenerated on their own cadence and can lag behind the actual structured child items on a long-running meeting. Never rely on them as your primary source. Use, in this strict order:
1. Workflow items marked human-edited or human-verified - the facilitator's own corrections and confirmations are stronger evidence than anything AI-generated and untouched.
2. The current workflow_steps, workflow_components, and workflow_gaps themselves - the structured, reconciled model.
3. Each gap's status - open vs answered vs dismissed.
4. Each item's evidence metadata and source quotes (evidence_type, source_quote, confidence_reason).
5. The full transcript - ground truth for anything not yet captured structurally, and for pulling additional direct quotes.
6. The workflow's own known_summary/unknown_summary text - secondary, potentially-stale context only, never your primary source.

Ground rules:
- Do not invent facts. Every learning, known fact, and risk must trace to something actually said in the transcript or captured in the workflow model - never fill in a plausible-sounding detail that wasn't actually evidenced.
- Treat human-edited (source_origin other than "ai") and human-verified (human_verified: true) workflow items as stronger, more trustworthy evidence than untouched AI-generated items - a human correction or confirmation is more authoritative than what the AI extractor originally produced.
- Gaps stay unknown until actually resolved: an "open" gap is a genuine unanswered unknown - present it as one in open_questions. An "answered" or "dismissed" gap must NEVER be presented as an open unknown or open question - it has already been resolved or set aside by the facilitator, so treat it as closed even if you can imagine further follow-up about it.
- The meeting's "tentative build direction" (if given) is a hypothesis, never a fact - build_direction_assessment must evaluate it critically against the actual evidence, not restate it as already correct. If the workflow's actual complexity (routing/decision logic, jurisdiction or rule variation, reviewer/ownership determination, compliance approval, failure detection and recovery, systems/tooling) turns out to be broader than, different from, or more nuanced than what the tentative direction narrowly targets, say so specifically using the actual steps/components/gaps as evidence - never rubber-stamp the original direction just because it was stated first, and never invent a mismatch the evidence doesn't actually support.
- This is a lightweight review, not a ticket/story generator - never produce implementation tickets, user stories, or acceptance criteria. Recommended follow-ups are discovery questions/topics for a future conversation, not engineering tasks.
- You may be given a list of "points needing clarification" (ambiguity flags) - fuzzy language, informal terms, or unclear ownership/criteria already noticed during the meeting. Treat these as useful supporting context for open_questions and recommended_followups where relevant, never as facts, and never as evidence of a contradiction - they're already framed neutrally, keep them that way.
- You may also be given a list of open "clarification needs" (contradiction candidates, Sprint 12) - possible inconsistencies between two separately-evidenced claims (ownership, rules, approvals, systems, timing, or build assumptions) that were already noticed and are still awaiting clarification. Mention unresolved ones as clarification needs in open_questions and/or recommended_followups where useful, using their own suggested clarification question as a starting point when it fits. Never say the stakeholder "contradicted themselves" or frame this as anyone being wrong - use the same calm language already attached to each one ("needs clarification", "possible inconsistency", "may depend on context"). A contradiction candidate already marked resolved or dismissed by the facilitator must NEVER be presented as an open unknown - treat it as closed, exactly like an answered/dismissed workflow gap.
- Confidence/priority/severity/status fields are always the fixed ordinal options given in the schema - never invent a new one or use a numeric score.
- Keep every section grounded and specific to this meeting - avoid generic, could-apply-to-any-meeting filler.`;

/** Renders the human-edit/verify/lock trust signal inline, since the review must weight these items more heavily per the ground rules above. */
function trustTag(item: {
  source_origin: WorkflowSourceOrigin;
  human_verified: boolean;
  locked_by_user: boolean;
}): string {
  const tags: string[] = [];
  if (item.source_origin !== "ai") tags.push("human-edited");
  if (item.human_verified) tags.push("human-verified");
  if (item.locked_by_user) tags.push("locked");
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

function formatStep(step: WorkflowStep): string {
  const quote = step.source_quote ? `\n  Quote: "${step.source_quote}"` : "";
  return `- ${step.title} (${step.confidence_level}, ${step.evidence_type})${trustTag(step)}\n  ${step.description ?? ""}${quote}`;
}

function formatComponent(component: WorkflowComponent): string {
  const quote = component.source_quote ? `\n  Quote: "${component.source_quote}"` : "";
  return `- [${component.component_type}] ${component.label} (${component.confidence_level}, ${component.evidence_type})${trustTag(component)}\n  ${component.description ?? ""}${quote}`;
}

function formatOpenGap(gap: WorkflowGap): string {
  const quote = gap.source_quote ? `\n  Quote: "${gap.source_quote}"` : "";
  return `- ${gap.label}${trustTag(gap)}\n  ${gap.description ?? ""} (${gap.confidence_reason})${quote}`;
}

function formatResolvedGap(gap: WorkflowGap): string {
  return `- [${gap.gap_status}] ${gap.label}: ${gap.description ?? ""}`;
}

function formatAmbiguityFlag(flag: AmbiguityFlag): string {
  const quote = flag.source_quote ? ` Quote: "${flag.source_quote}"` : "";
  return `- [${flag.status}, ${flag.ambiguity_type}] ${flag.label}: ${flag.description ?? ""}${quote}`;
}

function buildAmbiguityBlock(flags: AmbiguityFlag[]): string {
  const open = flags.filter((f) => f.status === "open");
  if (open.length === 0) {
    return "(none noted)";
  }
  return open.map(formatAmbiguityFlag).join("\n");
}

function formatContradictionCandidate(candidate: ContradictionCandidate): string {
  const question = candidate.suggested_clarification_question
    ? ` Suggested question: "${candidate.suggested_clarification_question}"`
    : "";
  return `- [${candidate.contradiction_type}, ${candidate.severity}] ${candidate.label}: ${candidate.description} (claim A: "${candidate.claim_a}"; claim B: "${candidate.claim_b}")${question}`;
}

/** Only open candidates are ever passed in - resolved/dismissed ones must never be presented as unresolved (see the ground rules above). */
function buildContradictionBlock(candidates: ContradictionCandidate[]): string {
  const open = candidates.filter((c) => c.status === "open");
  if (open.length === 0) {
    return "(none open)";
  }
  return open.map(formatContradictionCandidate).join("\n");
}

function buildWorkflowBlock(workflowView: WorkflowView | null): string {
  if (!workflowView) {
    return "(no workflow extracted for this meeting)";
  }

  const openGaps = workflowView.gaps.filter((g) => g.gap_status === "open");
  const resolvedGaps = workflowView.gaps.filter((g) => g.gap_status !== "open");

  return `Workflow name: ${workflowView.workflow.name} (overall confidence: ${workflowView.workflow.confidence_level})

Workflow's own known_summary (secondary context only, may be stale - do not treat as primary source):
${workflowView.workflow.known_summary || "(none)"}

Workflow's own unknown_summary (secondary context only, may be stale - do not treat as primary source):
${workflowView.workflow.unknown_summary || "(none)"}

Steps - primary source, in order:
${workflowView.steps.length > 0 ? workflowView.steps.map(formatStep).join("\n") : "(none)"}

Components - primary source:
${workflowView.components.length > 0 ? workflowView.components.map(formatComponent).join("\n") : "(none)"}

OPEN gaps - genuine unresolved unknowns, primary source for open_questions/risks:
${openGaps.length > 0 ? openGaps.map(formatOpenGap).join("\n") : "(none open)"}

RESOLVED gaps - already answered or dismissed by the facilitator - NEVER present these as open unknowns:
${resolvedGaps.length > 0 ? resolvedGaps.map(formatResolvedGap).join("\n") : "(none)"}`;
}

function buildUserPrompt(
  meeting: Meeting,
  assumptions: Assumption[],
  hypotheses: Hypothesis[],
  workflowView: WorkflowView | null,
  directions: QuestionDirection[],
  transcriptSegments: TranscriptSegment[],
  ambiguityFlags: AmbiguityFlag[],
  contradictionCandidates: ContradictionCandidate[]
): string {
  const assumptionLines =
    assumptions.length > 0
      ? assumptions.map((a) => `- (${a.confidence_level}) ${a.text}`).join("\n")
      : "- none recorded";

  const hypothesisLines =
    hypotheses.length > 0
      ? hypotheses.map((h) => `- (${h.confidence_level}) ${h.statement}`).join("\n")
      : "- none recorded";

  const directionLines =
    directions.length > 0
      ? directions
          .map((d) => `- [${d.status}] ${d.text}${d.reason ? ` — ${d.reason}` : ""}`)
          .join("\n")
      : "- none recorded";

  const transcriptBlock =
    transcriptSegments.length > 0
      ? transcriptSegments.map((s, i) => `${i + 1}. ${s.raw_text}`).join("\n")
      : "(no transcript recorded)";

  return `Meeting setup:
- Name: ${meeting.name}
- Meeting type: ${meeting.meeting_type}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding going in: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction (a hypothesis to assess critically, not a fact): ${meeting.tentative_build_direction ?? "none given"}

Starting assumptions:
${assumptionLines}

Hypotheses formed during setup:
${hypothesisLines}

Question directions explored during the meeting (status shown - used/dismissed/deferred/stale ones are already handled, don't re-suggest them verbatim as follow-ups):
${directionLines}

Current workflow model:
${buildWorkflowBlock(workflowView)}

Points needing clarification noticed during the meeting (open only - already neutrally framed, not contradictions, use as supporting context only):
${buildAmbiguityBlock(ambiguityFlags)}

Open clarification needs - possible inconsistencies between two separately-evidenced claims noticed during the meeting (open only; resolved/dismissed ones are already closed and excluded here - never say anyone contradicted themselves, use the same calm framing already attached to each one):
${buildContradictionBlock(contradictionCandidates)}

Full transcript heard during this meeting (oldest to newest):
${transcriptBlock}

Generate the post-meeting review based on everything above and return the structured result.`;
}

/**
 * Runs the post-meeting review analyst and persists a new review row (never
 * overwrites a prior one - see createPostMeetingReview). Determines
 * generated vs regenerated for the user_actions log by checking whether a
 * review already existed *before* this run, mirroring how
 * generatePreMeetingBrief logs its own action inline.
 */
export async function generatePostMeetingReview(meetingId: string): Promise<PostMeetingReview> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const [
    priorReview,
    workflowView,
    hypotheses,
    directions,
    transcriptSegments,
    ambiguityFlags,
    contradictionCandidates,
  ] = await Promise.all([
    getLatestPostMeetingReview(meetingId),
    getWorkflowView(meetingId),
    getHypothesesForMeeting(meetingId),
    getAllDirectionsForMeeting(meetingId),
    getOrderedTranscriptSegmentsForMeeting(meetingId),
    getAmbiguityFlagsForMeeting(meetingId),
    listContradictionCandidates(meetingId),
  ]);

  const model = process.env.OPENAI_POST_MEETING_REVIEW_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(
    "post_meeting_review",
    {
      meetingId,
      segmentCount: transcriptSegments.length,
      model,
    },
    meetingId
  );

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "post_meeting_review",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            // Deterministic synthesis over a fixed evidence set, not a creative task.
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt(
                  details.meeting,
                  details.assumptions,
                  hypotheses,
                  workflowView,
                  directions,
                  transcriptSegments,
                  ambiguityFlags,
                  contradictionCandidates
                ),
              },
            ],
            response_format: zodResponseFormat(PostMeetingReviewOutputSchema, "post_meeting_review_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const review = await createPostMeetingReview(meetingId, {
      summary: parsed.executive_summary,
      keyLearnings: parsed.key_learnings.map((k) => ({
        learning: k.learning,
        evidenceType: k.evidence_type,
        supportingWorkflowItem: k.supporting_workflow_item ?? undefined,
        sourceQuote: k.source_quote ?? undefined,
      })),
      openQuestions: parsed.open_questions.map((q) => ({
        question: q.question,
        whyItMatters: q.why_it_matters,
        priority: q.priority,
      })),
      workflowSummary: parsed.workflow_summary,
      knownFacts: parsed.known_facts,
      inferences: parsed.inferences,
      assumptionUpdates: parsed.assumption_updates.map((a) => ({
        assumption: a.assumption,
        status: a.status,
        reason: a.reason,
      })),
      buildDirectionAssessment: {
        status: parsed.build_direction_assessment.status,
        assessment: parsed.build_direction_assessment.assessment,
        recommendedReframe: parsed.build_direction_assessment.recommended_reframe ?? undefined,
      },
      recommendedFollowups: parsed.recommended_followups.map((f) => ({
        topic: f.topic,
        question: f.question,
        priority: f.priority,
      })),
      risks: parsed.risks.map((r) => ({
        risk: r.risk,
        severity: r.severity,
        reason: r.reason,
      })),
    });

    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), parsed);
    await logUserAction(
      meetingId,
      priorReview ? "post_meeting_review_regenerated" : "post_meeting_review_generated",
      { reviewId: review.id }
    );

    return review;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Post-meeting review generation failed";
    const failureInfo = describeAiCallFailureForLog(err, "post_meeting_review");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

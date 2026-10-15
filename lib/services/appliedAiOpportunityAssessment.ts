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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getWorkflowView, type WorkflowView } from "@/lib/services/workflows";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import { getOrderedTranscriptSegmentsForMeeting } from "@/lib/services/transcriptSegments";
import {
  APPLIED_AI_OPPORTUNITY_LENS,
  APPLIED_AI_RECOMMENDATION_DESCRIPTIONS,
  APPLIED_AI_RECOMMENDATION_TYPES,
  type AppliedAiRecommendationType,
} from "@/lib/lenses/appliedAiOpportunityLens";
import { scoreAllPatternFits, pickTopPatternFits, type PatternFitResult } from "@/lib/patterns/patternFit";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  Meeting,
  TranscriptSegment,
  WorkflowComponent,
  WorkflowGap,
  WorkflowStep,
} from "@/lib/types/database";

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type AppliedAiAssessmentConfidence = (typeof CONFIDENCE_LEVELS)[number];

const RUN_TYPE = "applied_ai_opportunity_assessment";

const SupportingEvidenceSchema = z.object({
  label: z.string().describe("Short name for what this evidence supports (a workflow step/component/gap title, or a direct topic name)."),
  quote: z
    .string()
    .nullable()
    .describe("A short verbatim quote from the transcript or an existing item's own source_quote backing this. Null if none applies - never fabricate one."),
});

export type AppliedAiSupportingEvidence = z.infer<typeof SupportingEvidenceSchema>;

const AppliedAiAssessmentOutputSchema = z.object({
  recommendation_type: z
    .enum(APPLIED_AI_RECOMMENDATION_TYPES)
    .describe(
      "Which intervention the evidence actually supports - never default to ai_assist without considering the other six. 'not_ready' and 'no_build' are both valid, first-class answers, not failure states."
    ),
  confidence: z
    .enum(CONFIDENCE_LEVELS)
    .describe(
      "How strong the evidence behind this recommendation actually is. Must be 'low' whenever the workflow model is thin, mostly inferred/unknown, or the transcript barely covers the applied AI opportunity lens's dimensions - never inflate confidence to sound more decisive than the evidence supports."
    ),
  reasoning: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Specific reasons for this recommendation, each grounded in an actual workflow step/component/gap or transcript detail - never generic justification."),
  supporting_evidence: z.array(SupportingEvidenceSchema).max(8),
  risks: z
    .array(z.string())
    .max(6)
    .describe("Specific risks with this opportunity or with acting on this recommendation - privacy/security/compliance/legal/customer/financial/operational/brand/trust, where evidenced. Empty array only if genuinely none apply."),
  missing_information: z
    .array(z.string())
    .min(1)
    .max(8)
    .describe("What isn't known yet that would change or firm up this recommendation - be explicit and specific. Almost never empty; if truly nothing is missing, say so as a single explicit item rather than an empty array."),
  smallest_useful_experiment: z
    .string()
    .describe("The smallest, safest test that could validate or invalidate this opportunity before committing to a full build - never a full implementation plan."),
  suggested_next_questions: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Concrete questions to ask in a follow-up conversation to firm up this recommendation."),
  success_metric_candidates: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Candidate ways to measure whether this worked (time saved, cycle time, error rate, rework, completeness, visibility, consistency, experience) - named as candidates to track, never as an invented number, percentage, or dollar figure."),
});

export interface AppliedAiOpportunityAssessment {
  recommendationType: AppliedAiRecommendationType;
  confidence: AppliedAiAssessmentConfidence;
  reasoning: string[];
  supportingEvidence: AppliedAiSupportingEvidence[];
  risks: string[];
  missingInformation: string[];
  smallestUsefulExperiment: string;
  suggestedNextQuestions: string[];
  successMetricCandidates: string[];
  /** Sprint 26: every pattern in the library, scored deterministically (lib/patterns/patternFit.ts) - never AI-generated, so the AI's overall reasoning above can never override a fit level. Ranked strongest-first. */
  patternFits: PatternFitResult[];
  /** Sprint 26: patternFits' patternIds at "possible" fit or better, capped to a handful - convenience for UI/regression, always derivable from patternFits itself. */
  topRecommendedPatternIds: string[];
  generatedAt: string;
}

const LENS_SUMMARY = APPLIED_AI_OPPORTUNITY_LENS.map((d) => `- ${d.title}: ${d.description}`).join("\n");

const RECOMMENDATION_SUMMARY = APPLIED_AI_RECOMMENDATION_TYPES.map(
  (type) => `- ${type}: ${APPLIED_AI_RECOMMENDATION_DESCRIPTIONS[type]}`
).join("\n");

const SYSTEM_PROMPT = `You are the Applied AI Opportunity Assessment analyst inside DiscoveryOS. You run after a discovery meeting to produce a cautious, evidence-grounded recommendation on whether the workflow discussed is a good candidate for AI assist, rules automation, workflow redesign, reporting/visibility, human process change, not-ready, or no-build. You support internal AI Labs work, freelance discovery calls, applied AI consulting, and process-improvement interviews equally - never write in internal-only language, and never assume this is for a Labs backlog specifically.

Core product principle: DiscoveryOS never forces AI as the answer. Your job is to identify the right intervention, not to build a case for AI. Weigh all seven recommendation types honestly:
${RECOMMENDATION_SUMMARY}

Ground every judgment in the applied AI opportunity lens's dimensions:
${LENS_SUMMARY}

Ground rules:
- Never invent facts. Every reasoning point, risk, and piece of supporting evidence must trace to an actual workflow step/component/gap or something actually said in the transcript - never a plausible-sounding detail that wasn't evidenced.
- Never fabricate a number, percentage, dollar figure, or ROI estimate anywhere in your output - success_metric_candidates names what to measure, never a projected result. If the meeting or transcript already states a real number, you may reference it, but never estimate one yourself.
- Confidence must honestly reflect evidence strength: low whenever the workflow model is thin, most items are inferred/unknown, or several lens dimensions were never actually discussed. Only use "high" when the workflow is well-evidenced (known evidence_type, human-verified where relevant) across most of the lens's dimensions relevant to this meeting.
- Missing information must be explicit and specific - never paper over a real gap to sound more conclusive.
- "not_ready" and "no_build" are correct, complete answers whenever the evidence actually points there - never stretch weak evidence into an "ai_assist" recommendation just to have something more exciting to report. Likewise, don't recommend automation/redesign over a genuinely-fine process just to produce a recommendation.
- Treat human-edited/human-verified workflow items as stronger evidence than untouched AI-generated ones, same priority order the rest of DiscoveryOS uses.
- Open workflow gaps and open "needs clarification"/"possible mismatch" items are real unknowns - reflect them in missing_information and suggested_next_questions. Resolved/dismissed ones are already closed; never present them as open.
- This is working guidance for a facilitator, not a final business case, ROI study, or investment memo - keep it appropriately humble in tone.`;

function trustTag(item: { source_origin: string; human_verified: boolean; locked_by_user: boolean }): string {
  const tags: string[] = [];
  if (item.source_origin !== "ai") tags.push("human-edited");
  if (item.human_verified) tags.push("human-verified");
  if (item.locked_by_user) tags.push("locked");
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

function formatStep(step: WorkflowStep): string {
  const quote = step.source_quote ? ` Quote: "${step.source_quote}"` : "";
  return `- ${step.title} (${step.confidence_level}, ${step.evidence_type})${trustTag(step)} ${step.description ?? ""}${quote}`;
}

function formatComponent(component: WorkflowComponent): string {
  const quote = component.source_quote ? ` Quote: "${component.source_quote}"` : "";
  return `- [${component.component_type}] ${component.label} (${component.confidence_level}, ${component.evidence_type})${trustTag(component)} ${component.description ?? ""}${quote}`;
}

function formatGap(gap: WorkflowGap): string {
  const quote = gap.source_quote ? ` Quote: "${gap.source_quote}"` : "";
  return `- [${gap.gap_status}] ${gap.label}: ${gap.description ?? ""}${quote}`;
}

function buildWorkflowBlock(workflowView: WorkflowView | null): string {
  if (!workflowView) {
    return "(no workflow extracted for this meeting)";
  }
  return `Workflow name: ${workflowView.workflow.name} (overall confidence: ${workflowView.workflow.confidence_level})

Steps:
${workflowView.steps.length > 0 ? workflowView.steps.map(formatStep).join("\n") : "(none)"}

Components (actors/systems/data/decision rules/approvals/handoffs/exceptions/failure detection/failure recovery/outputs):
${workflowView.components.length > 0 ? workflowView.components.map(formatComponent).join("\n") : "(none)"}

Gaps (open = genuine unknown, answered/dismissed = already resolved/set aside):
${workflowView.gaps.length > 0 ? workflowView.gaps.map(formatGap).join("\n") : "(none)"}`;
}

function formatAmbiguityFlag(flag: AmbiguityFlag): string {
  const quote = flag.source_quote ? ` Quote: "${flag.source_quote}"` : "";
  return `- [${flag.ambiguity_type}] ${flag.label}: ${flag.description ?? ""}${quote}`;
}

function formatContradictionCandidate(candidate: ContradictionCandidate): string {
  return `- [${candidate.contradiction_type}, ${candidate.severity}] ${candidate.label}: ${candidate.description} (claim A: "${candidate.claim_a}"; claim B: "${candidate.claim_b}")`;
}

function buildUserPrompt(
  meeting: Meeting,
  workflowView: WorkflowView | null,
  ambiguityFlags: AmbiguityFlag[],
  contradictionCandidates: ContradictionCandidate[],
  transcriptSegments: TranscriptSegment[]
): string {
  const openAmbiguityFlags = ambiguityFlags.filter((f) => f.status === "open");
  const openContradictionCandidates = contradictionCandidates.filter((c) => c.status === "open");
  const transcriptBlock =
    transcriptSegments.length > 0
      ? transcriptSegments.map((s, i) => `${i + 1}. ${s.raw_text}`).join("\n")
      : "(no transcript recorded)";

  return `Meeting setup:
- Name: ${meeting.name}
- Meeting type: ${meeting.meeting_type}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding going in: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction (a hypothesis, not a fact - assess critically): ${meeting.tentative_build_direction ?? "none given"}

Current workflow model:
${buildWorkflowBlock(workflowView)}

Open "needs clarification" items (already neutrally framed, not contradictions):
${openAmbiguityFlags.length > 0 ? openAmbiguityFlags.map(formatAmbiguityFlag).join("\n") : "(none open)"}

Open "possible mismatch" items (two separately-evidenced claims awaiting clarification):
${openContradictionCandidates.length > 0 ? openContradictionCandidates.map(formatContradictionCandidate).join("\n") : "(none open)"}

Full transcript heard during this meeting (oldest to newest):
${transcriptBlock}

Assess this workflow against the applied AI opportunity lens and return the structured recommendation.`;
}

/**
 * Sprint 25 Part E: generates a cautious, evidence-grounded Applied AI
 * opportunity assessment for a meeting and persists it via ai_run_logs
 * (run_type "applied_ai_opportunity_assessment") rather than a dedicated
 * table - this is lightweight working guidance, not a structured model with
 * its own reconciliation/editing lifecycle like workflows. Not restricted
 * to applied_ai_discovery meetings at the service layer (the lens is
 * reusable, per Part B) - the Review page UI is what scopes visibility to
 * that meeting type.
 */
export async function generateAppliedAiOpportunityAssessment(
  meetingId: string
): Promise<AppliedAiOpportunityAssessment> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const [workflowView, ambiguityFlags, contradictionCandidates, transcriptSegments] = await Promise.all([
    getWorkflowView(meetingId),
    getAmbiguityFlagsForMeeting(meetingId),
    listContradictionCandidates(meetingId),
    getOrderedTranscriptSegmentsForMeeting(meetingId),
  ]);

  const model = process.env.OPENAI_APPLIED_AI_ASSESSMENT_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(RUN_TYPE, { meetingId, segmentCount: transcriptSegments.length, model }, meetingId);

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "applied_ai_assessment",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt(details.meeting, workflowView, ambiguityFlags, contradictionCandidates, transcriptSegments),
              },
            ],
            response_format: zodResponseFormat(AppliedAiAssessmentOutputSchema, "applied_ai_opportunity_assessment_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    // Sprint 26 Part C: pattern fits are scored entirely deterministically,
    // from the same evidence as the prompt above - never fed back into the
    // AI call, so the AI's own reasoning can never override a fit level
    // (it never sees patternFits at all).
    const patternFits = scoreAllPatternFits({
      meeting: details.meeting,
      workflowView,
      ambiguityFlags: ambiguityFlags.filter((f) => f.status === "open"),
      contradictionCandidates: contradictionCandidates.filter((c) => c.status === "open"),
      appliedAiAssessment: {
        recommendationType: parsed.recommendation_type,
        risks: parsed.risks,
        missingInformation: parsed.missing_information,
      },
    });

    const result: AppliedAiOpportunityAssessment = {
      recommendationType: parsed.recommendation_type,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      supportingEvidence: parsed.supporting_evidence,
      risks: parsed.risks,
      missingInformation: parsed.missing_information,
      smallestUsefulExperiment: parsed.smallest_useful_experiment,
      suggestedNextQuestions: parsed.suggested_next_questions,
      successMetricCandidates: parsed.success_metric_candidates,
      patternFits,
      topRecommendedPatternIds: pickTopPatternFits(patternFits).map((p) => p.patternId),
      generatedAt: new Date().toISOString(),
    };

    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Applied AI opportunity assessment failed";
    const failureInfo = describeAiCallFailureForLog(err, "applied_ai_assessment");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

/** Latest successfully-generated assessment for a meeting, or null if none has been generated yet. */
export async function getLatestAppliedAiOpportunityAssessment(
  meetingId: string
): Promise<AppliedAiOpportunityAssessment | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("ai_run_logs")
    .select("output")
    .eq("meeting_id", meetingId)
    .eq("run_type", RUN_TYPE)
    // Sprint 29: a call that needed one retry logs "retry_succeeded" rather
    // than "succeeded" (see aiCallSuccessStatus) - both represent a real,
    // fully-formed result, so both must be readable back here or a
    // retry-recovered assessment would silently vanish from the Review page.
    .in("status", ["succeeded", "retry_succeeded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Applied AI opportunity assessment: ${error.message}`);
  }
  if (!data?.output) {
    return null;
  }

  return data.output as AppliedAiOpportunityAssessment;
}

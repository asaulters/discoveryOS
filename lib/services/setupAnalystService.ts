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
import { reconcileHypotheses, getHypothesesForMeeting } from "@/lib/services/hypotheses";
import { addSuggestedAssumptions, getAssumptionsForMeeting } from "@/lib/services/assumptions";
import { createPreMeetingBrief, getLatestPreMeetingBrief } from "@/lib/services/preMeetingBriefs";
import { getQueuedThreads, reconcileInitialQueue } from "@/lib/services/threads";
import { logUserAction } from "@/lib/services/userActions";
import { APPLIED_AI_OPPORTUNITY_LENS } from "@/lib/lenses/appliedAiOpportunityLens";
import { APPLIED_AI_PATTERNS } from "@/lib/patterns/appliedAiPatterns";
import type {
  AppliedAiBrief,
  Assumption,
  ConfidenceLevel,
  DiscoveryThread,
  Hypothesis,
  Meeting,
  MeetingContextItem,
  MeetingType,
  PreMeetingBrief,
  ThreadPriority,
} from "@/lib/types/database";

const CONFIDENCE_LEVELS = ["unclear", "emerging", "likely", "confirmed"] as const satisfies readonly ConfidenceLevel[];
const THREAD_PRIORITIES = ["low", "medium", "high", "critical"] as const satisfies readonly ThreadPriority[];

// The core discovery lenses an automation_discovery meeting's initial queue
// must cover. The model tags each thread it proposes with the lens it maps
// to (or "other"); ensureAutomationDiscoveryLensCoverage then backfills any
// lens the model didn't cover with a fallback thread, so coverage is
// guaranteed by code rather than by hoping the prompt is followed.
const AUTOMATION_DISCOVERY_LENS_KEYS = [
  "workflow_mapping",
  "decision_rules",
  "failure_handling",
  "data_availability",
  "systems_and_tools",
  "compliance_approval",
  "reviewer_ownership",
  "success_metrics",
] as const;

// Sprint 25: the subset of lib/lenses/appliedAiOpportunityLens.ts's
// dimensions that make sense as concrete discovery-thread topics (unlike
// "recommendation_type", which is a synthesis output, not something to go
// explore in conversation). "current_process_shape" doubles as this mode's
// "Workflow mapping" equivalent - see ensureAppliedAiDiscoveryLensCoverage.
const APPLIED_AI_DISCOVERY_LENS_KEYS = [
  "workflow_pain",
  "task_intervention_type",
  "current_process_shape",
  "data_readiness",
  "rule_clarity",
  "human_review_need",
  "risk_and_constraints",
  "integration_and_implementation_surface",
  "success_metric",
] as const;

const QUEUE_CATEGORY_KEYS = [
  ...AUTOMATION_DISCOVERY_LENS_KEYS,
  ...APPLIED_AI_DISCOVERY_LENS_KEYS,
  "other",
] as const;
type QueueCategory = (typeof QUEUE_CATEGORY_KEYS)[number];

interface LensFallback {
  category: Exclude<QueueCategory, "other">;
  title: string;
  priority: ThreadPriority;
  whyItMatters: string;
}

const AUTOMATION_DISCOVERY_LENS_FALLBACKS: LensFallback[] = [
  {
    category: "workflow_mapping",
    title: "Workflow mapping",
    priority: "critical",
    whyItMatters: "Understanding the current end-to-end process is the foundation everything else builds on.",
  },
  {
    category: "decision_rules",
    title: "Decision rules",
    priority: "high",
    whyItMatters:
      "The concrete rules or judgment calls behind routing and handling decisions need to be explicit before anything can be automated.",
  },
  {
    category: "failure_handling",
    title: "Failure handling",
    priority: "high",
    whyItMatters:
      "How failures are detected, corrected, and escalated today shapes what an automated system needs to replicate or improve.",
  },
  {
    category: "data_availability",
    title: "Data availability",
    priority: "high",
    whyItMatters:
      "Whether the information needed for a decision is actually available at the point it's needed often determines whether automation is even possible.",
  },
  {
    category: "systems_and_tools",
    title: "Systems and tools",
    priority: "medium",
    whyItMatters: "The systems already involved shape what integration points any automation would need.",
  },
  {
    category: "compliance_approval",
    title: "Compliance approval",
    priority: "high",
    whyItMatters: "Regulatory or compliance-driven approval steps carry outsized risk if automated incorrectly.",
  },
  {
    category: "reviewer_ownership",
    title: "Reviewer determination",
    priority: "high",
    whyItMatters:
      "Knowing who is responsible for review and final ownership is necessary before automating any part of the decision.",
  },
  {
    category: "success_metrics",
    title: "Success metrics",
    priority: "medium",
    whyItMatters: "Without a definition of success, there's no way to know whether automation actually helped.",
  },
];

// Sprint 25: fallback threads for applied_ai_discovery, mirroring the
// automation_discovery pattern above but reading titles/descriptions from
// the shared lens (lib/lenses/appliedAiOpportunityLens.ts) instead of
// duplicating them. "current_process_shape" is titled "Workflow mapping" -
// same fixed-title reasoning as automation_discovery's own entry (see the
// comment on that category below): threads.ts's ensureDefaultActiveThread
// looks for that exact title to decide what to open the live HUD on.
function appliedAiLensFallback(key: (typeof APPLIED_AI_DISCOVERY_LENS_KEYS)[number], priority: ThreadPriority): LensFallback {
  const dimension = APPLIED_AI_OPPORTUNITY_LENS.find((d) => d.key === key);
  if (!dimension) {
    throw new Error(`Missing lens dimension for applied AI discovery fallback key "${key}"`);
  }
  return {
    category: key,
    title: key === "current_process_shape" ? "Workflow mapping" : dimension.title,
    priority,
    whyItMatters: dimension.description,
  };
}

const APPLIED_AI_DISCOVERY_LENS_FALLBACKS: LensFallback[] = [
  appliedAiLensFallback("current_process_shape", "critical"),
  appliedAiLensFallback("workflow_pain", "high"),
  appliedAiLensFallback("task_intervention_type", "medium"),
  appliedAiLensFallback("data_readiness", "high"),
  appliedAiLensFallback("rule_clarity", "high"),
  appliedAiLensFallback("human_review_need", "high"),
  appliedAiLensFallback("risk_and_constraints", "high"),
  appliedAiLensFallback("integration_and_implementation_surface", "medium"),
  appliedAiLensFallback("success_metric", "medium"),
];

type QueueDraft = { title: string; priority: ThreadPriority; whyItMatters: string; category: QueueCategory };

/**
 * Shared dedup/backfill logic behind both ensureAutomationDiscoveryLensCoverage
 * and ensureAppliedAiDiscoveryLensCoverage: keeps the first model-customized
 * draft per lens category, force-normalizes `lockedTitleCategory`'s title
 * (threads.ts's ensureDefaultActiveThread matches on it exactly to decide
 * what the live HUD opens on), and backfills any uncovered lens with its
 * fallback thread.
 */
function applyLensCoverage(
  drafts: QueueDraft[],
  fallbacks: LensFallback[],
  lockedTitleCategory: QueueCategory
): QueueDraft[] {
  const seenLenses = new Set<string>();
  const deduped: QueueDraft[] = [];

  for (const draft of drafts) {
    if (draft.category !== "other" && seenLenses.has(draft.category)) {
      continue;
    }
    if (draft.category !== "other") {
      seenLenses.add(draft.category);
    }
    // The locked-title lens's title must stay literal even though every
    // other lens's title is free for the model to customize - otherwise a
    // custom title would silently break threads.ts's exact-title lookup and
    // the wrong thread would end up active.
    if (draft.category === lockedTitleCategory) {
      deduped.push({ ...draft, title: "Workflow mapping" });
      continue;
    }
    deduped.push(draft);
  }

  for (const lens of fallbacks) {
    if (!seenLenses.has(lens.category)) {
      deduped.push({
        title: lens.title,
        priority: lens.priority,
        whyItMatters: lens.whyItMatters,
        category: lens.category,
      });
    }
  }

  return deduped;
}

/**
 * Deduplicates the model's proposed queue by lens category (keeping the
 * first, model-customized version of each) and backfills any of the 8 core
 * automation_discovery lenses / 9 core applied_ai_discovery lenses the model
 * didn't cover. No-op for every other meeting type - lens coverage is
 * specific to these two modes.
 */
function ensureLensCoverage(
  meetingType: MeetingType,
  drafts: QueueDraft[]
): { title: string; priority: ThreadPriority; whyItMatters: string }[] {
  let covered: QueueDraft[];
  if (meetingType === "automation_discovery") {
    covered = applyLensCoverage(drafts, AUTOMATION_DISCOVERY_LENS_FALLBACKS, "workflow_mapping");
  } else if (meetingType === "applied_ai_discovery") {
    covered = applyLensCoverage(drafts, APPLIED_AI_DISCOVERY_LENS_FALLBACKS, "current_process_shape");
  } else {
    covered = drafts;
  }
  return covered.map(({ title, priority, whyItMatters }) => ({ title, priority, whyItMatters }));
}

const SetupAnalystOutputSchema = z.object({
  brief_summary: z
    .string()
    .describe(
      "2-4 sentences on what this discovery meeting is really about and what's genuinely unknown, written for the facilitator to skim right before walking in."
    ),
  suggested_opening: z
    .string()
    .describe(
      "A natural, specific line or question the facilitator could actually say to open the conversation, grounded in this meeting's real context - not generic small talk like 'thanks for joining'."
    ),
  recommended_focus: z
    .string()
    .describe("1-2 sentences on where the facilitator should spend most of their time in this meeting, and why."),
  must_learn: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe(
      "The specific, concrete unknowns that must be resolved in this meeting for it to be worthwhile. Not generic discovery questions - grounded in this meeting's actual subject matter."
    ),
  initial_hypotheses: z
    .array(
      z.object({
        statement: z.string(),
        confidence_level: z.enum(CONFIDENCE_LEVELS),
      })
    )
    .min(2)
    .max(6)
    .describe(
      "Your own tentative explanations or predictions about how the workflow/system actually works, clearly framed as unconfirmed - not facts. If a tentative build direction was given, include at least one hypothesis that directly challenges or complicates it (e.g. naming a competing bottleneck)."
    ),
  assumptions_to_validate: z
    .array(z.string())
    .max(6)
    .describe(
      "Assumptions the team appears to be making beyond what they explicitly listed, that should be checked in this meeting. Empty array if you don't see any beyond what's already recorded."
    ),
  risk_focus: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Specific risks to watch for in this meeting - things that would be costly to get wrong or overlook."),
  initial_queue: z
    .array(
      z.object({
        title: z.string(),
        priority: z.enum(THREAD_PRIORITIES),
        why_it_matters: z.string(),
        category: z
          .enum(QUEUE_CATEGORY_KEYS)
          .describe(
            "Which core discovery lens this thread best represents. For automation_discovery: workflow_mapping, decision_rules, failure_handling, data_availability, systems_and_tools, compliance_approval, reviewer_ownership, or success_metrics. For applied_ai_discovery: current_process_shape (the workflow-mapping equivalent), workflow_pain, task_intervention_type, data_readiness, rule_clarity, human_review_need, risk_and_constraints, integration_and_implementation_surface, or success_metric. Use 'other' only if it genuinely doesn't fit any lens relevant to this meeting's own type - for a context-specific thread that's really a flavor of one of them (e.g. a thread about state-specific rule variation is decision_rules), tag it with that lens rather than 'other'."
          ),
      })
    )
    .min(3)
    .max(10)
    .describe(
      "Discovery threads to seed the live HUD's starting queue - concrete topics to explore in conversation, not a project plan or feature list. Include 'Workflow mapping' as one of them when this meeting is about understanding an existing process. For automation_discovery meetings, the app guarantees all 8 core lenses end up covered even if you omit some here; for applied_ai_discovery meetings, the app guarantees all 9 core lenses end up covered - either way, don't force an irrelevant one just to fill space, focus on what's actually relevant to this meeting's context."
    ),
  build_direction_warning: z
    .string()
    .nullable()
    .describe(
      "If a tentative build direction was given, a direct, specific warning about what could make that direction wrong or premature - name the competing hypothesis or unresolved unknown that would undercut it. Null only if no tentative build direction was provided."
    ),
  applied_ai_brief: z
    .object({
      suspected_workflow_pain: z
        .array(z.string())
        .min(1)
        .max(6)
        .describe("What seems slow, repetitive, delayed, error-prone, expensive, frustrating, or inconsistent about this workflow, based only on what was actually given - not invented."),
      likely_task_intervention_types: z
        .array(z.string())
        .min(1)
        .max(4)
        .describe("Your best guess at the kind of work this is: classification, summarization, routing, extraction, validation, generation, research, prediction, coordination, monitoring, or decision support. Framed as a guess to validate, not a conclusion."),
      data_readiness_questions: z
        .array(z.string())
        .min(2)
        .max(6)
        .describe("Concrete questions to ask about what data exists, where it lives, whether it's structured/unstructured/mixed, whether it's reliable, whether it's sensitive, and whether enough historical data exists."),
      risk_constraint_questions: z
        .array(z.string())
        .min(2)
        .max(6)
        .describe("Concrete questions about privacy, security, compliance, legal, customer impact, financial impact, operational risk, brand risk, and stakeholder trust."),
      human_review_questions: z
        .array(z.string())
        .min(2)
        .max(6)
        .describe("Concrete questions about what must stay human-approved, what errors would be unacceptable, where confidence is required, and what AI should only suggest rather than decide."),
      implementation_readiness_questions: z
        .array(z.string())
        .min(2)
        .max(6)
        .describe("Concrete questions about which systems would need to be read from or written to, and whether a manual-assist v1 (checklist, prompt, report, triage helper, review assistant) is possible before any real integration."),
      smallest_useful_experiment_hypothesis: z
        .string()
        .describe("A tentative hypothesis (not a plan, not a commitment) for the safest small test that could validate or invalidate this opportunity before building anything real."),
      no_build_not_ready_risk: z
        .string()
        .describe("A direct, honest statement of what would make this a 'not ready' or 'no-build' case - named specifically, not generic caution. Never soften this into a guarantee that a build will happen."),
      patterns_to_validate: z
        .array(z.string())
        .min(2)
        .max(6)
        .describe(
          "Applied AI patterns (by name, from the pattern library given below) worth validating in this meeting - framed explicitly as hypotheses to go test in conversation, never as recommendations or conclusions. Must include at least one non-AI/no-build or process-fix pattern alongside any AI patterns - never a list of only AI patterns. If the setup context is thin, keep this generic (e.g. intake triage assistant, completeness checker, human-in-the-loop review queue, reporting/visibility layer, no-build process fix) rather than guessing specifics you don't have evidence for."
        ),
    })
    .nullable()
    .describe(
      "Only populate when meeting_type is applied_ai_discovery - null for every other meeting type. Every field must be grounded in what was actually given (goal/current understanding/tentative build direction/assumptions/risks/pasted context); where the meeting doesn't yet say enough to answer a question, phrase it as a question to ask rather than inventing an answer. Written so it reads naturally for an internal AI Labs review, a freelance discovery call, or a client-facing applied AI consulting engagement - never internal-only language."
    ),
});

export interface SetupAnalystResult {
  briefSummary: string;
  suggestedOpening: string;
  recommendedFocus: string;
  mustLearn: string[];
  initialHypotheses: { statement: string; confidenceLevel: ConfidenceLevel }[];
  assumptionsToValidate: string[];
  riskFocus: string[];
  initialQueue: { title: string; priority: ThreadPriority; whyItMatters: string }[];
  buildDirectionWarning: string | null;
  appliedAiBrief: AppliedAiBrief | null;
}

// Sprint 26 Part E: short name+description reference so the model picks
// patterns_to_validate from the library's real names (lib/patterns/
// appliedAiPatterns.ts) instead of inventing pattern names ad hoc.
const PATTERN_LIBRARY_SUMMARY = APPLIED_AI_PATTERNS.map((p) => `- ${p.name}: ${p.shortDescription}`).join("\n");

const SYSTEM_PROMPT = `You are the Setup Analyst inside DiscoveryOS, a live product discovery HUD. You run once, before a discovery meeting starts, to prepare the facilitator's pre-meeting brief. Act like a senior applied AI PM who has been handed this meeting's setup notes and has fifteen minutes to prepare before walking in.

Ground rules:
- The facilitator's "tentative build direction" (if given) is a hypothesis, not a fact. Your job is to help them walk in ready to validate, weaken, or change it - never restate it as settled, and never write the brief as if the direction is already decided.
- Produce discovery focus areas for a conversation, not a project plan, a spec, or a list of features to build.
- Prefer specific, concrete unknowns grounded in this meeting's actual context over generic discovery questions that could apply to any meeting.
- Keep facts, assumptions, hypotheses, risks, and unknowns conceptually distinct:
  - facts: what's actually known or stated already
  - assumptions: things being taken for granted that haven't been checked
  - hypotheses: your own tentative explanations or predictions, clearly framed as unconfirmed
  - risks: what's costly if wrong or missed
  - unknowns: what genuinely isn't known yet and needs to be asked
- Confidence is always ordinal: "unclear", "emerging", "likely", or "confirmed". Never use a percentage or numeric score anywhere in your output.
- Avoid generic meeting fluff ("build rapport", "align on goals", "set expectations") - every section should be specific to this meeting's actual subject matter, not boilerplate that could apply to any discovery call.

When meeting_type is automation_discovery, prioritize these 8 lenses across your must-learn items, hypotheses, and initial queue: workflow mapping (the current process end to end), decision rules and routing logic, failure handling, data availability (is the information needed for a decision actually available at the point it's needed), systems/tools involved, compliance approval and risk, reviewer/ownership determination, and success metrics. Classification/document-typing is rarely the real bottleneck, so don't default to it as the primary focus unless the context specifically points there.

The "initial_queue" you generate becomes the live HUD's starting discovery thread queue - each item must be something the facilitator can actually go explore in conversation, not an abstract category. Tag each item with the lens category it best represents (see the schema). You don't need to force a thread for every lens - the app automatically adds a fallback thread for any of the 8 core automation_discovery lenses you don't cover, so it's safe to skip lenses that are clearly irrelevant to this specific meeting rather than padding the queue with filler. Where a lens genuinely matters here, prefer writing your own specific, context-flavored version of it (e.g. "Decision rules for state-specific filing requirements" tagged decision_rules) over a generic title - your version is always used over the fallback when you tag it correctly. Exception: if you include a workflow_mapping-tagged item, its title is always normalized to exactly "Workflow mapping" regardless of what you write (it needs a stable, predictable title so the live HUD can reliably open on it) - so don't bother customizing that one's title, but do still write a specific why_it_matters for it.

When meeting_type is applied_ai_discovery, this meeting is assessing whether a workflow or process is a good candidate for AI assist, rules automation, workflow redesign, reporting/visibility, human process change, not-ready, or no-build - NEVER assume AI is the answer, and never write as if a build is already decided. This mode is used for internal AI Labs work, freelance discovery calls, applied AI consulting, and process-improvement interviews alike - write in language that works for any of those, never internal-only phrasing ("our team", "the Labs backlog"). Ground your must-learn items, hypotheses, and initial queue in the applied AI opportunity lens's 9 core dimensions (current process shape - the workflow-mapping equivalent, workflow pain, task/intervention type, data readiness, rule clarity, human review need, risk and constraints, integration/implementation surface, and success metric) rather than jumping straight to a build recommendation. You must also populate "applied_ai_brief" (see its schema description) for this meeting type only - every part of it stays a hypothesis or a question to ask, never a settled fact, and it must explicitly be able to conclude "not ready" or "no-build" when the evidence given doesn't yet support anything more.

For "applied_ai_brief"'s "patterns_to_validate", choose from this pattern library (full details live in lib/patterns/appliedAiPatterns.ts - this is just the short reference):
${PATTERN_LIBRARY_SUMMARY}
Present these strictly as hypotheses worth going to validate in the meeting, never as a recommendation or a claim that any of them will actually be built - keep newer patterns like tool-using agents or voice/conversation agents in view only when the setup context specifically points there, never as a default, and never suggest either one just because it sounds current. Always include at least one non-AI/no-build or process-fix pattern (e.g. reporting/visibility layer, no-build process fix) alongside any AI patterns - a thin setup context should produce a short, generic list rather than a guessed specific one.`;

function buildUserPrompt(
  meeting: Meeting,
  assumptions: Assumption[],
  contextItems: MeetingContextItem[]
): string {
  const assumptionLines =
    assumptions.map((a) => `- (${a.confidence_level}) ${a.text}`).join("\n") || "- none recorded";
  const risks = (meeting.risks_unknowns ?? []) as string[];
  const riskLines = risks.map((r) => `- ${r}`).join("\n") || "- none recorded";
  const contextBlock = contextItems.map((c) => c.content).join("\n\n") || "(none pasted)";

  return `Meeting setup:
- Name: ${meeting.name}
- Company: ${meeting.company ?? "n/a"}
- Meeting type: ${meeting.meeting_type}
- Discovery strategy: ${meeting.discovery_strategy ?? "n/a"}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding going in: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction (a hypothesis to challenge, not a fact - do not treat as settled): ${meeting.tentative_build_direction ?? "none given"}

Recorded risks/unknowns:
${riskLines}

Recorded assumptions:
${assumptionLines}

Pasted context:
${contextBlock}

Prepare the pre-meeting brief for this meeting and return the structured result.`;
}

async function callSetupAnalyst(
  meeting: Meeting,
  assumptions: Assumption[],
  contextItems: MeetingContextItem[]
): Promise<SetupAnalystResult> {
  const model = process.env.OPENAI_SETUP_ANALYST_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(
    "setup_analyst",
    { meetingId: meeting.id, meetingType: meeting.meeting_type, model },
    meeting.id
  );

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "setup_brief",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserPrompt(meeting, assumptions, contextItems) },
            ],
            response_format: zodResponseFormat(SetupAnalystOutputSchema, "setup_analyst_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const result: SetupAnalystResult = {
      briefSummary: parsed.brief_summary,
      suggestedOpening: parsed.suggested_opening,
      recommendedFocus: parsed.recommended_focus,
      mustLearn: parsed.must_learn,
      initialHypotheses: parsed.initial_hypotheses.map((h) => ({
        statement: h.statement,
        confidenceLevel: h.confidence_level,
      })),
      assumptionsToValidate: parsed.assumptions_to_validate,
      riskFocus: parsed.risk_focus,
      initialQueue: ensureLensCoverage(
        meeting.meeting_type,
        parsed.initial_queue.map((q) => ({
          title: q.title,
          priority: q.priority,
          whyItMatters: q.why_it_matters,
          category: q.category,
        }))
      ),
      buildDirectionWarning: parsed.build_direction_warning,
      appliedAiBrief:
        meeting.meeting_type === "applied_ai_discovery" && parsed.applied_ai_brief
          ? {
              suspectedWorkflowPain: parsed.applied_ai_brief.suspected_workflow_pain,
              likelyTaskInterventionTypes: parsed.applied_ai_brief.likely_task_intervention_types,
              dataReadinessQuestions: parsed.applied_ai_brief.data_readiness_questions,
              riskConstraintQuestions: parsed.applied_ai_brief.risk_constraint_questions,
              humanReviewQuestions: parsed.applied_ai_brief.human_review_questions,
              implementationReadinessQuestions: parsed.applied_ai_brief.implementation_readiness_questions,
              smallestUsefulExperimentHypothesis: parsed.applied_ai_brief.smallest_useful_experiment_hypothesis,
              noBuildNotReadyRisk: parsed.applied_ai_brief.no_build_not_ready_risk,
              patternsToValidate: parsed.applied_ai_brief.patterns_to_validate,
            }
          : null,
    };

    // Log the model's raw category tags (dropped from `result` since
    // DiscoveryThread has nowhere to persist them) so lens-tagging quality
    // can be checked later without re-running the call.
    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), {
      ...result,
      rawInitialQueue: parsed.initial_queue,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup analyst failed";
    const failureInfo = describeAiCallFailureForLog(err, "setup_brief");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

export interface PreMeetingBriefView {
  brief: PreMeetingBrief | null;
  hypotheses: Hypothesis[];
  assumptions: Assumption[];
  initialQueue: DiscoveryThread[];
}

export async function getPreMeetingBriefView(meetingId: string): Promise<PreMeetingBriefView> {
  const [brief, hypotheses, assumptions, initialQueue] = await Promise.all([
    getLatestPreMeetingBrief(meetingId),
    getHypothesesForMeeting(meetingId),
    getAssumptionsForMeeting(meetingId),
    getQueuedThreads(meetingId),
  ]);

  return { brief, hypotheses, assumptions, initialQueue };
}

/**
 * Generates (or regenerates) the pre-meeting brief: calls the Setup
 * Analyst, persists a new pre_meeting_briefs row, and reconciles
 * hypotheses/assumptions/initial queue against what's already there.
 * Regenerating never deletes history - see reconcileHypotheses and
 * reconcileInitialQueue for the update-in-place-or-insert behavior.
 */
export async function generatePreMeetingBrief(meetingId: string): Promise<PreMeetingBriefView> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const analystResult = await callSetupAnalyst(details.meeting, details.assumptions, details.contextItems);

  const brief = await createPreMeetingBrief({
    meetingId,
    briefSummary: analystResult.briefSummary,
    suggestedOpening: analystResult.suggestedOpening,
    recommendedFocus: analystResult.recommendedFocus,
    mustLearn: analystResult.mustLearn,
    riskFocus: analystResult.riskFocus,
    buildDirectionWarning: analystResult.buildDirectionWarning,
    appliedAiBrief: analystResult.appliedAiBrief,
  });

  await reconcileHypotheses(meetingId, analystResult.initialHypotheses);
  await addSuggestedAssumptions(meetingId, analystResult.assumptionsToValidate);
  await reconcileInitialQueue(meetingId, analystResult.initialQueue);

  await logUserAction(meetingId, "pre_meeting_brief_generated", { briefId: brief.id });

  return getPreMeetingBriefView(meetingId);
}

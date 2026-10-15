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
import type { ConversationContextForFastLoop } from "@/lib/ai/conversationStateAnalyzerService";
import type { Assumption, ConfidenceLevel, DiscoveryThread, Meeting } from "@/lib/types/database";

// The model is unreliable at self-grading the final ordinal level directly -
// it tends to call things "likely" as soon as the conversation sounds
// fluent, even when most coverage items are still unknown. So instead of
// asking for the ordinal, we ask for a per-item true/false coverage
// assessment (a narrower, easier judgment) and compute the ordinal
// ourselves in code from the count. This keeps the "likely" bar mechanical
// and consistent instead of vibes-based.
const NOT_MADE_TRUE_BY =
  "A new approval/review branch (e.g. Legal approval) does NOT make this true by itself, and neither does a statement about what's 'easy' or 'hard' - only its own explicit, concrete evidence does.";

const CoverageSchema = z.object({
  trigger: z
    .boolean()
    .describe(`True only if the transcript explains what starts the workflow. ${NOT_MADE_TRUE_BY}`),
  happy_path: z
    .boolean()
    .describe("True only if the normal sequence is described beyond one vague step."),
  main_actors: z
    .boolean()
    .describe("True if teams/roles like Finance, Operations, or Legal are named - not vague terms like 'someone' or 'the team'."),
  decision_points: z
    .boolean()
    .describe("True if routing branches or approval conditions are described."),
  systems: z
    .boolean()
    .describe(
      `True only if a specific system, tool, form, inbox, queue platform, or data source is named. Naming a state, a rule, or a policy in the abstract is NOT a system. ${NOT_MADE_TRUE_BY}`
    ),
  exceptions: z
    .boolean()
    .describe(
      `True only if an exception path or non-standard handling path is described - not merely because multiple branches or an approval step exist. ${NOT_MADE_TRUE_BY}`
    ),
  handoffs: z
    .boolean()
    .describe("True if work moves between actors or teams, such as Finance, Operations, or Legal."),
  failure_handling: z
    .boolean()
    .describe(
      `True only if the transcript explains how failures are detected, corrected, escalated, or owned. ${NOT_MADE_TRUE_BY}`
    ),
});

const FastLoopResultSchema = z.object({
  coverage: CoverageSchema,
  build_hypothesis_note: z
    .string()
    .nullable()
    .describe(
      "If this chunk reveals that a previously tentative build hypothesis is wrong or should be weakened (e.g. the speaker says a step assumed to be hard is actually easy, or names a different step as the real hard part), briefly note which assumption is weakened and why, in one sentence. This is for the internal run log only, not shown to the user yet. Null if nothing changed."
    ),
  directions: z
    .array(
      z.object({
        title: z.string(),
        questions: z.array(z.string()).min(1).max(2),
        reason: z
          .string()
          .describe(
            "One short, specific sentence explaining why this direction matters right now. Name the actual unresolved item (the specific coverage gap, decision, actor, or risk this direction targets) and, where relevant, what goes wrong if it stays unanswered (e.g. 'If the state-rule criteria aren't documented, the routing decision depends on one person's judgment call'). Shown to the facilitator as 'Why this matters'. Never use a generic, could-apply-to-any-meeting phrase like 'to gather more information', 'to better understand the process', 'to explore this further', or 'to clarify the workflow' - if the sentence would still make sense with the topic swapped out, rewrite it."
          ),
      })
    )
    .min(1)
    .max(3),
});

export type CoverageAssessment = z.infer<typeof CoverageSchema>;

export interface DirectionDraft {
  title: string;
  questions: string[];
  reason: string;
}

export interface FastLoopResult {
  understandingLevel: ConfidenceLevel;
  directions: DirectionDraft[];
}

const LIKELY_THRESHOLD = 5;
const CONFIRMED_THRESHOLD = 8;

function deriveUnderstandingLevel(coverage: CoverageAssessment): ConfidenceLevel {
  const coveredCount = Object.values(coverage).filter(Boolean).length;
  if (coveredCount >= CONFIRMED_THRESHOLD) return "confirmed";
  if (coveredCount >= LIKELY_THRESHOLD) return "likely";
  if (coveredCount >= 1) return "emerging";
  return "unclear";
}

interface AnalyzeTranscriptChunkInput {
  meeting: Meeting;
  assumptions: Assumption[];
  activeThread: DiscoveryThread;
  /** All transcript chunks heard for this thread so far, oldest to newest. The last entry is the newest chunk. */
  transcriptChunks: string[];
  /** Sprint 15: output of the separate conversation-state analyzer (facilitator's latest question/hypothesis, stakeholder's latest answer, topic signals) - advisory context only, null when unavailable/failed (fail-soft, see transcriptAnalysis.ts). */
  conversationContext?: ConversationContextForFastLoop | null;
}

const SYSTEM_PROMPT = `You are the fast-loop analyst inside DiscoveryOS, a live product discovery HUD used by a facilitator while they are actively interviewing a stakeholder. You receive the transcript heard so far for one discovery thread and must react immediately, in the middle of a live conversation.

Your job on every call:
1. Assess coverage of the workflow, item by item (see rubric below). Base this on everything heard for this thread so far (all chunks combined), not just the newest chunk in isolation. You do NOT decide the overall understanding level yourself - that is computed from your per-item answers, so answer each item honestly and independently rather than trying to make the overall picture look more or less complete.
2. Propose at most 3 next question directions - the sharpest angles the facilitator should probe right now to deepen understanding of this thread.
   - Prioritize coverage items that are still false. Do not propose a direction that is mainly about an item that is already true (e.g. re-walking a happy path that's already been described) unless the newest chunk added a genuinely new, unresolved twist within it.
   - For workflow mechanics in general, bias hard toward concrete specifics over abstract classification: the happy path end to end, routing/decision logic (what determines the next step, and whether it's a written rule or a judgment call), and the systems/tools/queues actually involved.
   - If the newest chunk introduces Legal, compliance, approval, audit, state/regulatory requirements, or any review/sign-off step, treat it as a compliance-sensitive approval branch and make it the primary focus of your directions instead of generic happy-path or handoff questions:
     - Ask how the team knows a given case needs that approval/review (the trigger for the branch).
     - Ask whether the criteria are documented policy or require someone's judgment.
     - Ask what happens if that required approval/review is missed or skipped - this is the failure-risk question, and it must be specific to the approval being missed, not a generic "what if something goes wrong" question.
     - Give directions specific, named titles (e.g. "Clarify Legal approval criteria", "Test compliance failure risk"), not generic labels like "handoff mechanisms" or "failure handling".
     - Don't over-anchor on the specific reviewer named so far (e.g. "Legal") if the transcript's real open question is broader - see the build-hypothesis correction rule below for when to widen from a specific reviewer to "who reviews it" in general.
   - If the newest chunk describes something going wrong after the fact - wrong routing, a delayed discovery, a filing or deadline delay, rework, late detection, or someone noticing an issue days later - treat that as a live failure-handling signal and make it the primary focus of your directions. Prioritize it over re-asking about an earlier branch (e.g. Legal approval criteria) that's already been covered, UNLESS this newest chunk specifically adds new information about that earlier branch:
     - Ask how the team usually notices the problem - a system alert, or only discovered manually.
     - Ask who owns fixing it once it's noticed.
     - Ask about the downstream consequence (e.g. what happens when a deadline is missed) and how often this happens.
     - Give directions specific, named titles for the failure itself (e.g. "Clarify delayed failure detection", "Clarify failure ownership", "Explore filing-delay consequences"), not a repeat of an earlier branch's direction.
   - Build-hypothesis correction: if the newest chunk says something like "classification is easy", "that's not the hard part", "the hard part is...", or otherwise revises what's actually difficult, treat that as a correction to a previously assumed build hypothesis:
     - Immediately stop proposing classification-related directions (how documents are typed/identified) - the speaker just told you that isn't the hard part, so don't spend a direction slot re-confirming it.
     - Redirect your 3 directions to whatever was just named as the real hard part instead.
     - If the hard part is about which rule/policy applies (e.g. "which state rule applies"), prioritize: what makes that determination difficult, whether the applicable rules are documented somewhere or rely on the team's experience/judgment, and whether that information is available at the point the routing decision actually has to be made (or only becomes known later).
     - If the hard part is about who needs to review or handle it, prioritize reviewer determination directly - ask how someone knows who the right reviewer/owner is for a given case, not just whether a specific previously-named reviewer (like Legal) approved it. Widen the question beyond any one specific reviewer if the transcript implies the reviewer varies case by case.
     - Set build_hypothesis_note to a one-sentence internal note describing which assumption is now weakened (e.g. "classification-focused build direction is weakened - the real difficulty is rule interpretation and reviewer determination, not document typing"). This is logged internally only; do not surface it as a direction or question.
   - Once a routing or approval rule is named, push into what's still missing about it (exact criteria, documented vs. judgment, systems, failure risk) rather than re-asking whether the branch exists or re-describing the happy path.
   - If a "Conversation-state context" block is given below, use it to stay continuous with what's actually being discussed: if the facilitator just asked a question, propose directions that follow up on it rather than changing topic; if the stakeholder just answered or confirmed something, treat that as strengthening evidence and propose the natural next question on that same thread; if a topic signal names something mentioned earlier in a long segment that's still unresolved, it's fair game for a direction even if it wasn't the newest sentence. Treat a facilitator hypothesis in that block as the facilitator's own framing to test, never as something already true - do not phrase a direction as if the hypothesis were confirmed.
3. For each direction, write 1-2 questions the facilitator could ask verbatim in the very next breath of this same conversation. Ground them in the specific nouns and verbs actually said (the actual document, queue, team, approval, or decision mentioned) rather than generic phrasing.
4. For each direction, also write a one-sentence reason - "why this matters" - that names the specific risk or gap it addresses (e.g. "If the state rule isn't documented, the team may be relying on tribal knowledge that breaks when someone's out"), not a generic "to learn more about the process" filler.

Hard rules for questions:
- Never ask meta research-planning questions - nothing about who to talk to next, who would "yield the most insight", or how to structure future interviews. Ask about the work itself, not about how to study it.
- Prefer questions anchored to a concrete moment or specific branch ("what happens if X is missed", "how do you know Y is needed", "is that documented or a judgment call") over open-ended surveys of criteria ("what factors influence...", "what guidelines do you follow...").
- Ask direct, immediately-askable questions a facilitator could say out loud right now, not questions that describe or plan future analysis.
- Never describe a new or revised detail as a "contradiction" or flag it as an inconsistency. If the speaker adds to or corrects something they said earlier (e.g. "actually, ..."), just treat it as new information to explore further - do not call it out as conflicting. Contradiction detection is not part of this task.

Keep direction titles short (2-6 words, sentence case, specific to what was actually said - e.g. "Map the happy path", "Clarify routing logic", "Clarify Legal approval criteria") and questions natural and conversational.

--- Coverage rubric (workflow-mapping threads) ---
Assess these 8 items strictly and independently. Mark an item true ONLY if the transcript actually, specifically evidences it - never because it can be guessed, assumed, or because a related item is true. See each field's description for the exact bar.

A new branch or approval step (such as Legal needing to approve some cases) strengthens main_actors, decision_points, and handoffs, but it does NOT automatically make exceptions, systems, trigger, or failure_handling true - those still need their own explicit evidence. Statements about what's "easy," "hard," "the hard part," or similar difficulty commentary are meta-commentary about the task, not new factual evidence - they do not by themselves flip any coverage item true. When in doubt, mark false. It is normal and expected for most items to still be false after only a few chunks.

--- Applied AI Discovery mode (meeting_type "applied_ai_discovery") ---
This meeting is assessing whether a workflow is a good candidate for AI assist, rules automation, workflow redesign, reporting/visibility, human process change, not-ready, or no-build - never assume AI is the answer, and never phrase a direction as if a build is already decided. When meeting_type is applied_ai_discovery, prioritize directions on: workflow pain (what's actually slow/error-prone/costly), exception handling, decision rules (documented vs. judgment call), data availability/readiness, human review needs, risk/compliance/security/privacy, integration/system boundaries, success metrics, the smallest safe test to run before committing to anything bigger, who would own implementation, and - explicitly - whether AI is actually needed here versus a simpler fix. Example directions in this mode: "Clarify whether the hard part is classification, exception handling, or missing information," "Ask what data the team already trusts," "Find out where human approval is required," "Ask what would make this unsafe to automate," "Separate AI-assist opportunity from workflow redesign opportunity," "Validate whether a checklist/reporting fix would solve the problem before AI." All other rules above (max 3 directions, 1-2 questions each, no meta research-planning questions, ground everything in what was actually said) still apply unchanged - this section only changes what you prioritize, not the format or the limits.

Sprint 26 pattern-fit awareness (still applied_ai_discovery only): as you weigh directions, keep in mind whether the conversation is giving you evidence for common applied-AI patterns such as intake triage, completeness checking, structured extraction, knowledge/RAG assistance, review/QA, human-in-the-loop review, rules automation, reporting/visibility, or a no-build process fix - but don't name these patterns in a direction's title or question unless doing so is actually clarifying to the facilitator; most of the time, just ask the validation question the pattern implies. Never suggest a tool-using agent or a voice/conversation agent direction unless the transcript has already made the relevant data, actions, permissions, and human-review boundaries explicit - these are never default suggestions. Prefer a validation question ("what would make this unsafe to hand off?", "is there a documented rule here or is it a judgment call?") over any claim that a specific pattern or solution will work.`;

function buildConversationContextBlock(context: ConversationContextForFastLoop | null | undefined): string {
  if (!context) return "";

  const lines: string[] = [];
  if (context.facilitatorLatestQuestion) {
    lines.push(`- Facilitator's latest question: "${context.facilitatorLatestQuestion}"`);
  }
  if (context.facilitatorLatestHypothesis) {
    lines.push(
      `- Facilitator's latest hypothesis (their own framing, NOT a confirmed fact): "${context.facilitatorLatestHypothesis}"`
    );
  }
  if (context.stakeholderLatestAnswerExcerpt) {
    lines.push(`- Stakeholder's latest answer/confirmation: "${context.stakeholderLatestAnswerExcerpt}"`);
  }
  if (context.topicSignals.length > 0) {
    lines.push(
      `- Topic signals noticed in the newest segment: ${context.topicSignals
        .map((s) => `${s.label} (${s.category}, from ${s.source})`)
        .join("; ")}`
    );
  }
  if (context.mentionedNotExplored.length > 0) {
    lines.push(`- Mentioned but not yet fully explored: ${context.mentionedNotExplored.join("; ")}`);
  }

  if (lines.length === 0) return "";

  return `\n\nConversation-state context (from a separate lightweight analyzer - advisory only, use it to stay continuous with the actual conversation, never as ground truth about the workflow itself):\n${lines.join("\n")}`;
}

function buildUserPrompt(input: AnalyzeTranscriptChunkInput): string {
  const { meeting, assumptions, activeThread, transcriptChunks, conversationContext } = input;

  const assumptionLines = assumptions
    .map((a) => `- (${a.confidence_level}) ${a.text}`)
    .join("\n");

  const priorChunks = transcriptChunks.slice(0, -1);
  const newestChunk = transcriptChunks[transcriptChunks.length - 1];

  const priorChunksBlock =
    priorChunks.length > 0
      ? priorChunks.map((chunk, i) => `${i + 1}. ${chunk}`).join("\n")
      : "(none - this is the first chunk heard for this thread)";

  return `Meeting context:
- Meeting type: ${meeting.meeting_type}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding so far: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction: ${meeting.tentative_build_direction ?? "n/a"}
- Known assumptions:
${assumptionLines || "- none recorded"}

Active discovery thread:
- Title: ${activeThread.title}
- Current confidence level: ${activeThread.confidence_level}

Transcript heard so far for this thread (oldest to newest):
${priorChunksBlock}

Newest chunk just heard:
"""
${newestChunk}
"""${buildConversationContextBlock(conversationContext)}

Assess coverage using ALL of the transcript above (prior chunks plus the newest one combined), and propose question directions that build on what's still missing. Return the structured result.`;
}

export async function analyzeTranscriptChunk(
  input: AnalyzeTranscriptChunkInput
): Promise<FastLoopResult> {
  const { meeting, activeThread, transcriptChunks } = input;

  const model = process.env.OPENAI_FAST_LOOP_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(
    "fast_loop_analysis",
    {
      meetingId: meeting.id,
      threadId: activeThread.id,
      chunkCount: transcriptChunks.length,
      newestChunk: transcriptChunks[transcriptChunks.length - 1],
      model,
    },
    meeting.id
  );

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "fast_loop",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserPrompt(input) },
            ],
            response_format: zodResponseFormat(FastLoopResultSchema, "fast_loop_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const result: FastLoopResult = {
      understandingLevel: deriveUnderstandingLevel(parsed.coverage),
      directions: parsed.directions,
    };

    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), {
      ...result,
      coverage: parsed.coverage,
      buildHypothesisNote: parsed.build_hypothesis_note,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fast loop analysis failed";
    const failureInfo = describeAiCallFailureForLog(err, "fast_loop");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

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
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import {
  getAllThreadsForMeeting,
  createQueuedThread,
  updateThreadFields,
} from "@/lib/services/threads";
import { reconcileConversationEvents, type ConversationEventDraft } from "@/lib/services/conversationEvents";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  ConversationEventConfidence,
  ConversationEventType,
  DiscoveryThread,
  Meeting,
  ThreadPriority,
  TranscriptSegment,
} from "@/lib/types/database";

const UTTERANCE_ROLES = [
  "facilitator_question",
  "facilitator_hypothesis",
  "facilitator_focus_shift",
  "stakeholder_process_fact",
  "stakeholder_uncertainty",
  "stakeholder_exception",
  "stakeholder_confirmation",
  "stakeholder_correction",
  "mixed_unknown",
] as const;

const LOCAL_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

const TOPIC_CATEGORIES = [
  "approval",
  "ownership",
  "systems",
  "data_quality",
  "failure_handling",
  "exception",
  "timing",
  "handoff",
  "business_impact",
  "success_metric",
  "build_direction",
  "other",
] as const;

const SOURCE_ROLES = ["facilitator", "stakeholder", "mixed", "unknown"] as const;

const UtteranceRoleSchema = z.object({
  text_excerpt: z
    .string()
    .describe("A short verbatim excerpt (a phrase to a sentence) from the transcript that this classification is about."),
  role: z.enum(UTTERANCE_ROLES),
  confidence: z.enum(LOCAL_CONFIDENCE_LEVELS),
  reasoning: z.string().describe("One short phrase naming why this excerpt got this role - e.g. 'phrased as a question directed at the stakeholder' or 'describes what the agent actually does'."),
});

const TopicSignalSchema = z.object({
  label: z
    .string()
    .describe("Short, user-friendly topic title fit for a Still-to-explore list item, e.g. 'Security review criteria', 'Missing request information'. Never a raw quote."),
  category: z.enum(TOPIC_CATEGORIES),
  source: z.enum(SOURCE_ROLES),
  evidence_excerpt: z
    .string()
    .nullable()
    .describe("A short verbatim substring from the transcript below supporting this topic, or null. Never invented - an excerpt that isn't real text will be dropped."),
  should_add_to_still_to_explore: z.boolean(),
  should_focus_now: z
    .boolean()
    .describe("True only for a small number of clearly high-priority signals directly relevant to what's being discussed right now (e.g. a compliance/approval risk, or exactly what the facilitator just asked about). Almost always false."),
  reason: z.string().describe("One short, specific sentence - never generic filler."),
});

const FacilitatorHypothesisSchema = z.object({
  hypothesis: z.string().describe("The facilitator's own hypothesis or reframing, restated plainly."),
  evidence_excerpt: z.string().nullable(),
  should_track: z
    .boolean()
    .describe("True if this hypothesis reframes the process/build-direction understanding enough to be worth watching for stakeholder confirmation later."),
  reason: z.string(),
});

const ConversationStateOutputSchema = z.object({
  utterance_roles: z.array(UtteranceRoleSchema),
  topic_signals: z.array(TopicSignalSchema),
  facilitator_hypotheses: z.array(FacilitatorHypothesisSchema),
});

type TopicSignal = z.infer<typeof TopicSignalSchema>;

export interface ConversationContextForFastLoop {
  facilitatorLatestQuestion: string | null;
  facilitatorLatestHypothesis: string | null;
  stakeholderLatestAnswerExcerpt: string | null;
  topicSignals: { label: string; category: string; source: string; reason: string }[];
  mentionedNotExplored: string[];
}

const SYSTEM_PROMPT = `You are the conversation-state analyst inside DiscoveryOS, a live product discovery HUD. You run alongside the fast loop and workflow extractor, on the most recent transcript segments, and classify WHO is likely speaking and WHY it matters - never to replace the workflow extractor's evidence-verified extraction, only to help the app tell facilitator intent apart from stakeholder evidence and keep "Still to explore" curated.

Critical framing rules - non-negotiable:
- A facilitator's own question, hypothesis, or focus-shifting remark is NEVER by itself evidence that a process fact is true. Only a stakeholder's own words (an answer, confirmation, description of what actually happens, correction) count as process evidence. If you are not confident who is speaking, use role "mixed_unknown" and set should_focus_now to false and should_add_to_still_to_explore conservatively - never force a strong classification you're not confident in.
- You are conservative by design: an empty or short topic_signals/facilitator_hypotheses array is the normal, correct result for filler-heavy or already-well-covered segments. Do not manufacture topics to fill the array.
- should_focus_now is rare. It means "this is worth bumping to the top of Still to explore right now" - reserve it for a genuinely high-priority signal (compliance/approval/security risk, or something the facilitator's own latest question is directly about), not every new topic.
- Never mark a topic should_add_to_still_to_explore if it's already well-covered by an existing thread, gap, ambiguity flag, or contradiction candidate listed below - check the existing lists first. It's fine (and common) to return should_add_to_still_to_explore: false for a topic that's merely a restatement of something already tracked.

How to tell facilitator from stakeholder:
- If the transcript uses explicit labels (e.g. "Facilitator:", "Interviewer:", "PM:" vs. "Stakeholder:", "Customer:", a named role), trust those directly.
- Otherwise, infer from phrasing: a sentence ending in "?" and addressed at the other party, or a hedged hypothesis ("maybe...", "I wonder if...", "could it be that...", "what if...", "it sounds like the opportunity is more about...") is facilitator-voice. A sentence describing what actually happens, confirming or correcting something, or answering a question is stakeholder-voice. When genuinely unclear, use "mixed_unknown" rather than guessing.

Topic signals - extract ALL distinct topics actually present in the segment(s) below, not just the most recent sentence. A single long stakeholder answer often names several distinct things worth separate follow-up (e.g. an intake field, an informal naming problem, a review step, and a queue delay, all in one breath) - list each as its own topic_signal rather than collapsing them into one, and rather than only capturing the last one mentioned. Prefer a "mentioned but not fully explored" framing (should_add_to_still_to_explore: true, should_focus_now: false) over silently dropping an earlier topic in a long segment.

Facilitator hypotheses - a hypothesis is the facilitator's own reframing of the problem (e.g. "maybe this is more of an X issue than a Y issue"). Track it (should_track: true) when it meaningfully reframes the process or build-direction understanding. Never claim it is confirmed - that determination belongs to whether the stakeholder's own later words support it, which is not this analyzer's job to decide. If a hypothesis also names a genuinely new discovery topic worth a Still-to-explore entry, ALSO emit a matching topic_signal for it (source: "facilitator") - facilitator_hypotheses alone never creates a Still-to-explore item.

Output an empty topic_signals/facilitator_hypotheses array whenever nothing meets the bar above - that is a common, correct result, not a failure.`;

function buildThreadsBlock(threads: DiscoveryThread[]): string {
  if (threads.length === 0) return "(none yet)";
  return threads.map((t) => `- [${t.status}] ${t.title}`).join("\n");
}

function buildWorkflowGapsBlock(workflow: WorkflowView | null): string {
  const gaps = workflow?.gaps ?? [];
  if (gaps.length === 0) return "(none yet)";
  return gaps.map((g) => `- [${g.gap_status}] ${g.label}`).join("\n");
}

function buildAmbiguityBlock(flags: AmbiguityFlag[]): string {
  if (flags.length === 0) return "(none yet)";
  return flags.map((f) => `- [${f.status}] ${f.label}`).join("\n");
}

function buildContradictionBlock(candidates: ContradictionCandidate[]): string {
  if (candidates.length === 0) return "(none yet)";
  return candidates.map((c) => `- [${c.status}] ${c.label}`).join("\n");
}

function buildUserPrompt(
  meeting: Meeting,
  activeThread: DiscoveryThread,
  allThreads: DiscoveryThread[],
  recentSegments: TranscriptSegment[],
  latestTranscriptSegmentId: string,
  workflow: WorkflowView | null,
  ambiguityFlags: AmbiguityFlag[],
  contradictionCandidates: ContradictionCandidate[]
): string {
  const transcriptBlock = recentSegments
    .map((segment, i) => {
      const marker = segment.id === latestTranscriptSegmentId ? " <- newest segment just heard" : "";
      return `${i + 1}. [id: ${segment.id}] ${segment.raw_text}${marker}`;
    })
    .join("\n");

  return `Meeting setup:
- Name: ${meeting.name}
- Goal: ${meeting.goal ?? "n/a"}
- Tentative build direction (a hypothesis, not a fact): ${meeting.tentative_build_direction ?? "none given"}

Active/focused discovery thread right now: "${activeThread.title}"

All discovery threads already tracked in this meeting (do not re-suggest a topic that's already one of these as-is):
${buildThreadsBlock(allThreads)}

Existing workflow gaps (already tracked, context only):
${buildWorkflowGapsBlock(workflow)}

Existing ambiguity flags / "Needs clarification" items (already tracked, context only):
${buildAmbiguityBlock(ambiguityFlags)}

Existing possible-mismatch candidates (already tracked, context only):
${buildContradictionBlock(contradictionCandidates)}

Recent transcript segments (oldest to newest, may include both facilitator and stakeholder turns):
${transcriptBlock}

Classify the utterances, extract topic signals, and track any facilitator hypotheses per the system prompt's rules. Return the structured result.`;
}

function normalizeForExcerptMatch(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\s+/g, " ");
}

/** Lighter-touch than the contradiction detector's hard evidence gate (discovery-thread suggestions are advisory, not asserted facts) - an unverifiable excerpt is nulled out, not treated as grounds to discard the whole signal. */
function verifyExcerpt(excerpt: string | null, segments: TranscriptSegment[]): string | null {
  if (!excerpt) return null;
  const normalizedExcerpt = normalizeForExcerptMatch(excerpt).toLowerCase();
  const found = segments.some((s) => normalizeForExcerptMatch(s.raw_text).toLowerCase().includes(normalizedExcerpt));
  return found ? excerpt : null;
}

function normalizeTitle(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(text: string): Set<string> {
  return new Set(normalizeTitle(text).split(" ").filter((token) => token.length > 2));
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / Math.min(a.size, b.size);
}

const FUZZY_THREAD_MATCH_THRESHOLD = 0.6;

function findMatchingThread(threads: DiscoveryThread[], label: string): DiscoveryThread | null {
  const normalizedLabel = normalizeTitle(label);
  const exact = threads.find((t) => normalizeTitle(t.title) === normalizedLabel);
  if (exact) return exact;

  const labelTokens = tokenize(label);
  let best: DiscoveryThread | null = null;
  let bestScore = FUZZY_THREAD_MATCH_THRESHOLD;
  for (const thread of threads) {
    const score = tokenOverlapRatio(labelTokens, tokenize(thread.title));
    if (score >= bestScore) {
      best = thread;
      bestScore = score;
    }
  }
  return best;
}

function sourceTag(source: TopicSignal["source"]): string {
  if (source === "facilitator") return "(From your question) ";
  if (source === "stakeholder") return "(From stakeholder mention) ";
  return "";
}

/**
 * Reconciles topic signals into discovery_threads - the ONLY path that
 * creates/updates Still-to-explore threads from conversation state
 * (facilitator_hypotheses never do this directly, see SYSTEM_PROMPT).
 * Never touches which thread is active/locked: a should_focus_now signal
 * only ever bumps a QUEUED thread's priority and moves it to the front of
 * the queue, so it's always safe regardless of focus-lock state.
 */
async function reconcileTopicSignalsIntoThreads(
  meetingId: string,
  allThreads: DiscoveryThread[],
  signals: TopicSignal[]
): Promise<void> {
  const toTrack = signals.filter((s) => s.should_add_to_still_to_explore);
  if (toTrack.length === 0) return;

  let frontSortOrder = Math.min(0, ...allThreads.map((t) => t.sort_order)) - 1;
  const threads = [...allThreads];

  for (const signal of toTrack) {
    const whyItMatters = `${sourceTag(signal.source)}${signal.reason}`;
    const match = findMatchingThread(threads, signal.label);

    if (match) {
      // Active/covered threads are live, user-driven state - a topic
      // signal must never rewrite or reopen them (mirrors
      // reconcileInitialQueue's own rule).
      if (match.status === "active" || match.status === "covered") continue;

      const patch: Parameters<typeof updateThreadFields>[1] = { why_it_matters: whyItMatters };
      if (signal.should_focus_now) {
        patch.priority = "high";
        patch.sort_order = frontSortOrder;
        frontSortOrder -= 1;
      }
      const updated = await updateThreadFields(match.id, patch);
      Object.assign(match, updated);
      continue;
    }

    const priority: ThreadPriority = signal.should_focus_now ? "high" : "medium";
    const created = await createQueuedThread(meetingId, signal.label, whyItMatters, {
      priority,
      status: "open",
    });

    if (signal.should_focus_now) {
      const updated = await updateThreadFields(created.id, { sort_order: frontSortOrder });
      frontSortOrder -= 1;
      threads.push(updated);
    } else {
      threads.push(created);
    }
  }
}

function utteranceRoleToEventType(role: (typeof UTTERANCE_ROLES)[number]): ConversationEventType | null {
  switch (role) {
    case "facilitator_question":
      return "facilitator_question";
    case "facilitator_hypothesis":
      return "facilitator_hypothesis";
    case "facilitator_focus_shift":
      return "facilitator_focus_shift";
    case "stakeholder_process_fact":
    case "stakeholder_confirmation":
      return "stakeholder_fact";
    case "stakeholder_uncertainty":
      return "stakeholder_uncertainty";
    case "stakeholder_exception":
      return "stakeholder_exception";
    case "stakeholder_correction":
      return "stakeholder_correction";
    case "mixed_unknown":
      return null;
  }
}

function confidenceFromRole(confidence: (typeof LOCAL_CONFIDENCE_LEVELS)[number]): ConversationEventConfidence {
  return confidence;
}

/**
 * Runs the conversation-state analyzer over the most recent transcript
 * segments and reconciles its output into discovery_threads (Still to
 * explore) and conversation_events. Called fail-soft from
 * transcriptAnalysis.ts, exactly like the workflow extractor/
 * contradiction detector - a failure here must never block the fast
 * loop, so this throws (rather than swallowing errors itself) and the
 * caller is responsible for catching it. No separate reasoning path for
 * live audio: this runs on whatever's accumulated in transcript_segments
 * regardless of how each segment was captured.
 */
export async function analyzeConversationState(
  meetingId: string,
  activeThread: DiscoveryThread,
  latestTranscriptSegmentId: string
): Promise<ConversationContextForFastLoop | null> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const [allThreads, orderedSegments, workflowView, ambiguityFlags, contradictionCandidates] = await Promise.all([
    getAllThreadsForMeeting(meetingId),
    getOrderedTranscriptSegmentsForMeeting(meetingId),
    getWorkflowView(meetingId),
    getAmbiguityFlagsForMeeting(meetingId),
    listContradictionCandidates(meetingId),
  ]);

  const recentSegments = orderedSegments.slice(-8);
  const model = process.env.OPENAI_CONVERSATION_STATE_MODEL ?? "gpt-4o-mini";

  const runLog = await startAiRunLog(
    "conversation_state_analyzer",
    {
      meetingId,
      activeThreadId: activeThread.id,
      latestTranscriptSegmentId,
      segmentCount: recentSegments.length,
      model,
    },
    meetingId
  );

  try {
    const client = await getOpenAiClient();

    const { data: completion, attempts } = await runAiCallOrThrow({
      kind: "conversation_state",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt(
                  details.meeting,
                  activeThread,
                  allThreads,
                  recentSegments,
                  latestTranscriptSegmentId,
                  workflowView,
                  ambiguityFlags,
                  contradictionCandidates
                ),
              },
            ],
            response_format: zodResponseFormat(ConversationStateOutputSchema, "conversation_state_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const verifiedTopicSignals = parsed.topic_signals.map((s) => ({
      ...s,
      evidence_excerpt: verifyExcerpt(s.evidence_excerpt, recentSegments),
    }));
    const verifiedHypotheses = parsed.facilitator_hypotheses.map((h) => ({
      ...h,
      evidence_excerpt: verifyExcerpt(h.evidence_excerpt, recentSegments),
    }));

    await reconcileTopicSignalsIntoThreads(meetingId, allThreads, verifiedTopicSignals);

    const events: ConversationEventDraft[] = [];

    for (const utterance of parsed.utterance_roles) {
      const eventType = utteranceRoleToEventType(utterance.role);
      if (!eventType) continue;
      events.push({
        transcriptSegmentId: latestTranscriptSegmentId,
        eventType,
        sourceRole: utterance.role.startsWith("facilitator") ? "facilitator" : "stakeholder",
        label: utterance.text_excerpt.slice(0, 120),
        description: utterance.reasoning,
        evidenceExcerpt: verifyExcerpt(utterance.text_excerpt, recentSegments),
        confidenceLevel: confidenceFromRole(utterance.confidence),
      });
    }

    for (const signal of verifiedTopicSignals) {
      if (!signal.should_add_to_still_to_explore && !signal.should_focus_now) continue;
      events.push({
        transcriptSegmentId: latestTranscriptSegmentId,
        eventType: signal.should_focus_now ? "topic_signal" : "glossed_over_topic",
        sourceRole: signal.source,
        label: signal.label,
        description: signal.reason,
        evidenceExcerpt: signal.evidence_excerpt,
        confidenceLevel: "medium",
      });
    }

    for (const hypothesis of verifiedHypotheses) {
      if (!hypothesis.should_track) continue;
      events.push({
        transcriptSegmentId: latestTranscriptSegmentId,
        eventType: "facilitator_hypothesis",
        sourceRole: "facilitator",
        label: hypothesis.hypothesis.slice(0, 120),
        description: hypothesis.reason,
        evidenceExcerpt: hypothesis.evidence_excerpt,
        confidenceLevel: "medium",
      });
    }

    // Persisting conversation_events is advisory/observability-only - the
    // thread reconciliation above (the part that actually changes what the
    // facilitator sees in Still to explore) and the fast-loop context below
    // are both more important than this log surviving. A failure here
    // (e.g. before migration 0014 is applied) is swallowed rather than
    // thrown, so it never prevents returning fastLoopContext.
    try {
      await reconcileConversationEvents(meetingId, events);
    } catch (err) {
      console.warn(
        `[conversation-state-analyzer] failed to persist conversation_events (non-fatal): ${err instanceof Error ? err.message : err}`
      );
    }

    const facilitatorQuestion = [...parsed.utterance_roles].reverse().find((u) => u.role === "facilitator_question");
    const facilitatorHypothesis = [...parsed.utterance_roles].reverse().find((u) => u.role === "facilitator_hypothesis");
    const stakeholderAnswer = [...parsed.utterance_roles]
      .reverse()
      .find((u) => u.role === "stakeholder_confirmation" || u.role === "stakeholder_process_fact");

    const fastLoopContext: ConversationContextForFastLoop = {
      facilitatorLatestQuestion: facilitatorQuestion?.text_excerpt ?? null,
      facilitatorLatestHypothesis: facilitatorHypothesis?.text_excerpt ?? null,
      stakeholderLatestAnswerExcerpt: stakeholderAnswer?.text_excerpt ?? null,
      topicSignals: verifiedTopicSignals.map((s) => ({
        label: s.label,
        category: s.category,
        source: s.source,
        reason: s.reason,
      })),
      mentionedNotExplored: verifiedTopicSignals
        .filter((s) => s.should_add_to_still_to_explore && !s.should_focus_now)
        .map((s) => s.label),
    };

    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), parsed);
    return fastLoopContext;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversation state analysis failed";
    const failureInfo = describeAiCallFailureForLog(err, "conversation_state");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

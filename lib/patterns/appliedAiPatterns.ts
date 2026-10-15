import type { AppliedAiRecommendationType } from "@/lib/lenses/appliedAiOpportunityLens";

/**
 * Sprint 26 Part A: the Applied AI pattern library - a reusable, typed list
 * of modern applied-AI implementation patterns, each with explicit fit and
 * not-fit criteria. Pure config, no AI calls and no behavior of its own.
 * Consumed by the deterministic pattern-fit scorer (lib/patterns/
 * patternFit.ts), the Applied AI opportunity assessment (Part C), the
 * Setup Analyst brief (Part E), and the fast-loop prompt (Part F).
 *
 * Product principle this file exists to enforce: keeping newer applied-AI
 * patterns (RAG, tool-using agents, voice agents) in view without chasing
 * hype. Agentic/tool-using/voice patterns are written with explicit,
 * narrow fit conditions and are never the default - non-AI patterns
 * (rules automation, reporting/visibility, no-build process fixes) are
 * first-class entries, not afterthoughts.
 */

export const APPLIED_AI_PATTERN_IDS = [
  "intake_triage_assistant",
  "completeness_checker",
  "structured_extraction",
  "summarization_assistant",
  "rag_knowledge_assistant",
  "draft_generation_assistant",
  "review_quality_assistant",
  "decision_support_copilot",
  "rules_automation",
  "workflow_orchestration",
  "tool_using_agent",
  "human_in_the_loop_review_queue",
  "monitoring_alerting_assistant",
  "multimodal_intake_assistant",
  "voice_conversation_agent",
  "reporting_visibility_layer",
  "no_build_process_fix",
] as const;

export type AppliedAiPatternId = (typeof APPLIED_AI_PATTERN_IDS)[number];

export interface AppliedAiPattern {
  id: AppliedAiPatternId;
  name: string;
  shortDescription: string;
  /** What kind of workflow/problem this pattern is genuinely good for. */
  bestFor: string[];
  /** Short descriptive signals to look for in discovery evidence - matched by lib/patterns/patternFit.ts, never by exact string. */
  signals: string[];
  /** What must actually be evidenced before this pattern is more than a guess. */
  requiredEvidence: string[];
  commonInputs: string[];
  commonOutputs: string[];
  /** The safest, smallest version of this pattern to try first. */
  goodFirstVersion: string[];
  /** Explicit conditions under which this pattern is the wrong answer. */
  notAFitWhen: string[];
  risks: string[];
  humanReviewNeeds: string[];
  /** Concrete discovery questions to validate this pattern. */
  exampleQuestions: string[];
  relatedRecommendationTypes: AppliedAiRecommendationType[];
}

export const APPLIED_AI_PATTERNS: AppliedAiPattern[] = [
  {
    id: "intake_triage_assistant",
    name: "Intake triage assistant",
    shortDescription:
      "AI drafts a category, owner, and priority for an incoming request, and flags what's missing - a human still routes it.",
    bestFor: [
      "Routing or classifying incoming requests, tickets, or cases",
      "Identifying missing information before work can proceed",
      "Suggesting an owner, priority, or category rather than deciding it outright",
    ],
    signals: [
      "requests arrive from multiple channels or in inconsistent formats",
      "a person manually determines category, owner, or priority for each incoming item",
      "routing decisions happen for every incoming request or ticket",
      "coordinator or triage role spends significant time on intake",
    ],
    requiredEvidence: [
      "A concrete description of what triggers intake (email, form, ticket, etc.)",
      "Who currently makes the category/owner/priority determination",
      "At least a rough sense of how varied incoming requests are",
    ],
    commonInputs: ["Incoming email, form submission, or ticket text", "Prior routing history, if available"],
    commonOutputs: ["Suggested category", "Suggested owner/team", "Suggested priority", "List of missing fields"],
    goodFirstVersion: [
      "Draft a triage recommendation (category/owner/priority) for a human to confirm before anything routes",
      "Run only on a narrow, low-risk request type first",
    ],
    notAFitWhen: [
      "Request types are highly unpredictable or one-off",
      "There is no consistent triage decision being made today - each case is handled ad hoc with no pattern",
      "The real bottleneck is downstream work, not the triage step itself",
    ],
    risks: [
      "Misrouting a sensitive or high-impact request",
      "Overconfidence in a suggested owner/priority for an edge case",
    ],
    humanReviewNeeds: [
      "A human should confirm category/owner/priority before the request actually moves, at least in early versions",
    ],
    exampleQuestions: [
      "How varied are the requests that come in - do they fall into a handful of predictable types?",
      "Who decides the category/owner/priority today, and how do they decide?",
      "What happens right now when a request is missing information?",
    ],
    relatedRecommendationTypes: ["ai_assist", "not_ready"],
  },
  {
    id: "completeness_checker",
    name: "Completeness checker",
    shortDescription:
      "AI checks whether a request, form, case, file, or handoff has the fields or materials it needs before it proceeds.",
    bestFor: [
      "Flagging missing required fields or attachments",
      "Catching incomplete handoffs before they cause delay",
      "Reducing back-and-forth chasing people for missing details",
    ],
    signals: [
      "requests or cases are frequently missing information",
      "back-and-forth communication is needed to collect missing details",
      "a handoff between teams sometimes lacks required materials",
      "delay is caused by chasing down missing fields or attachments",
    ],
    requiredEvidence: [
      "A concrete, nameable list of what 'complete' actually requires",
      "Evidence that incompleteness is a real, recurring cause of delay or rework",
    ],
    commonInputs: ["A request, form, case file, or handoff package"],
    commonOutputs: ["A checklist of what's present/missing", "A flag when required items are absent"],
    goodFirstVersion: [
      "A static or lightly AI-assisted checklist that flags missing fields - no auto-rejection, just a flag for a human to act on",
    ],
    notAFitWhen: [
      "What counts as 'complete' is itself undefined or constantly changing",
      "Missing information is rare, not a real recurring pain point",
    ],
    risks: ["Flagging something as complete when a subtler requirement was actually missing"],
    humanReviewNeeds: ["A human decides what to do about a flagged gap - this pattern flags, it doesn't reject or block on its own"],
    exampleQuestions: [
      "What specifically makes a request or case 'complete' versus not?",
      "How often is missing information actually the cause of delay?",
      "Who currently notices when something is missing, and how?",
    ],
    relatedRecommendationTypes: ["ai_assist", "rules_automation"],
  },
  {
    id: "structured_extraction",
    name: "Structured extraction",
    shortDescription: "Turns messy documents or messages into structured fields a downstream system or person can use.",
    bestFor: [
      "Turning free text, PDFs, or scanned documents into structured data",
      "Pulling specific fields out of inconsistent source material",
    ],
    signals: [
      "source material is unstructured or free text rather than fielded data",
      "documents or messages vary in format and require manual reading to find key details",
      "someone manually retypes or re-enters information from one document into another system",
    ],
    requiredEvidence: [
      "Concrete examples of the source documents/messages and the specific fields needed out of them",
      "Confirmation that the fields needed are actually present in the source material (even if messy)",
    ],
    commonInputs: ["Free-text documents, emails, PDFs, or forms"],
    commonOutputs: ["Structured fields (e.g. name, date, amount, category)"],
    goodFirstVersion: [
      "Extract fields for human review/correction before they're used downstream, on a small sample first",
    ],
    notAFitWhen: [
      "The needed fields aren't reliably present in the source material at all",
      "Volume is too low to justify anything beyond manual entry",
    ],
    risks: ["Silently extracting a wrong value with high-sounding confidence", "Missing a field that's present but phrased unusually"],
    humanReviewNeeds: ["Extracted fields should be reviewable/correctable, especially early on"],
    exampleQuestions: [
      "Can you show me a few real examples of the documents or messages involved?",
      "What specific fields do you actually need out of them?",
      "How consistently are those fields actually present in the source material?",
    ],
    relatedRecommendationTypes: ["ai_assist"],
  },
  {
    id: "summarization_assistant",
    name: "Summarization assistant",
    shortDescription: "Summarizes long cases, calls, tickets, documents, or research for faster review.",
    bestFor: ["Long case histories or tickets that are slow to read through", "Long calls, documents, or research that need a quick summary"],
    signals: [
      "someone spends significant time reading through long history before acting",
      "cases or tickets accumulate a long thread of notes or context",
      "a long document or call needs to be reviewed quickly",
    ],
    requiredEvidence: [
      "Confirmation that reading/reviewing long content is actually a real time cost",
      "A sense of what the summary needs to preserve (decisions, dates, open items, etc.)",
    ],
    commonInputs: ["Long transcripts, case histories, documents, or tickets"],
    commonOutputs: ["A short summary highlighting key facts, decisions, and open items"],
    goodFirstVersion: ["Generate a draft summary for a human to skim and correct before relying on it"],
    notAFitWhen: ["Content is already short enough that summarizing it adds little value", "Losing nuance in a summary would itself be risky (e.g. legal/clinical detail)"],
    risks: ["Omitting a legally or operationally important detail", "Summary sounding authoritative even when incomplete"],
    humanReviewNeeds: ["A human should still be able to access the full original content, not just the summary"],
    exampleQuestions: [
      "How much time is actually spent reading through history before acting on a case?",
      "What absolutely has to be preserved in a summary for it to be useful?",
    ],
    relatedRecommendationTypes: ["ai_assist"],
  },
  {
    id: "rag_knowledge_assistant",
    name: "Knowledge / RAG assistant",
    shortDescription: "Answers questions by retrieving from a trusted internal knowledge source, rather than generating from memory.",
    bestFor: ["Answering questions from documented policy, procedure, or reference material", "Reducing repeated lookups against the same trusted source"],
    signals: [
      "people repeatedly look something up in documented policy or reference material",
      "there is a trusted internal knowledge source, handbook, or documentation people consult",
      "questions get answered inconsistently because the source material is hard to search",
    ],
    requiredEvidence: [
      "A concrete, nameable trusted knowledge source that actually exists today",
      "Evidence that lookups against it are frequent enough to matter",
    ],
    commonInputs: ["A question", "The trusted knowledge source's documents"],
    commonOutputs: ["An answer grounded in and citing the source material"],
    goodFirstVersion: ["Answer with a citation back to the source passage, so a human can verify before relying on it"],
    notAFitWhen: [
      "No single trusted source actually exists - the 'knowledge' is really tribal/undocumented",
      "The source material itself is out of date or unreliable",
    ],
    risks: ["Answering confidently from a stale or wrong source passage", "Users trusting an answer without checking the citation"],
    humanReviewNeeds: ["Answers should be checkable against the cited source, especially for consequential questions"],
    exampleQuestions: [
      "Where does the trusted answer to this kind of question actually live today?",
      "How often do people look this kind of thing up?",
      "How current and reliable is that source material?",
    ],
    relatedRecommendationTypes: ["ai_assist"],
  },
  {
    id: "draft_generation_assistant",
    name: "Draft generation assistant",
    shortDescription: "Drafts emails, responses, reports, notes, plans, or copy for a human to review, edit, and send.",
    bestFor: ["Drafting repetitive but non-trivial writing tasks", "Producing a starting point rather than a finished, sent artifact"],
    signals: [
      "someone regularly writes similar emails, responses, or documents from scratch",
      "drafting takes real time even though the content follows a familiar shape",
      "a person still needs to review and send the final version themselves",
    ],
    requiredEvidence: [
      "Concrete examples of what's actually drafted today",
      "Confirmation that a human will still review/edit before anything goes out",
    ],
    commonInputs: ["Context about the situation (a case, a request, prior correspondence)"],
    commonOutputs: ["A draft email, response, report, or document"],
    goodFirstVersion: ["Draft-only, never auto-send - a human reviews and edits before anything goes out"],
    notAFitWhen: ["The writing is highly individualized with no repeatable shape", "Sending the wrong thing would be high-stakes and review is not realistically going to happen"],
    risks: ["A plausible-sounding draft containing a factual error", "Tone or content mismatched to a sensitive situation"],
    humanReviewNeeds: ["A human reviews and edits before anything is sent or finalized"],
    exampleQuestions: [
      "What do these drafts usually look like - is there a repeatable shape?",
      "Who reviews a draft before it goes out, and how carefully?",
    ],
    relatedRecommendationTypes: ["ai_assist"],
  },
  {
    id: "review_quality_assistant",
    name: "Review / QA assistant",
    shortDescription: "Checks an output against criteria, policy, evidence, formatting, completeness, or risk flags.",
    bestFor: ["Checking work against a known checklist or policy before it's finalized", "Flagging risk indicators for a human reviewer to double-check"],
    signals: [
      "someone reviews completed work against a checklist, policy, or set of criteria",
      "quality or compliance review is a distinct step before something is finalized",
      "review criteria are at least partially documented or known",
    ],
    requiredEvidence: [
      "A concrete, nameable set of review criteria",
      "Confirmation that a human review step already exists or is planned to remain",
    ],
    commonInputs: ["Completed work (a document, case, response) and the review criteria"],
    commonOutputs: ["A list of flagged issues or criteria not met"],
    goodFirstVersion: ["Flag potential issues for a human reviewer to confirm - never auto-reject or auto-approve"],
    notAFitWhen: ["Review criteria are undocumented and highly subjective", "There's no existing human review step this could support"],
    risks: ["False confidence that nothing was flagged means nothing is wrong", "Missing a subtle but important criterion"],
    humanReviewNeeds: ["A human makes the final accept/reject call - this pattern assists the reviewer, it doesn't replace them"],
    exampleQuestions: [
      "What criteria does a reviewer actually check today?",
      "How documented versus judgment-based is that review?",
    ],
    relatedRecommendationTypes: ["ai_assist"],
  },
  {
    id: "decision_support_copilot",
    name: "Decision-support copilot",
    shortDescription: "Presents evidence, options, risks, and recommended next questions while a human makes the actual decision.",
    bestFor: ["Complex judgment calls where a human should stay firmly in control", "Surfacing relevant evidence/options rather than a single answer"],
    signals: [
      "a person makes a judgment call using multiple pieces of evidence or context",
      "the decision is high-stakes enough that a human clearly should decide, not AI",
      "relevant information is scattered and hard to assemble quickly",
    ],
    requiredEvidence: [
      "A concrete decision point where a human is and should remain the decision-maker",
      "A sense of what evidence/options that decision actually draws on",
    ],
    commonInputs: ["Case evidence, prior history, relevant policy or context"],
    commonOutputs: ["A summary of relevant evidence/options/risks and suggested next questions - never a final decision"],
    goodFirstVersion: ["Present assembled evidence and open questions ahead of the decision - never present a recommended decision as if final"],
    notAFitWhen: ["The decision is actually simple/rule-based (rules_automation fits better)", "There isn't enough real evidence yet to assemble anything useful"],
    risks: ["The 'copilot' framing quietly becoming the de facto decision if a human stops checking it"],
    humanReviewNeeds: ["The human decision-maker must remain the one who decides - never automate the decision itself under this pattern"],
    exampleQuestions: [
      "Walk me through how this decision actually gets made today - what do they weigh?",
      "What information is hardest to pull together in time to decide?",
    ],
    relatedRecommendationTypes: ["ai_assist", "human_process_change"],
  },
  {
    id: "rules_automation",
    name: "Rules automation",
    shortDescription: "Deterministic rules, thresholds, routing, validation, or approval logic - no generative AI required.",
    bestFor: ["Clear, documented, stable decision rules or thresholds", "Routing/validation logic that doesn't require judgment"],
    signals: [
      "routing or decisions follow a documented, stable rule or threshold",
      "the same condition always produces the same outcome",
      "a policy explicitly states the criteria for a decision",
    ],
    requiredEvidence: [
      "The actual rule or threshold, stated concretely",
      "Confirmation the rule is stable and not routinely overridden by judgment",
    ],
    commonInputs: ["A structured value to check against a rule or threshold"],
    commonOutputs: ["A deterministic routing/approval/validation outcome"],
    goodFirstVersion: ["Encode only the clearly rule-based cases first; route anything that hits an exception to a human"],
    notAFitWhen: ["Exceptions or judgment calls are common enough that the 'rule' is really a guideline", "The rule changes often or isn't actually written down anywhere"],
    risks: ["An edge case silently mishandled by a rule that didn't anticipate it"],
    humanReviewNeeds: ["Exceptions to the rule should route to a human, not be forced through the rule anyway"],
    exampleQuestions: [
      "Is this rule actually written down somewhere, or is it more of a norm?",
      "How often does a real case not fit the rule cleanly?",
    ],
    relatedRecommendationTypes: ["rules_automation"],
  },
  {
    id: "workflow_orchestration",
    name: "Workflow orchestration",
    shortDescription: "Coordinates steps across systems or people where the logic is mostly known but handoffs are messy.",
    bestFor: ["Multi-step processes with known logic but inconsistent handoffs", "Reducing manual coordination overhead between systems/teams"],
    signals: [
      "a process involves handoffs between multiple systems or teams",
      "coordination between steps is currently manual and inconsistent",
      "the overall sequence of steps is already well understood",
    ],
    requiredEvidence: [
      "A clear map of the actual steps and handoffs involved",
      "Confirmation the logic connecting steps is mostly known, not itself in question",
    ],
    commonInputs: ["Status/data from each system or step involved"],
    commonOutputs: ["Triggered next steps, notifications, or status updates across the workflow"],
    goodFirstVersion: ["Automate notification/handoff triggers only, leaving each step's actual work to its existing owner"],
    notAFitWhen: ["The steps or their logic aren't actually well understood yet", "Systems involved can't be reasonably connected without heavy new integration work"],
    risks: ["A silent failure in one step breaking the whole chain without anyone noticing"],
    humanReviewNeeds: ["Failure/exception points should escalate to a human rather than silently stall or proceed"],
    exampleQuestions: [
      "Can you walk me through every handoff in this process end to end?",
      "Where does coordination between steps break down today?",
    ],
    relatedRecommendationTypes: ["workflow_redesign", "rules_automation"],
  },
  {
    id: "tool_using_agent",
    name: "Tool-using agent",
    shortDescription:
      "AI performs multi-step tasks using tools/APIs - only appropriate when actions are bounded, reversible or reviewable, and permissions are explicit.",
    bestFor: ["Multi-step tasks with clearly bounded, low-risk, reviewable actions", "Cases where tool access/permissions are already explicit and scoped"],
    signals: [
      "a multi-step task requires taking actions across one or more systems",
      "the specific tools, APIs, or systems the task would need to touch are named",
      "permission boundaries and reversibility of actions are explicitly discussed",
    ],
    requiredEvidence: [
      "The exact systems/tools/APIs involved, named concretely",
      "Explicit permission/access boundaries for what the agent could and couldn't do",
      "Confirmation that actions are reversible or reviewable before taking effect",
    ],
    commonInputs: ["A task description", "Access to specific, scoped tools/APIs"],
    commonOutputs: ["Completed multi-step actions across systems, or a proposed action plan for review"],
    goodFirstVersion: ["Propose the action plan for human approval before executing anything - never let it act autonomously in v1"],
    notAFitWhen: [
      "Tool permissions, action boundaries, or reversibility are not yet clear",
      "Sensitive data or high-impact actions are involved without an explicit review step",
      "This is the default answer just because 'agent' sounds impressive - never use this pattern as a default",
    ],
    risks: [
      "An irreversible or high-impact action taken incorrectly",
      "Scope creep into systems/permissions beyond what was actually authorized",
      "Cascading errors across multiple tool calls with no human checkpoint",
    ],
    humanReviewNeeds: [
      "A human should approve the action plan before execution, at least until the pattern is proven safe in this specific context",
    ],
    exampleQuestions: [
      "Exactly which systems or tools would this need to act on?",
      "What's reversible here, and what isn't?",
      "Who would need to approve an action before it actually happens?",
    ],
    relatedRecommendationTypes: ["not_ready", "ai_assist"],
  },
  {
    id: "human_in_the_loop_review_queue",
    name: "Human-in-the-loop review queue",
    shortDescription: "AI drafts or recommends; a human approval step remains required before anything takes effect.",
    bestFor: ["Any AI-assist scenario where a human should keep final say", "Building trust in an AI-drafted output before loosening review"],
    signals: [
      "a human explicitly wants to keep approving before anything moves or is sent",
      "trust in the AI output hasn't been established yet",
      "an approval or sign-off step already exists in the current process",
    ],
    requiredEvidence: [
      "Confirmation a human is willing and available to review each item, at least initially",
      "A defined queue or checkpoint where review actually happens",
    ],
    commonInputs: ["AI-drafted or AI-recommended items awaiting review"],
    commonOutputs: ["Approved, rejected, or edited items", "A record of what was reviewed"],
    goodFirstVersion: ["Literally just this: a queue of AI drafts/recommendations a human works through and approves"],
    notAFitWhen: ["Volume is so high that human review of every item isn't realistically sustainable long-term (worth flagging, not a reason to skip review now)"],
    risks: ["Reviewer fatigue leading to rubber-stamping over time"],
    humanReviewNeeds: ["This pattern *is* the human review step - it should never be quietly removed without a deliberate decision"],
    exampleQuestions: [
      "Who would actually do this review, and do they have time for it?",
      "What would make you comfortable eventually reviewing less than 100% of items, if ever?",
    ],
    relatedRecommendationTypes: ["ai_assist", "human_process_change"],
  },
  {
    id: "monitoring_alerting_assistant",
    name: "Monitoring / alerting assistant",
    shortDescription: "Detects exceptions, missing items, anomalies, overdue work, or risk conditions and surfaces them.",
    bestFor: ["Catching things that currently only get noticed late or by accident", "Surfacing overdue, anomalous, or missing items proactively"],
    signals: [
      "problems are currently discovered late, by accident, or after the fact",
      "there is no active alerting for overdue or missing work today",
      "an anomaly or exception went unnoticed for a while in a past incident",
    ],
    requiredEvidence: [
      "A concrete description of what condition should trigger an alert",
      "Confirmation there's a real gap in current detection, not just a hypothetical one",
    ],
    commonInputs: ["Ongoing status/data to monitor against a defined condition"],
    commonOutputs: ["An alert, flag, or notification when the condition is met"],
    goodFirstVersion: ["A simple alert on the specific, already-evidenced failure condition - not a general-purpose anomaly detector"],
    notAFitWhen: ["Nobody can articulate what condition should actually trigger an alert", "The 'anomaly' is too rare or too poorly understood to define a trigger for yet"],
    risks: ["Alert fatigue from too many false positives", "A missed condition that wasn't anticipated"],
    humanReviewNeeds: ["A human should own responding to and eventually tuning the alert"],
    exampleQuestions: [
      "Can you describe a real case where something was caught late? What would have caught it sooner?",
      "Who would actually act on an alert if one fired?",
    ],
    relatedRecommendationTypes: ["ai_assist", "reporting_visibility"],
  },
  {
    id: "multimodal_intake_assistant",
    name: "Multimodal intake assistant",
    shortDescription: "Handles workflows involving images, scanned documents, voice, screenshots, PDFs, or mixed media.",
    bestFor: ["Intake that includes non-text media (photos, scans, screenshots, audio)", "Cases where the media type itself is part of the workflow, not just the content"],
    signals: [
      "intake includes photos, scanned documents, screenshots, or audio, not just text",
      "different media types need to be interpreted before the workflow can proceed",
    ],
    requiredEvidence: [
      "Concrete confirmation of which non-text media types are actually involved",
      "A sense of what needs to be extracted or understood from that media",
    ],
    commonInputs: ["Images, scanned documents, screenshots, or audio"],
    commonOutputs: ["Structured information or a summary derived from the media"],
    goodFirstVersion: ["Extract/summarize from media for human review on a small, representative sample first"],
    notAFitWhen: ["Intake is actually all text - this pattern doesn't apply just because 'documents' are mentioned generically", "Media quality is too inconsistent to extract anything reliable"],
    risks: ["Misreading a scanned/handwritten document with false confidence", "Missing content in a low-quality image or audio clip"],
    humanReviewNeeds: ["A human should be able to view the original media alongside any extracted interpretation"],
    exampleQuestions: [
      "What non-text media actually comes in as part of this workflow?",
      "How consistent is the quality of that media?",
    ],
    relatedRecommendationTypes: ["ai_assist", "not_ready"],
  },
  {
    id: "voice_conversation_agent",
    name: "Voice / conversation agent",
    shortDescription:
      "Conversational intake, support, scheduling, or guided data collection over voice - only with strong consent, escalation, and fallback paths.",
    bestFor: ["Conversational intake or scheduling where a voice channel is explicitly in use", "Guided data collection over a live conversation"],
    signals: [
      "the workflow explicitly involves a phone call or spoken conversation channel",
      "consent, escalation, and fallback-to-human paths for a voice interaction are discussed",
    ],
    requiredEvidence: [
      "Explicit confirmation that voice/phone is the actual channel in question",
      "A defined consent process for the conversation being AI-assisted or recorded",
      "A clear escalation/fallback path to a human",
    ],
    commonInputs: ["A live or recorded voice conversation"],
    commonOutputs: ["Collected information, a scheduled action, or an escalation to a human"],
    goodFirstVersion: ["A narrow, scripted use case with an easy, always-available escalation to a human - never the default answer for a support/discovery workflow"],
    notAFitWhen: [
      "The channel is actually text/email/form, not voice - never assume voice just because 'conversation' or 'call' was mentioned in passing",
      "Consent, escalation, or fallback paths aren't defined yet",
      "This is being proposed as a default without a clearly voice-specific need",
    ],
    risks: ["A stuck or confused caller with no easy escalation", "Consent/privacy issues around recording or processing a conversation"],
    humanReviewNeeds: ["An always-available, low-friction escalation to a human is required, not optional"],
    exampleQuestions: [
      "Is this actually a voice/phone interaction, or is that being assumed?",
      "What happens today if a caller needs a human immediately?",
      "How is consent for AI involvement handled?",
    ],
    relatedRecommendationTypes: ["not_ready"],
  },
  {
    id: "reporting_visibility_layer",
    name: "Reporting / visibility layer",
    shortDescription: "Addresses a lack of status, ownership, metrics, or transparency - not an AI reasoning problem at all.",
    bestFor: ["Cases where nobody can see what's happening, how much is in flight, or who owns what", "Surfacing existing data more clearly rather than generating new judgments"],
    signals: [
      "nobody has clear visibility into status, volume, or ownership of in-flight work",
      "the same question about status gets asked repeatedly because there's no shared view",
      "the real complaint is about not knowing what's happening, not about a decision being hard",
    ],
    requiredEvidence: [
      "Confirmation that the underlying data needed for visibility already exists somewhere",
      "A concrete description of what people actually want visibility into",
    ],
    commonInputs: ["Existing status/tracking data"],
    commonOutputs: ["A report, dashboard-equivalent summary, or status view (note: this app itself does not add charts/dashboards - the pattern is the recommendation, not a UI DiscoveryOS builds)"],
    goodFirstVersion: ["A simple, regularly-generated status report or checklist - no new AI judgment required"],
    notAFitWhen: ["The problem is genuinely a decision or classification problem, not a visibility gap"],
    risks: ["Reporting on stale or incomplete underlying data without saying so"],
    humanReviewNeeds: ["Someone should own keeping the underlying data accurate - reporting can't fix bad source data"],
    exampleQuestions: [
      "What specifically do people want to be able to see that they can't today?",
      "Does the underlying data already exist somewhere, even if it's not visible?",
    ],
    relatedRecommendationTypes: ["reporting_visibility"],
  },
  {
    id: "no_build_process_fix",
    name: "No-build process fix",
    shortDescription: "The best fix is clearer ownership, an intake form change, SOP cleanup, a checklist, or training - not a build at all.",
    bestFor: ["Problems actually caused by unclear ownership, undocumented process, or inconsistent intake", "Cases where the fastest, safest fix doesn't involve AI or automation"],
    signals: [
      "the root cause is unclear ownership, an undocumented process, or inconsistent intake fields",
      "a simple form/checklist/SOP change would resolve most of the actual pain",
      "the team hasn't tried a non-AI fix yet before jumping to automation",
    ],
    requiredEvidence: ["A specific, nameable process gap (ownership, missing SOP, inconsistent intake) that a non-AI fix would address"],
    commonInputs: ["The existing process/intake as it stands today"],
    commonOutputs: ["A clarified SOP, an updated intake form, a checklist, or a training update"],
    goodFirstVersion: ["Just fix the specific process gap directly - no AI, no automation, no new system"],
    notAFitWhen: ["The pain is really about volume/scale/complexity that a process tweak can't address"],
    risks: ["Under-investing in a real automation opportunity by stopping at a process fix that only partially helps"],
    humanReviewNeeds: ["N/A - this pattern is itself the human-owned fix"],
    exampleQuestions: [
      "Has a simpler process or form change ever been tried here?",
      "If ownership were just clearly assigned, would most of this problem go away?",
    ],
    relatedRecommendationTypes: ["human_process_change", "no_build"],
  },
];

export function getAppliedAiPatternById(id: string): AppliedAiPattern | undefined {
  return APPLIED_AI_PATTERNS.find((p) => p.id === id);
}

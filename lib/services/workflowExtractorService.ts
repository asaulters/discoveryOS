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
import { getConversationEventsForMeeting } from "@/lib/services/conversationEvents";
import { reconcileAmbiguityFlags } from "@/lib/services/ambiguityFlags";
import {
  autoAnswerGaps,
  getWorkflowView,
  narrowGaps,
  reconcileWorkflowComponents,
  reconcileWorkflowGaps,
  reconcileWorkflowSteps,
  upsertWorkflow,
  type DuplicateSuppressionNote,
  type WorkflowView,
} from "@/lib/services/workflows";
import { assessEvidenceQuality } from "@/lib/evidence/evidenceQuality";
import type {
  AmbiguityType,
  ConfidenceLevel,
  ConversationEventType,
  EvidenceType,
  Meeting,
  ThreadPriority,
  TranscriptSegment,
  WorkflowComponentType,
  WorkflowSourceOrigin,
} from "@/lib/types/database";

const CONFIDENCE_LEVELS = ["unclear", "emerging", "likely", "confirmed"] as const satisfies readonly ConfidenceLevel[];

const EVIDENCE_TYPES = ["known", "inferred", "unknown"] as const satisfies readonly EvidenceType[];

const COMPONENT_TYPES = [
  "actor",
  "system",
  "data",
  "decision_rule",
  "approval",
  "handoff",
  "exception",
  "failure_detection",
  "failure_recovery",
  "output",
] as const satisfies readonly WorkflowComponentType[];

const AMBIGUITY_TYPES = [
  "unclear_owner",
  "unclear_rule",
  "informal_term",
  "inconsistent_process",
  "missing_criteria",
  "ambiguous_system",
  "exception_case",
  "other",
] as const satisfies readonly AmbiguityType[];

const AMBIGUITY_PRIORITIES = ["low", "medium", "high", "critical"] as const satisfies readonly ThreadPriority[];

const EvidenceFields = {
  source_transcript_segment_id: z
    .string()
    .nullable()
    .describe(
      "The transcript segment id (copied exactly from the numbered '[id: ...]' transcript list below) that most directly supports this item, or null if no single segment supports it. Must be one of the ids actually given in the transcript block below - never invent, guess, or reuse an id from a different item's evidence unless that segment genuinely also supports this one."
    ),
  source_quote: z
    .string()
    .nullable()
    .describe(
      "A short, verbatim quote (a few words up to one sentence) copied EXACTLY as substring text from the cited transcript segment that supports this item. Null if there's no direct quote to cite. Never paraphrase, combine words from different segments, or fabricate a quote - it must be real text that actually appears in the cited segment."
    ),
  evidence_type: z
    .enum(EVIDENCE_TYPES)
    .describe(
      "known: directly and explicitly stated in the transcript - must have a real source_quote backing it. inferred: a reasonable interpretation you're drawing from what was said, but not itself verbatim in the transcript (source_quote may be null, or may cite nearby supporting text). unknown: use only for items that are themselves an open gap. Never use 'known' without a real, verifiable source_quote to back it."
    ),
  confidence_reason: z
    .string()
    .describe(
      "One specific sentence naming the actual evidence (or the actual absence of evidence) behind this item's confidence_level and evidence_type - e.g. 'Directly described when the speaker explained document intake' or 'Only one anecdote was given, so frequency is not established.' Never a generic phrase like 'based on the transcript' or 'not enough information'."
    ),
};

const WorkflowStepSchema = z.object({
  title: z
    .string()
    .describe(
      "Short title for this process step (2-6 words). Keep steps granular and distinct rather than merging everything into one or two broad steps: separate the initial review from identifying/classifying the item, separate a decision/branch point from the routing action that follows it, separate a routing action for one destination from a routing action for a different destination, split an approval into 'whether approval is required' / 'obtaining the approval' / 'determining the correct approver' when each is evidenced, and include a step for how a failure or misroute gets noticed if the transcript describes that. e.g. 'Review incoming document', 'Identify document type', 'Determine standard item vs. state filing', 'Route standard item to handling team', 'Route state filing to handling team', 'Determine whether Legal approval is required', 'Obtain Legal approval', 'Determine correct Legal reviewer', 'Detect misrouted or delayed filing'."
    ),
  description: z
    .string()
    .describe("1-2 sentences describing what happens in this step, grounded only in transcript evidence."),
  confidence_level: z.enum(CONFIDENCE_LEVELS),
  ...EvidenceFields,
});

const WorkflowComponentSchema = z.object({
  component_type: z
    .enum(COMPONENT_TYPES)
    .describe(
      "actor (team/role), system (a concrete artifact/tool/platform actually used to do or track the work - this does NOT require a brand name: a named product like 'Salesforce' or 'Zendesk' counts, and so does an unbranded but specific artifact like 'a shared spreadsheet', 'an internal ticketing system', 'an internal portal', or 'a shared drive'; what does NOT count is a bare word for a destination/step with no actual artifact described behind it, like 'queue', 'inbox', 'process', or 'document' used generically - if nothing concrete was actually named or described, don't use this type), data (information needed for a decision), decision_rule (routing logic or decision point), approval (a required sign-off/review step), handoff (work/a document moving from one actor to another, including a generic unnamed 'queue' or destination someone mentioned without describing any actual artifact behind it), exception (a non-standard handling path), failure_detection (how a failure is noticed), failure_recovery (how a failure is corrected/escalated once noticed), output (what the workflow produces)."
    ),
  label: z
    .string()
    .describe(
      "Short name for this component, e.g. 'Finance team', 'Legal approval sign-off', 'Standard item vs. state filing'."
    ),
  description: z
    .string()
    .describe("1-2 sentences of transcript-grounded detail about this component."),
  confidence_level: z.enum(CONFIDENCE_LEVELS),
  ...EvidenceFields,
});

const WorkflowGapSchema = z.object({
  label: z
    .string()
    .describe("Short name for this open unknown, e.g. 'Routing trigger', 'State rule interpretation criteria'."),
  description: z.string().describe("One sentence on what's specifically unknown and why it matters."),
  source_transcript_segment_id: EvidenceFields.source_transcript_segment_id,
  source_quote: EvidenceFields.source_quote,
  confidence_reason: z
    .string()
    .describe(
      "One specific sentence explaining WHY this is still a gap - name what was said that stops short of answering it, or that nothing was said at all. Never a generic phrase like 'not enough information'."
    ),
});

const AmbiguityFlagSchema = z.object({
  label: z
    .string()
    .describe("Short, neutral name for this ambiguous point, e.g. 'Informal tool names', 'System owner approval criteria'."),
  description: z
    .string()
    .nullable()
    .describe("One neutral sentence on what specifically is fuzzy or unclear here. Never phrase this as an accusation or a contradiction."),
  ambiguity_type: z
    .enum(AMBIGUITY_TYPES)
    .describe(
      "unclear_owner: who is responsible isn't clearly named (e.g. 'until someone notices'). unclear_rule: a decision rule exists but isn't documented/consistent (e.g. 'approval rules are mostly in people's heads'). informal_term: a name/label used is informal or ambiguous and needs interpretation (e.g. managers using informal tool names). inconsistent_process: the same situation seems handled differently at different points, described neutrally as a process variation, never as a contradiction. missing_criteria: a decision is made but the specific criteria for it aren't stated (e.g. what exactly triggers extra approval). ambiguous_system: a tool/system is referenced vaguely enough that which one isn't fully clear. exception_case: an edge case or non-standard path is mentioned without full detail. other: doesn't fit the above."
    ),
  source_transcript_segment_id: EvidenceFields.source_transcript_segment_id,
  source_quote: EvidenceFields.source_quote,
  priority: z
    .enum(AMBIGUITY_PRIORITIES)
    .describe("How much this ambiguity matters for the discovery goal - not how upsetting it is, just how consequential leaving it unclear would be."),
});

const WorkflowExtractorOutputSchema = z.object({
  workflow_name: z
    .string()
    .describe("A short, specific name for the workflow being mapped, grounded in what's actually been discussed."),
  confidence_level: z
    .enum(CONFIDENCE_LEVELS)
    .describe("Overall ordinal confidence in how well the workflow is understood so far."),
  known_summary: z
    .string()
    .describe("2-4 sentences summarizing what's actually been confirmed about the workflow so far. Evidence only."),
  unknown_summary: z
    .string()
    .describe("2-4 sentences summarizing what's still unknown or unclear about the workflow."),
  steps: z
    .array(WorkflowStepSchema)
    .describe(
      "Current process steps, in the order they occur, kept granular (see each step's own field description for how to split review/classification/decision/routing/approval/failure-detection into distinct steps rather than a couple of broad ones). Include manual work and routing steps. Evidence only - empty array if no step is yet clear."
    ),
  components: z
    .array(WorkflowComponentSchema)
    .describe(
      "Actors, systems, data, decision rules, approvals, handoffs, exceptions, failure detection/recovery, and outputs identified so far."
    ),
  gaps: z
    .array(WorkflowGapSchema)
    .describe("Specific unknowns/gaps still open - things not yet evidenced in the transcript."),
  answered_gap_labels: z
    .array(z.string())
    .describe(
      "Exact label text of any gap from the 'Gaps' list in the current workflow model below that this transcript (including everything already known, not just the newest chunk) now directly and specifically answers - copy the label EXACTLY as given below, character for character, WITHOUT any trailing '[...]' tag. Only include a gap here if you are also adding or already have a known/inferred step or component elsewhere in this response that directly answers it - being related isn't enough, it must actually resolve the question the gap asked. Empty array if nothing changed."
    ),
  narrowed_gaps: z
    .array(
      z.object({
        original_label: z
          .string()
          .describe(
            "Exact label text of a currently open gap (copied exactly from the 'Gaps' list below, without any '[...]' tag) that is now only PARTIALLY resolved - not fully answered."
          ),
        new_label: z
          .string()
          .describe("A new, narrower label naming specifically what remains unknown now, e.g. 'Provisioning systems after Jira intake' instead of the original broad 'Systems used'."),
        new_description: z
          .string()
          .describe("One sentence on exactly what specifically still remains unknown."),
      })
    )
    .describe(
      "Gaps that are now partially (not fully) resolved - rename/narrow them to what specifically remains unknown instead of leaving the original broad wording unchanged. A gap must appear in EITHER answered_gap_labels (fully resolved) OR narrowed_gaps (partially resolved), never both, and never neither if evidence has changed what's actually still unknown about it. Empty array if no gap needs narrowing."
    ),
  ambiguity_flags: z
    .array(AmbiguityFlagSchema)
    .describe(
      "Conservative, non-judgmental notes on genuinely fuzzy language, unclear ownership, informal terms, or missing criteria actually present in the transcript - see the ambiguity-flags rules below. This is NOT contradiction detection and NOT a list of workflow gaps - only flag something here if the transcript itself uses vague/informal/inconsistent language, not just because a fact hasn't been discussed yet (that's what gaps are for). Empty array if nothing genuinely ambiguous was said."
    ),
});

export type WorkflowExtractorOutput = z.infer<typeof WorkflowExtractorOutputSchema>;

const SYSTEM_PROMPT = `You are the workflow extraction analyst inside DiscoveryOS, a live product discovery HUD. You act like an applied AI PM building a structured model of an existing workflow from a live discovery conversation. You run after the fast loop, on the transcript heard so far for the whole meeting, and update a persistent structured workflow model - you do not generate live question directions, that is the fast loop's job.

Ground rules:
- Extract only what is supported by transcript evidence. Do not invent systems, actors, rules, or steps that weren't actually described.
- MANDATORY failure checklist: whenever the transcript describes a failure or mistake that was only discovered after the fact (not caught in real time), you MUST do two things in the same run, every time, without exception: (a) capture how it's currently noticed as a failure_detection component or step - "not noticed until later, by accident" is itself a valid, evidenced finding, not a gap; (b) independently evaluate these four specific questions and add ONE separate gap for each one the transcript did not actually answer (never merge them into a single combined gap, never skip one just because another was answered, never let unrelated gaps crowd these out): (1) who owns fixing it once it's found, (2) how often this kind of failure happens - a single anecdote like "a case a few months back" only proves it CAN happen, never how often, so this stays a gap unless an actual rate/frequency was stated, (3) what the downstream consequence is when it goes undetected (e.g. a missed deadline) - a consequence named for that one anecdote does not establish it as the typical/only consequence, (4) whether any automated alerting/system check exists - explicitly stating there's no such check makes this KNOWN (put it in known_summary/the failure_detection entry, not a gap), but if it simply wasn't discussed, it's a gap.
- Never create a "system" component from a bare process/destination word alone - "queue", "process", "workflow", "team", "document", "inbox", and "routing" are NOT systems by themselves, even if described as where something goes or gets stored, because none of them name an actual artifact or tool - they're just synonyms for "the next step" or "wherever it goes." A generic, unnamed "queue" or destination with nothing concrete behind it is a handoff (or data, only if it's clearly information rather than a destination) - never a system. BUT a system does NOT require a brand name: the moment a specific kind of artifact/tool is actually described - "a shared spreadsheet," "a shared drive," "an internal ticketing system," "an internal portal," a named product like "Salesforce" or "Zendesk" - that's concrete enough to be a system component, evidenced with a real quote, even though it's not a named product. The test is whether an actual artifact/tool was named or described (system), versus just a generic word for "the destination"/"the next step" with nothing concrete behind it (handoff, or an open gap if truly nothing was named). Until something concrete is actually named, keep "systems/tools" as an open gap instead of fabricating one, and use a lower confidence ("unclear" or "emerging") for any generic routing destination you do record as a handoff, since it's vague until named.
  Worked contrast, follow this exactly: "it gets routed into the right queue" names NO artifact (queue is just a metaphor for "next") -> NOT a system, at most a vague handoff. "the team logs the document in a shared spreadsheet" DOES name a concrete artifact (a spreadsheet is a real file/tool with rows and columns) -> IS a system, component_type "system", label like "Shared spreadsheet", quoted from the transcript. Whenever you see logged in / tracked in / stored in / checked against / looked up in + a named-or-described artifact (spreadsheet, drive, doc, tracker, database, portal, ticketing system, CRM, etc.), that is always a system component - never fold it silently into a step's description text only.
- MANDATORY actor checklist: whenever a team, department, role, or named function is explicitly described as handling, reviewing, approving, routing, fixing, or receiving work - even if only named once, even if only as the destination inside a handoff/routing sentence - it MUST get its own actor component (component_type: "actor") in this same run. This includes roles described relationally or indirectly, not just fixed department names - "the system owner", "whoever owns that account", "the person who manages it", "the requester's manager" are all named roles just as much as "Finance" or "IT" is, and each one MUST get its own actor component too. Do not let an actor exist only inside a handoff's, step's, or summary's description text. Do not invent an actor that wasn't named; this is about giving every actor that WAS named its own row, not adding new ones.
- MANDATORY system/tool checklist: whenever a step's or component's own description mentions logging, storing, tracking, checking, or looking something up in a specific artifact/tool - "a shared spreadsheet," "a shared drive," "an internal ticketing system," "an internal portal," a named product like "Salesforce" - that artifact MUST ALSO get its own system component (component_type: "system") in this same run, evidenced with a real quote, exactly like the actor checklist above. Do not let a system exist only inside a step's description text: e.g. a "Log incoming document" step whose description mentions logging into a shared spreadsheet MUST be paired with its own "Shared spreadsheet" system component in the same run, not left as prose only. This applies even if that step/component already existed from an earlier run - go back and add the missing system component now if it's not already there.
- Every system, decision rule, approval, handoff, exception, failure signal, or output you mention anywhere (including inside known_summary) must ALSO appear as its own entry in components (or steps, for a process step) - never describe something in prose without also giving it a structured entry. This includes interpretation/clarification/validation work described as part of handling an item - e.g. figuring out what an informally-named or ambiguous request actually refers to, or checking a request for missing required fields - each of these is its own step, not just a clause folded into another step's description. If the newest chunk names a new fork/branch, a new approval step, or a new piece of interpretation/validation work like this, add it as its own new step or component in this same run; do not wait for a later chunk or leave it as prose-only.
- Separate known facts from unknown gaps: known_summary and steps/components describe what's actually been said; unknown_summary and gaps describe what genuinely hasn't been said yet.
- MANDATORY gap-resolution check: before finishing, re-examine every gap listed in the current workflow model below (not just ones from the newest chunk) and ask "does the transcript - all of it, not just the newest chunk - now directly and specifically answer this, fully or partially?" This applies especially to the most common gap categories: who owns fixing a failure once it's found, which team/actor is responsible for handling an item, how often a failure/issue happens, the downstream consequence of a failure, which system/tool is involved, and whether automated alerting/detection exists.
  - If a gap is now FULLY and directly answered: (a) make sure the answer is captured as its own known/inferred step or component elsewhere in this response (as the other rules already require), and (b) add that gap's exact label to answered_gap_labels.
  - If a gap is now only PARTIALLY answered - part of the original question is resolved but a real, more specific unknown remains - do not leave its original broad label unchanged, and do not put it in answered_gap_labels either (that would falsely claim it's fully resolved). Instead add it to narrowed_gaps with a new label/description naming exactly what's still unknown. Worked examples: a broad "Systems used" gap narrows to "Provisioning systems after Jira intake" once a specific tracking system like "Jira Service Management" is named as known but which system actually fulfills access afterward is still unclear - never keep saying no tracking system is known once one has actually been named. A broad "downstream consequences of delays" gap narrows to a frequency/business-impact framing (e.g. "How often delays happen and their business impact") once the nature of the consequence itself (e.g. "access delayed a few days") is known but how often or how costly isn't. A broad "routing after review" gap narrows to the specific unclear handoff mechanism (e.g. "Exact handoff mechanism between IT and Security/system-owner approval") once the actors/branches on each side of the routing are known but the mechanism connecting them isn't. A broad "failure detection" gap narrows to alerting/ownership/frequency (e.g. "Automated alerting for incomplete requests") once the detection mechanism itself is known (e.g. "sits in the queue until someone notices") but whether it's automated, who owns it, or how often it happens isn't.
  - Never put the same gap in both answered_gap_labels and narrowed_gaps - pick whichever actually matches: fully resolved -> answered_gap_labels, partially resolved -> narrowed_gaps, still completely open -> leave it alone in gaps.
  - Do not silently leave a partially- or fully-answered gap unchanged. Do not add a gap to either list unless you're confident the evidence actually supports it, not just related.
- known_summary and unknown_summary must stay current with everything else you're returning in this same response - before writing them, cross-check against your own steps/components/gaps/answered_gap_labels/narrowed_gaps. Specifically: if you are returning any known/inferred "system" component, unknown_summary must NOT say systems/tools are unknown in general (it may name a more specific remaining system/stage gap, e.g. "which system fulfills access after Jira intake is still unclear", but never a blanket "systems are unknown" once at least one has actually been named). If you are returning any known/inferred failure_detection, failure_recovery component, or a step/component describing a delay, unknown_summary must NOT say failure/delay consequences are "completely unknown" (it may narrow to what specifically about frequency or business impact is still unclear). If you are returning any known/inferred actor or approval component, unknown_summary must NOT say ownership/approval is "completely unknown" (it may narrow to which specific case or scenario ownership is still unclear for). A narrower, more specific unknown_summary sentence is always safer than a broad blanket claim - broad claims are exactly what create a contradiction with your own known items. Likewise, mention in known_summary whatever is now actually known about failure ownership, handling-team responsibility, failure frequency, downstream consequences, systems/tools, and alerting once the transcript has established them - don't let known_summary lag behind the structured items you're returning in the same response.
- The meeting's "tentative build direction" (if given) is a hypothesis, not a fact - never treat it as an already-confirmed part of the workflow.
- Facilitator voice vs. stakeholder voice: the transcript may include the facilitator's own questions, hypotheses, or focus-shifting remarks alongside the stakeholder's answers - sometimes explicitly labeled ("Facilitator:", "Interviewer:", "PM:" vs. "Stakeholder:", a named role, etc.), sometimes not. A facilitator's own question ("What happens when...?") or hedged hypothesis ("maybe this is more of an X issue than a Y issue", "I wonder if...", "could it be that...") is NEVER by itself evidence that a step, component, or rule exists - it is the facilitator's own investigative framing, not a fact about the workflow. Only promote something to evidence_type "known"/"inferred" once the stakeholder's own words - an answer, confirmation, or description of what actually happens - support it, and cite the stakeholder's confirming words as source_quote, never the facilitator's original question or hypothesis. When speaker roles aren't explicitly labeled, infer from phrasing the same way: a sentence that asks a question or proposes a hypothesis about the process, rather than describing what happens, must not by itself justify "known" evidence.
- Never recommend a solution or propose what should be built. You are mapping the current, real-world workflow as it exists today, not designing a future one.
- Confidence is always ordinal: "unclear", "emerging", "likely", or "confirmed". Never use a percentage or numeric score.
- If the transcript says something is "easy" or "hard", treat that as prioritization evidence about where the real difficulty lies - it is NOT proof that a workflow step, rule, or system exists. Don't invent or confirm a step just because the speaker called it easy or hard; instead let it inform which parts of the workflow deserve more detail and which are settled.
- For automation-discovery workflows, extract (as evidenced): current process steps, manual work, routing rules, decision points, teams/actors, handoffs, systems/tools, data required, approval steps, exceptions, failure detection, failure recovery, outputs, and unknowns/gaps.
- When the transcript adds or corrects a detail (e.g. "actually, ..." or a new branch like a Legal approval step), just treat it as new information to fold into the model. Never call a new or revised detail a "contradiction" or flag it as inconsistent - contradiction detection is not part of this task.
- You are given the workflow model as currently understood (if any). Update and extend it rather than starting over: keep steps/components/gaps that are still accurate, add what's new, and revise known_summary/unknown_summary to reflect the full picture across all transcript heard so far, not just the newest chunk.
- Keep step and component titles/labels short and specific to what was actually said, not generic categories.
- Prefer granular steps over broad ones: a decision/branch point, each distinct routing destination, and each part of an approval flow (whether it's required, obtaining it, determining the correct approver) are each their own step when evidenced - don't collapse them into one generic "route to next step" step. Use "emerging" confidence for a step that's real but only partially detailed (the step/branch clearly happened, but exact criteria or a named owner aren't documented yet) rather than omitting it or forcing a higher confidence than the evidence supports. This is about splitting real evidence into distinct steps, not adding new content - never invent a step, owner, or system that wasn't actually described.
- Reminder before you finish - re-check all five MANDATORY checklists above one more time against the full transcript, regardless of how many other steps/components/gaps/ambiguity_flags you've already listed: (1) failure checklist - if any failure/mistake-discovered-after-the-fact moment is described anywhere, its failure_detection entry and its four gap questions must be present; (2) actor checklist - list every team/department/role/named function (including relationally-described roles like "the system owner") mentioned anywhere in the transcript as handling, reviewing, approving, routing, fixing, or receiving work, and confirm each one has its own actor component - add any that are missing; (3) system/tool checklist - list every step or component whose own description mentions a specific artifact/tool, and confirm each one has its own system component - add any that are missing, even for steps that already existed before this run; (4) gap-resolution check - re-examine every currently open gap and confirm each one that's now fully answered is in answered_gap_labels and each one that's now only partially answered is in narrowed_gaps with tighter wording, and that known_summary/unknown_summary are consistent with all of that - never leave unknown_summary claiming something is unknown in general once you've actually named a specific instance of it; (5) ambiguity-flags checklist - separately re-scan the FULL transcript (not just the newest chunk) one more time for hedge words ("usually", "sometimes", "mostly", "depends"), vague ownership ("someone", "until someone notices"), informal/ambiguous naming, and decision criteria that are implied but never actually stated - each genuine instance anywhere in the transcript needs its own ambiguity_flags entry; do not stop after finding just one.

Evidence rules - every step, component, and gap you return must carry honest evidence metadata (source_transcript_segment_id, source_quote, evidence_type, confidence_reason):
- Extract only from transcript evidence. The transcript below is given as a numbered list where each line starts with its real segment id in brackets, like "[id: 3f2a...] some text was said here" - that bracketed id is the only valid value for source_transcript_segment_id.
- Use evidence_type "known" only when the item is directly, explicitly supported by transcript text - and in that case source_quote MUST be a real, verbatim substring of the cited segment's text (copy it exactly, don't paraphrase, don't invent it, don't merge words from two different segments).
- Use evidence_type "inferred" for a reasonable interpretation or synthesis you're drawing across what was said, when it isn't itself a verbatim statement. source_quote may be null for an inferred item, or may cite a real snippet that partially supports it - never a fabricated one.
- Use evidence_type "unknown" only for gap entries (gaps are definitionally the unknowns - never mark a step or component "unknown", either it's known or inferred from real evidence, or it shouldn't be listed at all).
- Never cite a source_transcript_segment_id that does not actually contain evidence for that specific item - citing the wrong segment (even if it's a real id) is as bad as fabricating one. If you're not confident which single segment best supports an item, either pick the one that most directly does, or leave source_transcript_segment_id and source_quote null and rely on evidence_type/confidence_reason instead.
- Never create a fake quote to make an item look more evidenced than it is. It is always better to leave source_quote null than to invent or loosely paraphrase one.
- When assigning evidence_type "known", source_quote must be a concrete stakeholder statement that directly supports the item - not just a real transcript substring, but one that actually shows why the item is true. Avoid generic confirmations ("yes," "right," "that is correct") or vague pronoun-only statements as evidence. For an actor or system component in particular, quote the surrounding words that describe what they actually do or how they're actually used - not just a repeat of the component's own name (e.g. for an actor labeled "Support agent," quote "a support agent reads the issue and checks the customer tier," not merely "support agent"). If the best evidence you can cite is weak, mark the item "inferred" instead of "known," or leave it as an open gap.
- Do not treat the meeting's "tentative build direction" as evidence for anything - it is a hypothesis about what to build, never a fact about the current workflow, and must never be cited as a source_quote or used to justify evidence_type "known".
- A generic, unnamed "queue" mention is never evidence for a system component (see the system-component rule above) - if the only "evidence" for a system is a generic queue/inbox/process word, that's not evidence for a system at all; keep it as an open gap instead.
- confidence_reason must always name the actual specific evidence or the actual specific absence of evidence - never a generic filler phrase.

Human corrections - some items in the current workflow model below are marked "[locked by user]", "[edited by user - keep title/label exactly as-is]", and/or "[human-verified]":
- For any item marked "[locked by user]" or "[edited by user - keep title/label exactly as-is]", a human has written or frozen its title/label and description - the system will not apply any text change you propose for it anyway, so re-propose it with its title/label and description EXACTLY as given below, unchanged. You may still improve its evidence (source_transcript_segment_id/source_quote/evidence_type/confidence_reason) if you find stronger support. Never invent a differently-worded duplicate of one of these items - that creates a confusing second entry for the same real-world thing.
- For any item marked "[human-verified]", a human has confirmed it's accurate - never propose a lower confidence_level for it than it currently has.

Ambiguity flags (ambiguity_flags) - a SEPARATE, lightweight, conservative list, distinct from everything above:
- Purpose: note genuinely fuzzy language actually used in the transcript - hedge words like "usually", "sometimes", "depends", "mostly", vague ownership like "someone", "until someone notices", informal or ambiguous naming, decision criteria that are implied but never actually stated, or an exception/edge case mentioned without detail. This is about HOW something was described, not about what hasn't been discussed yet - a plain gap (nothing said) is never an ambiguity flag; an ambiguity flag is for when something WAS said, but vaguely, informally, or without clear ownership/criteria.
- This is explicitly NOT contradiction detection. Never flag a new or revised detail (e.g. "actually, ...") as ambiguous or inconsistent just because it adds to or changes something said earlier - that's normal conversation, not ambiguity. Never use accusatory or judgmental language anywhere in an ambiguity flag's label/description - describe the fuzziness neutrally and factually (e.g. "Approval rules are described as undocumented" not "The process is inconsistent" or "Contradicts earlier statement").
- Be conservative: only flag something when the transcript's own language is actually vague/informal/hedged/unclear-on-ownership - do not invent an ambiguity that isn't really there, and do not flag something merely because it's complex or because you personally aren't sure about it.
- Do not stop after finding just one. The full transcript heard so far (not only the newest chunk) will often contain several distinct, genuinely ambiguous points at once - e.g. an informal name AND a separately undocumented approval rule AND a vague ownership phrase can all be true in the same transcript. Scan for each of the ambiguity_type categories independently (unclear_owner, unclear_rule, informal_term, inconsistent_process, missing_criteria, ambiguous_system, exception_case) and return one entry per genuine instance you find of each - never truncate the list to a single item once more than one is actually present.
- Reconciliation matches by exact label text like gaps do - keep flagging the same real ambiguity under a consistent label across runs rather than creating near-duplicates. Because reconciliation never deletes, it's safe to re-list an ambiguity you already flagged in an earlier run alongside any new one you find now - always return every genuinely still-ambiguous point from the full transcript in this same response, not only what's new since last time.`;

/**
 * Renders the "[locked by user]" / "[edited by user - ...]" / "[human-verified]"
 * suffix the prompt tells the model to respect - see the human-corrections
 * rule in SYSTEM_PROMPT. An item counts as edited once source_origin has
 * moved off 'ai', even if it was never explicitly locked - without this tag
 * the model could propose slightly different wording for it, which would
 * fail the normalized-title/label match in reconcile* and silently create a
 * confusing duplicate instead of being blocked (the code-level protection
 * in protectsHumanText only stops an exact-matched item's text from being
 * overwritten - it can't stop a near-miss from being inserted as new).
 */
function editMetaSuffix(item: {
  locked_by_user: boolean;
  human_verified: boolean;
  source_origin: WorkflowSourceOrigin;
}): string {
  const tags: string[] = [];
  if (item.locked_by_user) {
    tags.push("locked by user");
  } else if (item.source_origin !== "ai") {
    tags.push("edited by user - keep title/label exactly as-is");
  }
  if (item.human_verified) {
    tags.push("human-verified");
  }
  return tags.length > 0 ? ` [${tags.join(", ")}]` : "";
}

function buildUserPrompt(
  meeting: Meeting,
  transcriptSegments: TranscriptSegment[],
  currentWorkflow: WorkflowView | null
): string {
  const transcriptBlock = transcriptSegments
    .map((segment, i) => `${i + 1}. [id: ${segment.id}] ${segment.raw_text}`)
    .join("\n");

  const currentWorkflowBlock = currentWorkflow
    ? `- Name: ${currentWorkflow.workflow.name}
- Confidence: ${currentWorkflow.workflow.confidence_level}
- Known summary: ${currentWorkflow.workflow.known_summary}
- Unknown summary: ${currentWorkflow.workflow.unknown_summary}
- Steps: ${
        currentWorkflow.steps.length > 0
          ? currentWorkflow.steps
              .map((s) => `${s.title} (${s.confidence_level})${editMetaSuffix(s)}`)
              .join("; ")
          : "none yet"
      }
- Components: ${
        currentWorkflow.components.length > 0
          ? currentWorkflow.components
              .map((c) => `[${c.component_type}] ${c.label} (${c.confidence_level})${editMetaSuffix(c)}`)
              .join("; ")
          : "none yet"
      }
- Gaps: ${
        currentWorkflow.gaps.length > 0
          ? currentWorkflow.gaps.map((g) => `${g.label}${editMetaSuffix(g)}`).join("; ")
          : "none yet"
      }`
    : "(no workflow extracted yet - this is the first extraction run for this meeting)";

  return `Meeting setup:
- Name: ${meeting.name}
- Meeting type: ${meeting.meeting_type}
- Goal: ${meeting.goal ?? "n/a"}
- Current understanding going in: ${meeting.current_understanding ?? "n/a"}
- Tentative build direction (a hypothesis, not a fact - do not treat as settled): ${meeting.tentative_build_direction ?? "none given"}

Current workflow model as understood so far:
${currentWorkflowBlock}

Full transcript heard so far for this meeting (oldest to newest):
${transcriptBlock}

Update the structured workflow model based on all of the transcript above and return the structured result.`;
}

/**
 * Evidence citations only count if they point at a transcript segment that
 * actually exists for this meeting - the model occasionally hallucinates or
 * misremembers an id across a long transcript, so every citation is checked
 * against the real segment id set before it's ever persisted. An invalid id
 * is dropped (set to null) rather than trusted; it never fails the whole
 * extraction run.
 */
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
// Sprint 23: evidence-quality gate. sanitizeSourceSegmentId (above) only
// checks that a cited segment id is real - it says nothing about whether
// the quote is actually a real substring of that segment, or whether it's
// strong enough to support a "known" claim. See lib/evidence/
// evidenceQuality.ts and docs/progress.md's Sprint 23 Part A for the real
// case this closes: a workflow component ("Support agent") whose
// source_quote was just its own label restated, not a fabricated quote,
// but not real support either.
// ---------------------------------------------------------------------------

/** Mirrors regressionRunner.ts's own FACILITATOR_FRAMING_EVENT_TYPES exactly - kept as a small local copy rather than a shared export to avoid coupling the regression module's internals to this one. */
const FACILITATOR_FRAMING_EVENT_TYPES: ReadonlySet<ConversationEventType> = new Set([
  "facilitator_question",
  "facilitator_hypothesis",
  "facilitator_focus_shift",
]);

export interface EvidenceQualityDowngradeNote {
  itemType: "step" | "component" | "gap";
  label: string;
  originalEvidenceType: EvidenceType;
  finalEvidenceType: EvidenceType;
  action: "downgraded" | "quote_dropped" | "downgraded_and_quote_dropped";
  reasons: string[];
}

interface GatedEvidence {
  sourceQuote: string | null;
  evidenceType: EvidenceType;
  confidenceReason: string;
}

/**
 * Runs a draft item's evidence through the deterministic quality helper
 * before it's ever handed to reconcileWorkflowSteps/Components/Gaps, and
 * adjusts it if the quote doesn't hold up:
 * - "known" evidence that doesn't pass -> downgraded to "inferred" (Part C
 *   Option A, the sprint's preferred behavior - the item is kept, just not
 *   overstated). The quote itself is kept for context unless it's actually
 *   untrustworthy (missing/fake/unverifiable/facilitator-sourced), in which
 *   case it's dropped too.
 * - "inferred"/"unknown" drafts are never downgraded further (nothing lower
 *   exists for a step/component - "unknown" is reserved for gaps by
 *   convention) - only an untrustworthy quote gets stripped.
 * - Gaps never have their evidence_type touched (always "unknown" by
 *   construction) - only an untrustworthy quote gets stripped, per Part C.2
 *   ("do not require the same quote strength... but avoid fake/placeholder
 *   quotes").
 * Human-protected items are never passed through this gate at all - see the
 * call sites, which only gate fresh AI drafts before reconciliation, never
 * re-validate rows reconcileWorkflowSteps/Components will refuse to
 * overwrite anyway (pickEvidence/protectsHumanText in workflows.ts).
 */
function gateEvidenceQuality(
  itemType: "step" | "component" | "gap",
  label: string,
  description: string | null,
  evidence: GatedEvidence,
  sanitizedSegmentId: string | null,
  segmentTextById: ReadonlyMap<string, string>,
  facilitatorExcerpts: string[],
  downgrades: EvidenceQualityDowngradeNote[]
): GatedEvidence {
  const segmentText = sanitizedSegmentId ? (segmentTextById.get(sanitizedSegmentId) ?? null) : null;
  const result = assessEvidenceQuality({
    claimTitle: label,
    claimDescription: description,
    quote: evidence.sourceQuote,
    segmentText,
    evidenceType: evidence.evidenceType,
    facilitatorExcerpts,
  });

  if (result.severity === "pass") {
    return evidence;
  }

  if (itemType === "gap") {
    if (!result.quoteIsUntrustworthy) return evidence;
    downgrades.push({
      itemType,
      label,
      originalEvidenceType: evidence.evidenceType,
      finalEvidenceType: evidence.evidenceType,
      action: "quote_dropped",
      reasons: result.reasons,
    });
    return { ...evidence, sourceQuote: null };
  }

  if (evidence.evidenceType === "known") {
    const finalEvidenceType: EvidenceType = "inferred";
    const dropQuote = result.quoteIsUntrustworthy;
    downgrades.push({
      itemType,
      label,
      originalEvidenceType: evidence.evidenceType,
      finalEvidenceType,
      action: dropQuote ? "downgraded_and_quote_dropped" : "downgraded",
      reasons: result.reasons,
    });
    return {
      sourceQuote: dropQuote ? null : evidence.sourceQuote,
      evidenceType: finalEvidenceType,
      confidenceReason: `${evidence.confidenceReason} (Sprint 23 evidence-quality downgrade: ${result.reasons.join("; ")})`,
    };
  }

  if (!result.quoteIsUntrustworthy) return evidence;
  downgrades.push({
    itemType,
    label,
    originalEvidenceType: evidence.evidenceType,
    finalEvidenceType: evidence.evidenceType,
    action: "quote_dropped",
    reasons: result.reasons,
  });
  return { ...evidence, sourceQuote: null };
}

/**
 * Runs the workflow extractor over everything heard so far in the meeting
 * and persists the resulting workflow/steps/components/gaps. Called after
 * the fast loop on every transcript chunk (see submitTranscriptChunk) - kept
 * as a fully separate model/table set so a failure here never blocks
 * directions.
 */
export async function extractWorkflowFromTranscript(
  meetingId: string,
  latestTranscriptSegmentId: string
): Promise<WorkflowView> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const transcriptSegments = await getOrderedTranscriptSegmentsForMeeting(meetingId);
  const validSegmentIds = new Set(transcriptSegments.map((s) => s.id));
  const segmentTextById = new Map(transcriptSegments.map((s) => [s.id, s.raw_text]));
  const currentWorkflow = await getWorkflowView(meetingId);

  // Sprint 23 Part B rule 7 (facilitator-only guard) - best-effort, never
  // blocks extraction. Mirrors regressionRunner.ts's own post-hoc
  // "Conversation state" check, just applied before persistence instead of
  // after. Sprint 15's conversationStateAnalyzerService runs earlier in the
  // same per-chunk pipeline (see transcriptAnalysis.ts), so these events are
  // already up to date for everything heard so far, not just this chunk.
  let facilitatorExcerpts: string[] = [];
  try {
    const events = await getConversationEventsForMeeting(meetingId);
    facilitatorExcerpts = events
      .filter((e) => e.source_role === "facilitator" && FACILITATOR_FRAMING_EVENT_TYPES.has(e.event_type))
      .map((e) => e.evidence_excerpt)
      .filter((excerpt): excerpt is string => !!excerpt);
  } catch {
    // Non-fatal - the evidence-quality gate simply skips rule 7 without this.
  }

  const model = process.env.OPENAI_WORKFLOW_EXTRACTOR_MODEL ?? "gpt-4o-mini";
  const runLog = await startAiRunLog(
    "workflow_extractor",
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
      kind: "workflow_extraction",
      fn: (requestOptions) =>
        client.chat.completions.parse(
          {
            model,
            // Deterministic extraction is more important here than variety - this
            // is a structured-extraction task with an explicit checklist the
            // model must apply consistently, not a creative one.
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: buildUserPrompt(details.meeting, transcriptSegments, currentWorkflow),
              },
            ],
            response_format: zodResponseFormat(WorkflowExtractorOutputSchema, "workflow_extractor_result"),
          },
          requestOptions
        ),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new SchemaParseError("Model returned no structured output");
    }

    const workflow = await upsertWorkflow(meetingId, {
      name: parsed.workflow_name,
      confidenceLevel: parsed.confidence_level,
      knownSummary: parsed.known_summary,
      unknownSummary: parsed.unknown_summary,
    });

    const evidenceQualityDowngrades: EvidenceQualityDowngradeNote[] = [];

    const stepSuppressions = await reconcileWorkflowSteps(
      workflow.id,
      parsed.steps.map((s) => {
        const sourceTranscriptSegmentId = sanitizeSourceSegmentId(s.source_transcript_segment_id, validSegmentIds);
        const gated = gateEvidenceQuality(
          "step",
          s.title,
          s.description,
          { sourceQuote: s.source_quote, evidenceType: s.evidence_type, confidenceReason: s.confidence_reason },
          sourceTranscriptSegmentId,
          segmentTextById,
          facilitatorExcerpts,
          evidenceQualityDowngrades
        );
        return {
          title: s.title,
          description: s.description,
          confidenceLevel: s.confidence_level,
          sourceTranscriptSegmentId,
          sourceQuote: gated.sourceQuote,
          evidenceType: gated.evidenceType,
          confidenceReason: gated.confidenceReason,
        };
      })
    );

    const componentSuppressions = await reconcileWorkflowComponents(
      workflow.id,
      parsed.components.map((c) => {
        const sourceTranscriptSegmentId = sanitizeSourceSegmentId(c.source_transcript_segment_id, validSegmentIds);
        const gated = gateEvidenceQuality(
          "component",
          c.label,
          c.description,
          { sourceQuote: c.source_quote, evidenceType: c.evidence_type, confidenceReason: c.confidence_reason },
          sourceTranscriptSegmentId,
          segmentTextById,
          facilitatorExcerpts,
          evidenceQualityDowngrades
        );
        return {
          componentType: c.component_type,
          label: c.label,
          description: c.description,
          confidenceLevel: c.confidence_level,
          sourceTranscriptSegmentId,
          sourceQuote: gated.sourceQuote,
          evidenceType: gated.evidenceType,
          confidenceReason: gated.confidenceReason,
        };
      })
    );

    const gapSuppressions = await reconcileWorkflowGaps(
      workflow.id,
      parsed.gaps.map((g) => {
        const sourceTranscriptSegmentId = sanitizeSourceSegmentId(g.source_transcript_segment_id, validSegmentIds);
        const gated = gateEvidenceQuality(
          "gap",
          g.label,
          g.description,
          { sourceQuote: g.source_quote, evidenceType: "unknown", confidenceReason: g.confidence_reason },
          sourceTranscriptSegmentId,
          segmentTextById,
          facilitatorExcerpts,
          evidenceQualityDowngrades
        );
        return {
          label: g.label,
          description: g.description,
          sourceTranscriptSegmentId,
          sourceQuote: gated.sourceQuote,
          // Gaps are definitionally the unknowns - evidence_type is never
          // asked of the model for them, it's always "unknown" by construction.
          evidenceType: "unknown" as const,
          confidenceReason: gated.confidenceReason,
        };
      })
    );

    const autoAnsweredGaps = await autoAnswerGaps(workflow.id, parsed.answered_gap_labels);
    const narrowedGaps = await narrowGaps(
      workflow.id,
      parsed.narrowed_gaps.map((g) => ({
        originalLabel: g.original_label,
        newLabel: g.new_label,
        newDescription: g.new_description,
      }))
    );

    // Sprint 9: ambiguity flags are meeting-scoped, not workflow-scoped -
    // they hang directly off the meeting rather than this specific
    // workflow model, since they're about how things were said, not about
    // the structured workflow itself.
    await reconcileAmbiguityFlags(
      meetingId,
      parsed.ambiguity_flags.map((a) => ({
        label: a.label,
        description: a.description,
        ambiguityType: a.ambiguity_type,
        sourceTranscriptSegmentId: sanitizeSourceSegmentId(a.source_transcript_segment_id, validSegmentIds),
        sourceQuote: a.source_quote,
        priority: a.priority,
      }))
    );

    // Sprint 6.5/8 dev note: surface suppressed AI duplicates, auto-answered
    // gaps, and narrowed gaps in the same place other run detail already
    // lives (ai_run_logs.output, visible on /meetings/[meetingId]/debug)
    // rather than only in server console output, so they're inspectable
    // after the fact without needing server log access. Sprint 23:
    // evidenceQualityDowngrades joins them here for the same reason - visible
    // enough for QA without a new page/UI.
    const duplicateSuppressions: DuplicateSuppressionNote[] = [
      ...stepSuppressions,
      ...componentSuppressions,
      ...gapSuppressions,
    ];
    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), {
      ...parsed,
      duplicateSuppressions,
      autoAnsweredGaps,
      narrowedGaps,
      evidenceQualityDowngrades,
    });

    const view = await getWorkflowView(meetingId);
    if (!view) {
      throw new Error("Failed to load workflow after extraction");
    }
    return view;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workflow extraction failed";
    const failureInfo = describeAiCallFailureForLog(err, "workflow_extraction");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

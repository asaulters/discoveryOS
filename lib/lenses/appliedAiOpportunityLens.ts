/**
 * Sprint 25 Part B: the Applied AI opportunity lens - a reusable, shared
 * definition of the discovery dimensions that determine whether a workflow
 * or process is a good candidate for AI assist, rules automation, workflow
 * redesign, reporting/visibility, human process change, not-ready, or
 * no-build. Pure config, no AI calls and no behavior of its own - it exists
 * so the Setup Analyst (Part C), the fast-loop suggested-directions prompt
 * (Part D), the post-meeting Applied AI opportunity assessment (Part E),
 * and any future report can all read from the same source of truth instead
 * of re-deriving these dimensions independently and drifting apart.
 *
 * Product principle this lens exists to enforce: DiscoveryOS never assumes
 * AI is the answer. Every dimension below is written to surface evidence
 * for *any* of the seven recommendation types, not to build a case for AI.
 * Works equally for internal AI Labs work, freelance discovery calls,
 * applied AI consulting, and general process-improvement interviews - none
 * of the wording below is internal-only.
 */

export const APPLIED_AI_RECOMMENDATION_TYPES = [
  "ai_assist",
  "rules_automation",
  "workflow_redesign",
  "reporting_visibility",
  "human_process_change",
  "not_ready",
  "no_build",
] as const;

export type AppliedAiRecommendationType = (typeof APPLIED_AI_RECOMMENDATION_TYPES)[number];

export const APPLIED_AI_RECOMMENDATION_LABELS: Record<AppliedAiRecommendationType, string> = {
  ai_assist: "AI assist",
  rules_automation: "Rules automation",
  workflow_redesign: "Workflow redesign",
  reporting_visibility: "Reporting / visibility",
  human_process_change: "Human process change",
  not_ready: "Not ready",
  no_build: "No-build",
};

export const APPLIED_AI_RECOMMENDATION_DESCRIPTIONS: Record<AppliedAiRecommendationType, string> = {
  ai_assist:
    "AI drafts, suggests, classifies, extracts, or summarizes, with a human reviewing or approving the output - not autonomous action.",
  rules_automation:
    "The decision logic is explicit and stable enough to encode as deterministic rules - no model judgment required.",
  workflow_redesign:
    "The real problem is how the process is structured (ordering, handoffs, ownership, approvals), not a task that could be assisted or automated as-is.",
  reporting_visibility:
    "The real gap is that nobody can see what's happening (status, volume, exceptions) - better reporting or a dashboard would resolve most of the pain without touching the process itself.",
  human_process_change:
    "The fix is a policy, staffing, training, or expectation-setting change - not a system change at all.",
  not_ready:
    "There's a plausible opportunity here, but a specific, named gap (data, rules, ownership, risk tolerance) has to close first before any build is safe to start.",
  no_build:
    "The evidence doesn't support building anything - the workflow is already working, too small to matter, or too risky/ambiguous to justify the investment.",
};

export interface AppliedAiLensDimension {
  key: string;
  title: string;
  /** What this dimension is trying to establish - shown as context, never as a claim. */
  description: string;
  /** Concrete discovery questions a facilitator could actually ask, grounded in this dimension. */
  questions: string[];
}

export const APPLIED_AI_OPPORTUNITY_LENS: AppliedAiLensDimension[] = [
  {
    key: "workflow_pain",
    title: "Workflow pain",
    description:
      "What is slow, repetitive, delayed, error-prone, expensive, frustrating, or inconsistent about the current process?",
    questions: [
      "Where does this process actually slow down or stall?",
      "What part of this is the most repetitive or tedious for the people doing it?",
      "Where do errors or inconsistencies actually show up, and how are they noticed?",
      "What does this cost today - in time, rework, missed deadlines, or frustration?",
    ],
  },
  {
    key: "task_intervention_type",
    title: "Task / intervention type",
    description:
      "Is the work classification, summarization, routing, extraction, validation, generation, research, prediction, coordination, monitoring, or decision support?",
    questions: [
      "When someone does this task, are they mostly classifying, extracting, summarizing, or generating something?",
      "Is this fundamentally a routing/coordination problem, or a judgment/decision problem?",
      "Is anyone trying to predict or forecast something here, or is it all reactive?",
    ],
  },
  {
    key: "current_process_shape",
    title: "Current process shape",
    description: "What triggers the workflow, who touches it, what systems are involved, and where are the handoffs, approvals, delays, and exceptions?",
    questions: [
      "What actually kicks this process off?",
      "Who touches this between the trigger and the end result?",
      "What systems, tools, or spreadsheets are actually involved?",
      "Where are the handoffs, approvals, or delays in this process today?",
      "What's an exception case that doesn't follow the normal path?",
    ],
  },
  {
    key: "data_readiness",
    title: "Data readiness",
    description:
      "What data exists, where does it live, is it structured, unstructured, or mixed, is it reliable, is it sensitive, and is enough historical data available?",
    questions: [
      "What data would this actually need, and where does it live today?",
      "Is that data structured (a database/spreadsheet field) or unstructured (free text, PDFs, conversations)?",
      "How reliable or clean is that data today?",
      "Does any of this data include anything sensitive - customer, financial, health, or otherwise regulated information?",
      "Is there enough historical data to validate an approach before building it?",
    ],
  },
  {
    key: "rule_clarity",
    title: "Rule clarity",
    description: "Are decisions rule-based, judgment-heavy, exception-heavy, subjective, or policy-constrained?",
    questions: [
      "Is this decision governed by a documented rule, or is it really a judgment call?",
      "How often does an exception come up, and how is it handled today?",
      "Is there a written policy this has to follow, or does it vary by who's making the call?",
    ],
  },
  {
    key: "human_review_need",
    title: "Human review need",
    description: "What must remain human-approved, what errors are unacceptable, where is confidence required, and what should AI suggest instead of decide?",
    questions: [
      "What part of this would someone never be comfortable letting run without a human checking it?",
      "What kind of mistake here would actually be costly or damaging?",
      "Where would it be enough for AI to suggest something, versus actually decide it?",
    ],
  },
  {
    key: "risk_and_constraints",
    title: "Risk and constraints",
    description:
      "Privacy, security, compliance, legal, customer impact, financial impact, operational risk, brand risk, and stakeholder trust.",
    questions: [
      "What would make this unsafe to automate or hand to AI?",
      "Are there privacy, security, legal, or compliance rules that apply here?",
      "What's the worst-case impact on a customer, employee, or partner if this went wrong?",
      "Is there a financial, operational, or brand/reputation risk tied to getting this wrong?",
    ],
  },
  {
    key: "integration_and_implementation_surface",
    title: "Integration and implementation surface",
    description: "Which systems must be read from or written to, and can v1 be manual-assist - a checklist, prompt, report, triage helper, or review assistant?",
    questions: [
      "Which systems would this actually need to read from or write into?",
      "Could a first version just be a checklist, a report, or a prompt someone runs manually, rather than a live integration?",
      "Who would own running or maintaining this once it exists?",
    ],
  },
  {
    key: "success_metric",
    title: "Success metric",
    description:
      "Time saved, cycle time reduced, fewer errors, faster routing, reduced rework, higher completeness, better visibility, better consistency, and improved customer/stakeholder experience.",
    questions: [
      "How would you actually know if this got better - what would you measure?",
      "Is the goal mainly speed, accuracy, consistency, visibility, or experience?",
      "What's the current baseline for that metric today, even roughly?",
    ],
  },
  {
    key: "smallest_useful_experiment",
    title: "Smallest useful experiment",
    description: "What is the safest small test, and what can be validated before building a full system?",
    questions: [
      "What's the smallest version of this you could try without committing to a full build?",
      "What would you need to see from a small test before trusting this further?",
      "Could this be validated with a manual dry run or a small sample before any system is built?",
    ],
  },
  {
    key: "recommendation_type",
    title: "Recommendation type",
    description:
      "Which intervention actually fits the evidence: AI assist, rules automation, workflow redesign, reporting/visibility, human process change, not ready, or no-build.",
    questions: [
      "Given everything so far, does this actually need AI - or would a simpler fix (a rule, a report, a process change) solve it?",
      "Is there a specific, named gap that has to close before this is ready to build?",
    ],
  },
];

export function getAppliedAiLensDimension(key: string): AppliedAiLensDimension | undefined {
  return APPLIED_AI_OPPORTUNITY_LENS.find((d) => d.key === key);
}

import type { DiscoveryScenario } from "./types";

/**
 * Sprint 10. Tests support triage, escalation criteria, ownership,
 * failure/SLA handling, and customer impact - a different shape of
 * ambiguity than the onboarding scenario (vague ticket language + partly
 * documented rules, rather than informal naming).
 */
export const supportEscalationWorkflowScenario: DiscoveryScenario = {
  id: "support-escalation-workflow",
  name: "Support Escalation Workflow Demo",
  description:
    "Support ticket triage and escalation across Support/Engineering/Customer Success, with vague ticket language and partly-documented escalation rules creating SLA risk.",
  meetingSetup: {
    meetingName: "Support Escalation Workflow Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether support ticket escalation is a good candidate for AI-assisted triage and routing, and identify where ownership, SLA risk, and unclear escalation criteria create delays.",
    currentUnderstanding:
      "Support agents review incoming customer issues and decide whether to resolve them directly or escalate to another team.",
    tentativeBuildDirection: "AI-assisted support ticket triage and escalation routing.",
    assumptions: [
      "Escalation patterns are predictable based on ticket content and customer tier.",
      "Most delays come from unclear escalation criteria or missing ticket information.",
    ],
    risks: [
      "Some escalations require judgment from senior agents or product specialists.",
      "SLA impact may not be visible until a ticket has already sat too long.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS. The meeting is about support ticket escalation. The current idea is AI-assisted ticket triage and escalation routing, but discovery should validate whether routing is actually the main issue, how escalation criteria are defined, which systems and teams are involved, how SLA risk is detected, and what happens when escalation is delayed.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — intake and triage",
      text: "When a customer ticket comes in, a support agent reads the issue, checks the customer tier, and looks at the product area before deciding whether to handle it themselves or escalate it.",
      expectedSignals: ["Support agent actor", "review/triage step", "customer tier as a decision input"],
    },
    {
      label: "Chunk 2 — escalation routing",
      text: "Billing issues usually stay with Support, but API errors often go to Engineering, and major account issues may need Customer Success involved.",
      expectedSignals: ["Engineering actor", "Customer Success actor", "routing decision rule by issue type"],
    },
    {
      label: "Chunk 3 — vague ticket language",
      text: "The hard part is that some tickets use vague language, so agents have to infer whether it is a bug, a configuration problem, or just user confusion.",
      expectedSignals: ["ambiguous_system or missing_criteria ambiguity flag - vague issue language"],
    },
    {
      label: "Chunk 4 — SLA risk",
      text: "If the ticket is escalated late, it can sit for a day or two before the right team sees it, and that can put us close to missing the SLA.",
      expectedSignals: ["failure-detection/delay step", "SLA risk gap"],
    },
    {
      label: "Chunk 5 — systems and rule documentation",
      text: "We track tickets in Zendesk, but the escalation rules are partly documented in Confluence and partly just known by experienced agents.",
      expectedSignals: ["Zendesk system", "Confluence system", "unclear_rule ambiguity - partly documented"],
    },
    {
      label: "Chunk 6 — facilitator question + stakeholder answer (Sprint 15 speaker-role test)",
      text: 'Facilitator: "Can you walk me through what happens when a ticket is missing information?"\nStakeholder: "That is actually a big issue. If the customer does not include logs or the account ID, the support agent usually has to send a follow-up before Engineering will look at it."',
      expectedSignals: [
        "facilitator question influences focus on missing-information handling, but is not itself process evidence",
        "stakeholder answer becomes process evidence: required logs/account ID, follow-up-before-Engineering step",
      ],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Review incoming ticket",
      "Check customer tier and product area",
      "Determine resolve vs. escalate",
      "Route billing issue to Support",
      "Route API error to Engineering",
      "Route major account issue to Customer Success",
      "Infer issue type from vague ticket language",
      "Detect late escalation / SLA risk",
    ],
    expectedActors: ["Support agent", "Engineering", "Customer Success", "experienced agents"],
    expectedSystems: ["Zendesk", "Confluence"],
    expectedGaps: [
      "Escalation criteria detail",
      "SLA alerting mechanism",
      "Ownership of late-escalation follow-up",
      "Missing ticket information handling",
      "Rule documentation completeness",
    ],
    expectedEvidenceChecks: [
      "Support agent / triage steps quote chunk 1",
      "Billing/API/account routing quotes chunk 2 ('Billing issues usually stay with Support', 'API errors often go to Engineering', 'major account issues may need Customer Success')",
      "Vague-language inference quotes chunk 3",
      "SLA risk quotes chunk 4 ('close to missing the SLA')",
      "Zendesk/Confluence quotes chunk 5",
      "No fabricated system beyond Zendesk/Confluence - 'experienced agents' knowledge is an actor/ambiguity, never promoted to a system",
    ],
    expectedReviewAssessment:
      "partially_supported or needs_reframing - AI triage is plausible but success depends on documenting escalation rules, adding SLA visibility, and improving vague-issue classification before routing alone can be trusted.",
    expectedAmbiguities: [
      "Vague ticket language requiring inference (chunk 3, missing_criteria or ambiguous_system)",
      "Escalation rules partly documented, partly tribal knowledge (chunk 5, unclear_rule)",
    ],
    expectedClarifications: [
      "Routing by issue type (chunk 2: billing/API/account rules) may be complicated by vague ticket language requiring agent inference (chunk 3) and by experienced agents applying partly-tribal escalation knowledge (chunk 5) - a rule_conflict between the stated routing rule and how it's actually applied in practice",
    ],
    expectedSpeakerRoleNotes: [
      "Chunk 6's facilitator question ('what happens when a ticket is missing information?') should influence focus/Still-to-explore toward missing-information handling, but must never appear as a workflow step/component by itself.",
      "The stakeholder's answer ('If the customer does not include logs or the account ID...') is what should evidence the required-fields/follow-up-before-Engineering step as known.",
      "Expect Still-to-explore topic signals for required fields (logs/account ID), the follow-up process, and Engineering intake criteria - not only the last clause of the answer.",
      "Suggested directions after chunk 6 should follow the missing-information thread rather than jumping to an unrelated system/tool topic.",
    ],
  },
  evaluationNotes: [
    "Watch specifically for chunk 3's vague-language issue landing as an ambiguity flag, not a workflow gap - the transcript says something was said (agents infer type), just vaguely, which is the ambiguity-flags definition, not 'nothing said yet'.",
    "Hallucination check: 'experienced agents' in chunk 5 should surface as an actor or ambiguity note, never as a named system - confirm no fabricated tracking tool appears beyond Zendesk/Confluence.",
    "Gap quality: SLA risk (chunk 4) should stay a specific, evidenced gap about alerting/detection, not get merged into a vague 'process is slow' gap.",
    "Review usefulness: the build-direction assessment should name rule documentation and classification quality as prerequisites, not just endorse routing automation outright.",
  ],
};

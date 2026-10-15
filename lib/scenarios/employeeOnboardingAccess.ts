import type { DiscoveryScenario } from "./types";

/**
 * Added Sprint 8, exercised further in Sprint 9. The cleaner second demo
 * script - exercises relationally-described actor capture ("the system
 * owner"), gap narrowing, the workflow diagram, and ambiguity flags all in
 * one five-chunk run.
 */
export const employeeOnboardingAccessScenario: DiscoveryScenario = {
  id: "employee-onboarding-access",
  name: "Employee Onboarding Access Request Demo",
  description:
    "New-hire access requests routed through People Ops/IT/Security/system-owner approval, with informal tool names and undocumented approval rules. Exercises relationally-described actors, gap narrowing, and ambiguity flags.",
  meetingSetup: {
    meetingName: "Employee Onboarding Access Request Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether the employee onboarding access request process is a good candidate for automation, and identify where delays, unclear ownership, approval gaps, and system handoffs create risk.",
    currentUnderstanding:
      "When a new employee joins, their manager requests access to the systems the employee needs. Different teams may approve or fulfill different types of access, and delays can affect the employee's first week.",
    tentativeBuildDirection: "AI-assisted onboarding access request triage and routing.",
    assumptions: [
      "Access requests follow predictable patterns based on role and department.",
      "Most delays come from routing requests to the wrong team or missing required approval information.",
    ],
    risks: [
      "Some access decisions may require manager, Security, or system-owner approval before fulfillment.",
      "The process may rely on tribal knowledge rather than documented rules.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS. The meeting is about the employee onboarding access request process. The current idea is AI-assisted request triage and routing, but the discovery should validate whether routing is actually the problem, whether approval rules are documented, which systems and teams are involved, how failures are detected, and what delays mean for the new employee experience.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — intake and review",
      text: "When a new hire starts, the manager usually sends a request with the employee's role, department, start date, and the tools they think the person needs. Someone on People Ops reviews it first and checks whether anything obvious is missing.",
      expectedSignals: ["Manager actor", "People Ops actor", "intake/review steps"],
    },
    {
      label: "Chunk 2 — approval branching",
      text: "For basic tools like email and Slack, IT can usually provision access directly. But for finance tools or customer data systems, Security or the system owner has to approve it first.",
      expectedSignals: ["IT actor", "Security actor", "system owner as a relationally-described actor"],
    },
    {
      label: "Chunk 3 — informal naming",
      text: "The tricky part is that managers often ask for tools using informal names, so People Ops has to figure out what system they actually mean. Sometimes they also forget to include the department or start date.",
      expectedSignals: ["informal_term ambiguity flag", "clarify informal tool names step"],
    },
    {
      label: "Chunk 4 — delay/failure detection",
      text: "If a request is wrong or incomplete, it usually sits in the IT queue until someone notices and sends a follow-up message. That can delay access by two or three days, which is a big problem for employees starting on Monday.",
      expectedSignals: ["failure-detection step/component", "unclear_owner ambiguity ('until someone notices')"],
    },
    {
      label: "Chunk 5 — systems and undocumented rules",
      text: "We track requests in Jira Service Management, but the approval rules are mostly in people's heads. There is a spreadsheet that lists common roles and the tools they usually need, but it is not always up to date.",
      expectedSignals: ["Jira Service Management system", "spreadsheet system", "unclear_rule ambiguity"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Send access request",
      "Review access request",
      "Provision access for basic tools",
      "Approval for finance/customer data tools",
      "Clarify informal tool names",
      "Detect incomplete requests",
    ],
    expectedActors: ["Manager", "People Ops", "IT", "Security", "System owner"],
    expectedSystems: ["Jira Service Management", "Spreadsheet of roles and tools"],
    expectedGaps: [
      "Frequency of incomplete requests",
      "Downstream consequences of delays",
      "Systems/tools used for tracking requests (narrows once Jira/spreadsheet are named)",
    ],
    expectedEvidenceChecks: [
      "System owner captured as its own actor the moment mentioned (chunk 2), not folded into prose",
      "Jira Service Management and the spreadsheet captured as `system` components with real quotes (chunk 5)",
      "Broad 'systems used' gap narrows once Jira/spreadsheet are named - not left stale",
    ],
    expectedReviewAssessment:
      "partially_supported or needs_reframing - narrow 'triage and routing' undersells intake validation, tool-name normalization, approval-rule clarification, role-to-tool mapping, and escalation/failure detection for incomplete requests.",
    expectedAmbiguities: [
      "Informal tool names needing interpretation (chunk 3, informal_term)",
      "Undocumented/informal approval rules (chunk 5, unclear_rule)",
      "Unclear ownership of the IT-queue follow-up (chunk 4, unclear_owner) - caught inconsistently",
      "Unclear system-owner approval criteria (chunk 2, missing_criteria) - caught inconsistently",
    ],
    expectedClarifications: [
      "Basic tools can be provisioned directly by IT (chunk 2), but finance/customer-data systems require Security or system-owner approval first (chunk 2) - this should be treated as a normal branching approval path, not a contradiction, since IT's direct-provisioning claim is scoped to 'basic tools' rather than stated as universal",
    ],
  },
  evaluationNotes: [
    "Workflow extraction accuracy should mostly pass, with one known pre-existing gap worth noting in the scorecard's notes rather than treated as a new failure: 'Manager' is not reliably captured as its own actor component even though the system-owner fix works for the other relationally-described roles here.",
    "Evidence correctness and hallucination checks should both pass: no fabricated systems, all quotes real substrings.",
    "Demo readiness should pass on ambiguity flags rendering non-disruptively with soft, non-accusatory language throughout - never labeled contradictions or shown as alerts.",
    "Ambiguity flags reliably catch 2-3 of the 4 documented examples in one pass, not consistently all 4 - a known gpt-4o-mini under-generation limit, not a fabrication risk.",
  ],
};

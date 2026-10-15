import type { DiscoveryScenario } from "./types";

/**
 * Sprint 10. Tests cross-team handoffs, implementation readiness, and
 * failure impact discovered downstream (a customer expectation gap, not a
 * process-internal failure) - a different failure shape than the other
 * scenarios, and a three-system, inconsistent-quality-source setup
 * (Salesforce/Asana/a free-text Google Doc template).
 */
export const customerOnboardingHandoffScenario: DiscoveryScenario = {
  id: "customer-onboarding-handoff",
  name: "Customer Onboarding Handoff Demo",
  description:
    "Sales-to-Implementation handoff after a deal closes, where a free-text handoff form filled out with inconsistent detail leads to scope gaps only discovered after kickoff.",
  meetingSetup: {
    meetingName: "Customer Onboarding Handoff Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether customer onboarding handoff from Sales to Implementation is a good candidate for AI-assisted readiness checks and handoff support.",
    currentUnderstanding:
      "After a deal closes, Sales hands the customer to Implementation with notes about goals, stakeholders, contract details, and requested launch timing.",
    tentativeBuildDirection: "AI-assisted onboarding handoff summary and readiness checklist.",
    assumptions: [
      "Sales handoff notes contain enough information to prepare Implementation.",
      "Most onboarding delays come from missing or unclear handoff information.",
    ],
    risks: [
      "Customer expectations may differ from what was captured in Sales notes.",
      "Contract details or integration requirements may require manual review.",
    ],
    pastedContext:
      "This scenario tests customer onboarding handoff discovery. The current idea is AI-assisted handoff summaries, but discovery should validate whether summaries are the real need or whether readiness checks, missing information detection, ownership, integration details, and expectation alignment matter more.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — handoff form",
      text: "Once a deal closes, the account executive fills out a handoff form with the customer goals, main stakeholders, contract package, and requested launch date.",
      expectedSignals: ["account executive actor", "fill handoff form step", "required handoff fields"],
    },
    {
      label: "Chunk 2 — review and kickoff",
      text: "Implementation reviews the handoff and usually schedules a kickoff, but they often have to go back to Sales when integration details or success criteria are missing.",
      expectedSignals: ["Implementation actor", "kickoff step", "missing-info follow-up loop"],
    },
    {
      label: "Chunk 3 — readiness vs summary framing",
      text: "The summary is helpful, but the real issue is knowing whether we have enough information to start onboarding without creating false expectations.",
      expectedSignals: ["readiness-check gap", "'summary helpful' is not proof readiness is solved"],
    },
    {
      label: "Chunk 4 — downstream scope gap",
      text: "If the kickoff happens with missing details, the implementation manager may discover later that the customer expected a custom integration that was not scoped.",
      expectedSignals: ["implementation manager actor", "failure-detection - scope gap discovered after kickoff"],
    },
    {
      label: "Chunk 5 — systems and inconsistent quality",
      text: "We track the deal in Salesforce and the onboarding work in Asana, but the handoff form is a Google Doc template that different reps fill out with different levels of detail.",
      expectedSignals: ["Salesforce/Asana/Google Doc systems", "inconsistent_process ambiguity - varying detail quality"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Close deal",
      "Fill out handoff form",
      "Review handoff",
      "Schedule kickoff",
      "Follow up with Sales for missing details",
      "Discover unscoped integration after kickoff",
    ],
    expectedActors: ["Account executive", "Sales", "Implementation", "Implementation manager", "Customer stakeholders"],
    expectedSystems: ["Salesforce", "Asana", "Google Doc handoff template"],
    expectedGaps: [
      "Required handoff fields beyond goals/stakeholders/contract/launch date",
      "Integration-detail requirements",
      "Success-criteria definition",
      "Expectation-alignment check before kickoff",
      "Ownership of catching missing info before kickoff, not after",
    ],
    expectedEvidenceChecks: [
      "Handoff form step quotes chunk 1 ('customer goals, main stakeholders, contract package, and requested launch date')",
      "Review/kickoff quotes chunk 2 ('go back to Sales when integration details or success criteria are missing')",
      "Readiness gap quotes chunk 3 ('enough information to start onboarding without creating false expectations')",
      "Scope-gap failure quotes chunk 4 ('expected a custom integration that was not scoped')",
      "Salesforce/Asana/Google Doc quotes chunk 5",
      "Google Doc template should appear as a `system` component (a described artifact, not generic 'a form') despite having no brand-name product behind it",
    ],
    expectedReviewAssessment:
      "needs_reframing - a plain AI summary is too narrow; the stronger opportunity is readiness scoring, missing-info detection, integration-risk checks, and kickoff-prep support, since chunk 3 and chunk 4 both point at readiness and expectation alignment as the real risk, not summarization.",
    expectedAmbiguities: [
      "Handoff form filled out with inconsistent detail across reps (chunk 5, inconsistent_process, framed neutrally as a process variation)",
      "'Summary is helpful, but...' framing downplaying readiness as the actual gap (chunk 3)",
    ],
    expectedClarifications: [
      "Tentative build direction is an AI-assisted handoff summary, but the transcript says the summary is helpful while the real issue is knowing whether there's enough information to start onboarding without false expectations (chunk 3) - a build_assumption_conflict, since readiness/missing-info detection may matter more than summarization",
    ],
  },
  evaluationNotes: [
    "Workflow extraction accuracy: confirm the Google Doc handoff template is captured as its own system component - it has no brand name, so this is the scenario's test of the 'described artifact counts even without a product name' rule.",
    "Gap quality: confirm 'readiness' and 'missing integration details' stay distinct, evidenced gaps rather than collapsing into one vague 'onboarding is unclear' gap.",
    "Hallucination checks: confirm chunk 4's downstream discovery is captured as a failure_detection item (discovered late, no upfront check), not framed as a contradiction with chunk 2's handoff review.",
    "Review usefulness: the assessment should specifically name readiness/expectation-alignment as the opportunity ahead of plain summarization, matching chunk 3's own framing.",
  ],
};

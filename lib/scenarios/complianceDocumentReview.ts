import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: internal-ops discovery for a compliance/legal-ops
 * team reviewing vendor compliance documents - tests cautious AI fit
 * where risk/compliance/human approval matter, and the split between
 * deterministic checklist items and genuine policy judgment calls.
 */
export const complianceDocumentReviewScenario: DiscoveryScenario = {
  id: "compliance-document-review",
  name: "Compliance Document Review Demo",
  description:
    "A compliance reviewer manually checking incoming vendor documents for required fields, missing attachments, and policy exceptions - tests review_quality_assistant/structured_extraction fit and a firm human-approval boundary.",
  meetingSetup: {
    meetingName: "Compliance Document Review Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Evaluate whether AI can help review incoming compliance documents.",
    currentUnderstanding:
      "A compliance reviewer manually reviews incoming vendor documents for required fields, missing attachments, inconsistent language, and possible policy exceptions.",
    tentativeBuildDirection: "AI-assisted review checklist and risk flagging.",
    assumptions: [
      "Documents are semi-structured.",
      "Missing information is common.",
      "Final approval must remain human.",
      "Errors have compliance risk.",
    ],
    risks: [
      "Missing a required field could create regulatory exposure.",
      "Inconsistent policy interpretation across reviewers.",
      "A wrongly-approved exception could expose the company to risk.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, internal ops context: a compliance reviewer handling vendor compliance documentation. The current idea is an AI-assisted review checklist and risk flagging, but discovery should validate what's actually mechanical to check versus what's genuine policy judgment, and should keep the reviewer's final sign-off explicit.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — inconsistent document formats",
      text: "These documents come in all kinds of formats — some are PDFs from vendors, some are Word docs, some are just scanned and emailed over. There's no one template everybody uses.",
      expectedSignals: ["Inconsistent/unstructured document formats"],
    },
    {
      label: "Chunk 2 — deterministic checklist items",
      text: "Some of it's pretty mechanical — did they include the signed attestation page, is the effective date filled in, is there a W-9 attached. Those are easy to check, it's basically a checklist.",
      expectedSignals: ["Deterministic required-field checklist"],
    },
    {
      label: "Chunk 3 — nuanced policy judgment",
      text: "But then there's stuff that's more judgment-based — like whether the language in their data-handling clause actually meets our policy, or whether this vendor qualifies for an exception because of how they're structured. That part takes someone who actually knows the policy.",
      expectedSignals: ["Policy exception judgment, not mechanical"],
    },
    {
      label: "Chunk 4 — human accountability",
      text: "Whatever the tool does, as the compliance reviewer I'm still the one who signs off at the end. I'm not going to let something auto-approve a vendor - that's on me if it's wrong.",
      expectedSignals: ["Compliance reviewer actor", "Human sign-off required"],
    },
    {
      label: "Chunk 5 — safe first version",
      text: "Honestly if something just told me 'hey, this one's missing the attestation page' or 'this one's missing a W-9' before I even opened it, that would save me a lot of time. I still want to read the actual exception language myself.",
      expectedSignals: ["Completeness-check-first, human reads exceptions"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "Fewer of these coming back to us because we missed something obvious, and less time spent hunting for what's missing before I can even start the real review.",
      expectedSignals: ["Fewer missed-field errors", "Less time hunting for missing items"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Receive compliance document from vendor",
      "Check document for required fields and attachments",
      "Review policy-sensitive language for exceptions",
      "Approve or reject document",
    ],
    expectedActors: ["Compliance reviewer"],
    expectedSystems: [],
    expectedGaps: [
      "Documented policy criteria for what qualifies as an exception",
      "Standard checklist for required fields/attachments (currently informal)",
      "System or tool used to track document review status",
    ],
    expectedEvidenceChecks: [
      "Inconsistent format quotes chunk 1",
      "Checklist items (attestation page, effective date, W-9) quote chunk 2",
      "Policy-exception judgment quotes chunk 3",
      "Human sign-off quotes chunk 4 ('I'm still the one who signs off')",
      "No system component should ever be fabricated from 'PDF'/'emailed over' language",
    ],
    expectedReviewAssessment:
      "partially_supported - the transcript supports an AI-assisted checklist/flagging tool for the deterministic fields, but nuanced policy-exception language explicitly requires human judgment, so a broader 'AI reviews compliance documents' framing would overreach.",
    expectedAmbiguities: [
      "What qualifies a vendor for a policy exception is not clearly defined",
      "No consistent document format or template exists",
    ],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["review_quality_assistant", "structured_extraction"],
      expectedSupportingPatternIds: ["human_in_the_loop_review_queue", "completeness_checker"],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "Workflow extraction should capture the checklist-vs-judgment split explicitly - chunk 2 is mechanical, chunk 3 is not.",
    "No system component should be fabricated from generic document-format language (PDF/Word/scanned/emailed).",
    "Human sign-off (chunk 4) should be treated as strong evidence for human_in_the_loop_review_queue, not softened.",
  ],
  scenarioType: "internal_ops",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "ai_assist",
  expectedTopPatterns: ["review_quality_assistant", "structured_extraction"],
  expectedWeakOrUnsafePatterns: ["tool_using_agent", "voice_conversation_agent"],
  difficulty: "intermediate",
  fieldTestRelevance: "high",
  fieldTestUse: {
    approximates: "An internal compliance/legal-ops review conversation with a risk-averse stakeholder.",
    facilitatorSkillTested:
      "Distinguishing deterministic checklist items from genuine policy judgment calls, and keeping human sign-off explicit.",
    discoveryOsBehaviorStressed:
      "Risk/compliance framing, structured-extraction vs. review-assistant distinction, human-approval-required guardrails.",
    successValidates:
      "Whether the recommendation correctly separates rules-based field checks from nuanced exception judgment instead of treating the whole review as one AI task.",
  },
};

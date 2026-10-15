import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: internal-ops discovery for a finance/AP team - tests
 * rules_automation vs. AI-assist boundaries when clear thresholds coexist
 * with genuine exceptions, and includes a deliberate tension between the
 * tentative "automated exception triage" build direction and the
 * transcript's own explicit no-auto-payment statement.
 */
export const invoiceExceptionHandlingScenario: DiscoveryScenario = {
  id: "invoice-exception-handling",
  name: "Invoice Exception Handling Demo",
  description:
    "Finance reviewing invoices that mismatch purchase orders, amounts, or vendor records - tests rules_automation fit for clear thresholds alongside a firm human-approval requirement for anything involving payment, and a build_assumption_conflict between 'automated' framing and that requirement.",
  meetingSetup: {
    meetingName: "Invoice Exception Handling Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Evaluate whether invoice exceptions can be automated or assisted.",
    currentUnderstanding:
      "Finance reviews invoices that mismatch purchase orders, amounts, vendor names, or approval status.",
    tentativeBuildDirection: "Automated exception triage.",
    assumptions: [
      "Some rules are deterministic.",
      "Exceptions require human approval.",
      "Vendor/payment risk exists.",
      "Integration with finance systems may be sensitive.",
    ],
    risks: [
      "Paying the wrong vendor or amount.",
      "Approving an invoice without proper authorization.",
      "Sensitive financial system access.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, internal ops context: a finance/accounts-payable team handling invoice exceptions. The current idea is automated exception triage, but discovery should validate what's actually a clean deterministic rule versus what needs a human decision, and should take payment-system risk seriously.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — invoice/PO mismatches",
      text: "Every week we get a stack of invoices that don't line up cleanly with the PO - maybe the amount's a little different, maybe the vendor name on the invoice doesn't exactly match what's in the system.",
      expectedSignals: ["Invoice/PO mismatch as the core problem"],
    },
    {
      label: "Chunk 2 — clear threshold rule",
      text: "For small stuff, like the invoice is a few dollars off from the PO, there's an actual rule - if it's under a certain threshold we just let it through. That part's pretty mechanical.",
      expectedSignals: ["Documented threshold rule for small mismatches"],
    },
    {
      label: "Chunk 3 — vendor mismatch and manager approval",
      text: "Vendor name mismatches happen a lot, usually it's just a legal-entity-name thing, not fraud, but we still have to check. And if the dollar amount is a big mismatch, that automatically needs a manager's sign-off - no exceptions there.",
      expectedSignals: ["Vendor-name judgment call", "Manager approval required for large mismatches"],
    },
    {
      label: "Chunk 4 — missing PO / stale vendor info",
      text: "Some of these exceptions are just because the PO was never created, or the vendor's info in our system is stale - wrong address, wrong contact, that kind of thing.",
      expectedSignals: ["Missing PO or stale vendor data as an exception cause"],
    },
    {
      label: "Chunk 5 — no auto-payment",
      text: "What would help is if the obvious rule-based stuff got flagged automatically, and then a human still reviews the judgment calls - I would not want anything actually issuing a payment on its own.",
      expectedSignals: ["Explicit rejection of autonomous payment action"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "Less time our team spends manually sorting straightforward mismatches from the ones that actually need a manager, and fewer invoices that just sit in limbo because nobody flagged them.",
      expectedSignals: ["Reduced manual sorting time", "Fewer un-flagged invoices sitting idle"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Receive invoice and compare against purchase order",
      "Apply threshold rule to small amount mismatches",
      "Route large amount mismatches to manager approval",
      "Investigate vendor-name mismatches or missing purchase orders",
    ],
    expectedActors: ["Finance", "Manager"],
    expectedSystems: [],
    expectedGaps: [
      "Documented threshold amount for auto-pass versus exception",
      "Process for correcting outdated vendor information",
      "System used to track and resolve exceptions end-to-end",
    ],
    expectedEvidenceChecks: [
      "Invoice/PO mismatch quotes chunk 1",
      "Threshold rule quotes chunk 2 ('if it's under a certain threshold we just let it through')",
      "Manager approval quotes chunk 3 ('automatically needs a manager's sign-off')",
      "Missing PO/stale vendor quotes chunk 4",
      "No-auto-payment quote chunk 5 ('I would not want anything actually issuing a payment on its own')",
    ],
    expectedReviewAssessment:
      "partially_supported - clear deterministic thresholds support rules automation for small mismatches, but vendor-name judgment calls and manager-approval-required large mismatches mean a single 'automated exception triage' framing undersells how much stays a human decision.",
    expectedAmbiguities: ["The exact dollar threshold for auto-pass isn't stated as a specific number"],
    expectedClarifications: [
      "Tentative build direction is 'automated exception triage', but chunk 5 explicitly says nothing should issue a payment on its own and chunk 3 requires manager approval for large mismatches - a build_assumption_conflict between the 'automated' framing and the transcript's explicit human-approval requirement.",
    ],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["human_in_the_loop_review_queue"],
      expectedSupportingPatternIds: ["rules_automation", "monitoring_alerting_assistant", "structured_extraction"],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "The build_assumption_conflict (chunk 5 vs. tentative build direction) is the key thing to watch for - it mirrors Document Intake Routing Demo's own build-direction/evidence tension but in a payments context.",
    "rules_automation should be evidenced by the threshold rule (chunk 2) but deliberately only partially - the exception/judgment language in chunks 3-4 should keep it from ranking as a clean 'strong' fit, per the scenario's own design intent (rules automation only partially fits here). human_in_the_loop_review_queue is the pattern most reliably evidenced as at least 'possible'.",
    "tool_using_agent should stay capped low - this scenario explicitly touches payment systems, which is exactly the sensitive-action case the pattern's ceiling exists for.",
  ],
  scenarioType: "internal_ops",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "rules_automation",
  expectedTopPatterns: ["human_in_the_loop_review_queue"],
  expectedWeakOrUnsafePatterns: ["tool_using_agent", "voice_conversation_agent"],
  difficulty: "intermediate",
  fieldTestRelevance: "high",
  fieldTestUse: {
    approximates: "An internal finance/AP process-improvement conversation.",
    facilitatorSkillTested: "Separating clean rules-automation cases from cases that genuinely need human approval or investigation.",
    discoveryOsBehaviorStressed:
      "Rules-automation vs. AI-assist boundary, monitoring/alerting pattern fit, tool-using-agent caution around payment systems.",
    successValidates:
      "Whether the tentative 'automated exception triage' framing gets appropriately challenged given the transcript's own explicit no-auto-payment statement.",
  },
};

import type { DiscoveryScenario } from "./types";

/**
 * Sprint 10. Tests approval thresholds, compliance/Legal/Security routing,
 * and exception handling - a workflow with a numeric threshold rule
 * ($500) as a concrete decision-rule test case, plus a bounce-back/restart
 * failure loop distinct from the other scenarios' failure patterns.
 */
export const procurementApprovalWorkflowScenario: DiscoveryScenario = {
  id: "procurement-approval-workflow",
  name: "Procurement Approval Workflow Demo",
  description:
    "Purchase request routing through manager/Finance/Security/Legal approval based on cost threshold and vendor/purchase type, with incomplete requests causing a bounce-back/restart loop.",
  meetingSetup: {
    meetingName: "Procurement Approval Workflow Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether procurement request intake and approval routing is a good candidate for automation, and identify where approval thresholds, missing information, compliance review, and ownership create delays.",
    currentUnderstanding:
      "Employees submit purchase requests that may require manager, Finance, Legal, or Security approval depending on amount, vendor, and type of purchase.",
    tentativeBuildDirection: "AI-assisted procurement request routing and approval recommendation.",
    assumptions: ["Approval paths are mostly rule-based.", "Required information is available when the purchase request is submitted."],
    risks: [
      "Legal or Security review may be required for certain vendors or software purchases.",
      "Approval rules may vary by department or budget owner.",
    ],
    pastedContext:
      "This scenario tests procurement approval discovery. The current idea is AI-assisted approval routing, but discovery should validate whether rules are documented, what information is needed, who approves which request types, and how exceptions are handled.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — request intake",
      text: "When someone wants to buy something, they submit a procurement request with the vendor, estimated cost, business reason, and department budget code.",
      expectedSignals: ["employee/requester actor", "submit request step", "required fields"],
    },
    {
      label: "Chunk 2 — threshold rule",
      text: "Anything under $500 usually just needs manager approval, but larger purchases also go to Finance to confirm budget availability.",
      expectedSignals: ["manager actor", "Finance actor", "$500 threshold decision rule"],
    },
    {
      label: "Chunk 3 — software/compliance branch",
      text: "Software purchases are trickier because Security has to review data access, and Legal may need to check contract terms if it is a new vendor.",
      expectedSignals: ["Security actor", "Legal actor", "software-purchase exception branch"],
    },
    {
      label: "Chunk 4 — bounce-back failure",
      text: "The biggest delay happens when people leave out the business reason or attach the wrong quote, because the request gets bounced back and restarted.",
      expectedSignals: ["bounce-back/restart step", "missing-field delay"],
    },
    {
      label: "Chunk 5 — systems and rule documentation",
      text: "We use Coupa for requests, but some approval rules are in a policy document and others are just handled by the procurement coordinator based on experience.",
      expectedSignals: ["Coupa system", "policy document system", "unclear_rule ambiguity"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Submit procurement request",
      "Manager approval",
      "Finance budget confirmation for larger purchases",
      "Security review for software purchases",
      "Legal review for new-vendor contract terms",
      "Bounce back and restart incomplete request",
    ],
    expectedActors: ["Employee / requester", "Manager", "Finance", "Security", "Legal", "Procurement coordinator"],
    expectedSystems: ["Coupa", "Policy document"],
    expectedGaps: [
      "Exact approval threshold rules beyond the $500 manager-only line",
      "Vendor risk criteria for triggering Legal review",
      "Exception handling for unusual purchase types",
      "Complete required-field list",
      "Ownership of the bounce-back/restart step",
    ],
    expectedEvidenceChecks: [
      "Submit-request step quotes chunk 1 ('vendor, estimated cost, business reason, and department budget code')",
      "Threshold rule quotes chunk 2 ('under $500 usually just needs manager approval')",
      "Security/Legal branch quotes chunk 3 ('Security has to review data access', 'Legal may need to check contract terms')",
      "Bounce-back quotes chunk 4 ('gets bounced back and restarted')",
      "Coupa/policy document quotes chunk 5",
      "The $500 threshold should appear as a decision_rule component with a real quote, not just prose in a step description",
    ],
    expectedReviewAssessment:
      "partially_supported - AI routing is plausible for the clear threshold-based path, but depends on documented approval rules beyond the $500 line, clearer vendor-risk criteria, and codified exception handling before it can be trusted end-to-end.",
    expectedAmbiguities: [
      "Approval rules partly in a policy document, partly experience-based (chunk 5, unclear_rule)",
      "New-vendor contract review criteria implied but not fully specified (chunk 3, missing_criteria)",
    ],
    expectedClarifications: [
      "Dollar threshold ($500 manager-only approval, chunk 2) versus software purchases requiring Security review regardless of amount (chunk 3) - a rule_conflict, not just branching, since the threshold rule as stated sounds universal",
      "Rule-based approvals (chunk 2/3) versus approval rules the procurement coordinator just applies from experience rather than the documented policy (chunk 5) - a rule_conflict between documented and undocumented authority",
    ],
  },
  evaluationNotes: [
    "Workflow extraction accuracy: confirm the $500 threshold surfaces as its own decision_rule component with a real quote - this scenario's main check that numeric/quantitative rules get the same structured treatment as qualitative ones.",
    "Gap quality: 'exception handling' should stay a distinct, evidenced gap about undocumented cases, not merged with the general approval-threshold gap.",
    "Hallucination checks: confirm 'procurement coordinator' experience-based judgment (chunk 5) is captured as an actor/ambiguity, not silently treated as an equivalent to the documented policy rules.",
    "Evidence correctness: the bounce-back/restart step (chunk 4) should cite the specific missing-field quote, not a generic 'process has delays' paraphrase.",
  ],
};

import type { DiscoveryScenario } from "./types";

/**
 * Sprint 25 Part H: the first `applied_ai_discovery` scenario fixture.
 * Unlike the automation_discovery scenarios, this one is deliberately
 * built so the tentative build direction (AI-assisted triage +
 * completeness-checking, with the coordinator still signing off) is
 * actually well-supported by the transcript - a test that the review/
 * assessment pipeline can validate a well-aimed direction, not just
 * flag every direction as needing reframing. The exceptions/compliance/
 * sensitive-data material is what should keep the eventual Applied AI
 * opportunity assessment from over-claiming full automation.
 */
export const appliedAiIntakeTriageScenario: DiscoveryScenario = {
  id: "applied-ai-intake-triage",
  name: "Applied AI Intake Triage Demo",
  description:
    "Request intake triage (email/web form/spreadsheet, inconsistent fields, rule-based routing with department/customer-impact/compliance exceptions) - the scenario for testing Applied AI Discovery mode: AI-assist-with-human-review should be supported, not full automation.",
  meetingSetup: {
    meetingName: "Applied AI Intake Triage Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Determine whether request intake triage is a good candidate for AI assistance, automation, workflow redesign, or no-build.",
    currentUnderstanding:
      "Requests arrive through email and a web form, a coordinator reviews them, routes them to the owning team, and follows up when information is missing.",
    tentativeBuildDirection: "AI-assisted intake triage and completeness checking.",
    assumptions: [
      "Request types are predictable.",
      "Missing information causes delay.",
      "Routing rules are partially knowable.",
      "Sensitive data may appear in requests.",
      "Human review may still be required.",
    ],
    risks: [
      "Sensitive or regulated information may appear in unstructured request text.",
      "Misrouted or delayed requests may frustrate customers or stakeholders.",
      "Compliance-relevant requests could be missed if exception criteria aren't well understood.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode. The meeting is about request intake triage. The current idea is AI-assisted triage and completeness checking, but discovery should validate whether that's actually the right intervention versus rules automation, workflow redesign, reporting, human process change, not-ready, or no-build - and should surface data readiness, rule clarity, human-review needs, and risk/compliance constraints before recommending anything.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — channels and inconsistency",
      text: "Requests come in from a bunch of different places — some come through a web form, some come in over email, and every once in a while someone just replies to an old email thread. They all look different — different fields filled in, different amounts of detail, and half the time whatever information we'd actually want isn't there.",
      expectedSignals: ["Multiple intake channels", "Inconsistent fields/missing information"],
    },
    {
      label: "Chunk 2 — coordinator triage effort",
      text: "Once a request lands, I'm the one who has to go through it and figure out what category it actually falls into, which team should own it, how urgent it really is, and whether anything's missing before I can even hand it off. That part — figuring out category, owner, priority, and what's missing — probably eats up more of my day than anything else.",
      expectedSignals: ["Coordinator actor", "Category/owner/priority determination step", "Workflow pain signal"],
    },
    {
      label: "Chunk 3 — rules vs. exceptions",
      text: "A lot of the routing is pretty rule-based — if it's a billing question it goes to Billing, if it's a product issue it goes to Support. But there are exceptions — if the customer's a big account, or if there's any hint of a compliance issue, like a data request or a legal complaint, that one has to go to Compliance instead, no matter what category it looked like on the surface.",
      expectedSignals: ["Billing/Support/Compliance actors", "Rule-based routing", "Exception criteria (big account, compliance issue)"],
    },
    {
      label: "Chunk 4 — data readiness and sensitivity",
      text: "All the raw information lives in the inbox, the web form submissions, and a shared spreadsheet a few of us update by hand. None of it's really structured in a useful way — the web form has some fields, but free text does the real work, and every so often someone pastes in something sensitive, like an account number or a health detail, right into the request body.",
      expectedSignals: ["Shared spreadsheet system", "Unstructured/mixed data", "Sensitive data risk"],
    },
    {
      label: "Chunk 5 — safe first version",
      text: "Honestly I don't think I'd trust something to just auto-route everything on day one. What would actually help is if something could draft a recommendation — here's the likely category, likely owner, likely priority — and flag what's missing, and then I still sign off on it before it actually moves anywhere.",
      expectedSignals: ["Human-in-the-loop requirement", "AI-assist framing (draft + flag, not auto-route)", "Smallest useful experiment signal"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "If this worked, I'd expect a lot less back-and-forth chasing people for missing details, requests getting to the right team faster, and way fewer of the 'wait, why did this end up with us' misroutes we deal with now.",
      expectedSignals: ["Reduced back-and-forth", "Faster routing", "Fewer misroutes"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Receive request from email, web form, or other channel",
      "Determine request category, owner, and priority",
      "Check request for missing information",
      "Route standard request to owning department",
      "Escalate compliance-sensitive or high-impact exceptions to Compliance",
    ],
    expectedActors: ["Coordinator", "Billing", "Support", "Compliance"],
    expectedSystems: ["Shared spreadsheet"],
    expectedGaps: [
      "End-to-end system/tool for tracking and routing requests",
      "Exact criteria for what counts as a compliance issue",
      "Definition of a 'big account' exception",
      "Handling process for sensitive data found in request text",
    ],
    expectedEvidenceChecks: [
      "Receive/determine-category steps quote chunk 1/2 ('come through a web form' / 'figure out what category it actually falls into')",
      "Billing/Support/Compliance routing quotes chunk 3 ('billing question it goes to Billing' / 'has to go to Compliance instead')",
      "Shared spreadsheet quotes chunk 4 ('a shared spreadsheet a few of us update by hand')",
      "Human-in-the-loop / AI-assist framing quotes chunk 5 ('I still sign off on it before it actually moves anywhere')",
      "Success metrics quote chunk 6 ('less back-and-forth' / 'fewer misroutes')",
    ],
    expectedReviewAssessment:
      "partially_supported - the transcript directly supports an AI-assist, human-reviewed triage and completeness-check tool (chunk 5), but compliance-escalation criteria, the 'big account' definition, and sensitive-data handling remain open enough that a fuller automation claim would be premature.",
    expectedAmbiguities: [
      "What counts as a 'big account' is not clearly defined",
      "What counts as a compliance issue beyond 'a data request or a legal complaint' is not clearly defined",
    ],
    // Sprint 26 Part G: expected lib/patterns/patternFit.ts outcomes for this
    // scenario's evidence - see docs/applied-ai-pattern-library.md for what
    // each pattern id means.
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: [
        "intake_triage_assistant",
        "completeness_checker",
        "human_in_the_loop_review_queue",
      ],
      expectedSupportingPatternIds: [
        "structured_extraction",
        "rules_automation",
        "reporting_visibility_layer",
        "no_build_process_fix",
      ],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "Workflow extraction should capture the receive/determine-category/check-missing-info/route/escalate steps and the Coordinator/Billing/Support/Compliance actors.",
    "Evidence correctness should pass: every source quote is a real substring; 'Shared spreadsheet' should appear as a system component (concretely named, unlike the deliberately-generic 'queue' language in Document Intake Routing Demo).",
    "This scenario's tentative build direction should come back partially_supported/supported rather than needs_reframing - useful as the counter-example to Document Intake Routing Demo's needs_reframing case.",
    "The Applied AI opportunity assessment (Sprint 25 Part E) should lean toward ai_assist with human review required, cite the sensitive-data and compliance-exception risks, and list the compliance-criteria/big-account/sensitive-data gaps as missing information rather than glossing over them.",
  ],
};

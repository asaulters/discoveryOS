import type { DiscoveryScenario } from "./types";

/**
 * The original demo script (README "Scenario 1 test path"), now also
 * loadable from the New Meeting page. Deliberately the adversarial
 * hallucination-guardrail case: no chunk ever names a concrete system/tool,
 * so a correct run should never produce a `system` component - "queue" and
 * "routing" stay generic destination language throughout.
 */
export const documentIntakeRoutingScenario: DiscoveryScenario = {
  id: "document-intake-routing",
  name: "Document Intake Routing Demo",
  description:
    "Document classification and routing between Finance/Operations with a Legal approval branch for state filings. No concrete system/tool is ever named - the scenario for testing that the extractor doesn't fabricate a system from generic 'queue' language.",
  meetingSetup: {
    meetingName: "Document Intake Routing Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether document intake and routing is a good candidate for automation, and identify where classification, routing rules, approvals, and misrouting risk create delays.",
    currentUnderstanding:
      "When a document comes in, someone on the team reviews it, determines whether it's a standard item or a state filing, and routes it to the team that handles that type.",
    tentativeBuildDirection: "AI-assisted document classification and routing.",
    assumptions: [
      "Document types follow a small number of predictable patterns.",
      "Most of the manual effort is in classification and routing, not follow-up handling.",
    ],
    risks: [
      "State filings may require Legal approval depending on the state.",
      "Misrouted documents may not be caught until well after the fact.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS. The meeting is about document intake and routing. The current idea is AI-assisted classification and routing, but discovery should validate whether classification is actually the hard part, what routing/approval rules exist, which systems are involved, and how misrouting is currently detected.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — review and classify",
      text: "So when a document comes in, someone on the team has to open it up and take a look at it first. They review it to figure out what kind of document it actually is — is it a standard item, some kind of state filing, whatever. Once they've identified what type it is, they route it into the right queue for whoever handles that type next.",
      expectedSignals: [
        "Review incoming document step",
        "Identify document type step",
        "Generic 'queue' language - not a system",
      ],
    },
    {
      label: "Chunk 2 — routing fork",
      text: "We usually send standard items to Finance, but if it is a state filing issue, Operations handles it — that's kind of the main fork in the road right now, standard item versus state filing determines who picks it up.",
      expectedSignals: ["Finance actor", "Operations actor", "standard-vs-state-filing decision rule"],
    },
    {
      label: "Chunk 3 — Legal approval branch",
      text: "Actually, for the state filing ones there's one more wrinkle — those have to go through Legal for approval before Operations can actually file anything. So it's not just Operations, Legal has to sign off first on the state filing ones.",
      expectedSignals: ["Legal approval component", "additive detail, not a contradiction"],
    },
    {
      label: "Chunk 4 — easy vs hard framing",
      text: "Honestly, figuring out whether something's a standard item or a state filing is usually pretty easy, that part's rarely the issue. The hard part is once you know it's a state filing, figuring out which state's rules actually apply, and then who on Legal is even the right reviewer for that state — that's the part that trips people up.",
      expectedSignals: [
        "State-rule interpretation gap",
        "Reviewer determination gap",
        "'easy' is prioritization signal, not proof a step doesn't need detail",
      ],
    },
    {
      label: "Chunk 5 — failure/misroute",
      text: "There was actually a case a few months back where a state filing got routed to Finance by mistake instead of Operations, and nobody caught it until weeks later when someone noticed the filing deadline had already passed. There's no real alert or check right now that catches that kind of misroute early — it's usually just somebody stumbling onto it later.",
      expectedSignals: ["Failure-detection component/gap", "no automated alerting"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Review incoming document",
      "Identify document type",
      "Route standard item to Finance",
      "Route state filing to Operations",
      "Obtain Legal approval for state filings",
      "Detect misrouted or delayed filing",
    ],
    expectedActors: ["Finance", "Operations", "Legal"],
    expectedSystems: [],
    expectedGaps: [
      "Systems/tools used for tracking requests",
      "State-rule interpretation criteria",
      "Legal reviewer determination",
      "Failure detection/alerting for misrouting",
    ],
    expectedEvidenceChecks: [
      "Review/Identify steps quote chunk 1 ('looks at the document' / 'figures out what type it is')",
      "Finance/Operations routing quotes chunk 2 ('standard items to Finance' / 'state filing issue, Operations handles it')",
      "Legal approval quotes chunk 3 ('Legal has to approve')",
      "State-rule/reviewer gaps quote chunk 4 ('which state rule applies' / 'who needs to review it')",
      "Misrouting detection quotes chunk 5 ('routed wrong' / 'filing is delayed')",
      "No `system` component should ever appear - the 'queue' language must never be promoted to a system",
    ],
    expectedReviewAssessment:
      "needs_reframing - a narrow classification/routing framing undersells state-rule interpretation, reviewer determination, and misroute detection as the real risk areas.",
    expectedClarifications: [
      "Tentative build direction is AI-assisted document classification and routing, but the transcript says classification itself is usually pretty easy while state-rule interpretation and reviewer determination are the hard part (chunk 4) - a build_assumption_conflict, since the direction targets the part explicitly called easy",
    ],
  },
  evaluationNotes: [
    "Workflow extraction accuracy should pass cleanly: steps/actors/decision rule/Legal approval/failure-detection all evidenced above.",
    "Evidence correctness should pass: every source quote is a real substring, and Systems/tools correctly stays an open gap rather than a fabricated system.",
    "Hallucination checks should pass on both the no-fake-system check and the no-unsupported-quote check - this is the scenario specifically built to catch a fabricated system from generic 'queue' language.",
    "Gap quality should reflect that state-rule interpretation and reviewer determination stay open, specific gaps rather than being padded out with restated/duplicate gaps.",
  ],
};

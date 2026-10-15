import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: freelance/client-style discovery about a solo
 * consultant's own project-intake process. Deliberately mentions phone
 * calls as the intake channel ("clients usually call me") without ever
 * discussing consent/escalation/fallback for an AI-driven conversation -
 * a test that voice_conversation_agent stays capped even when a call
 * channel is mentioned in passing, per Sprint 26's own caution.
 */
export const clientProjectIntakeDiscoveryScenario: DiscoveryScenario = {
  id: "client-project-intake-discovery",
  name: "Client Project Intake Discovery Demo",
  description:
    "A solo consultant's own client project intake - vague requests, missing requirements, and manual proposal writing - tests completeness/summarization/drafting pattern fit and whether a mentioned phone channel wrongly inflates voice_conversation_agent's fit.",
  meetingSetup: {
    meetingName: "Client Project Intake Discovery Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Determine whether a consultant/freelancer should use AI to improve client project intake.",
    currentUnderstanding:
      "Project requests arrive through calls and emails; scope is often unclear; follow-up and proposal writing are manual.",
    tentativeBuildDirection: "AI-assisted intake summary, completeness checking, and proposal draft support.",
    assumptions: [
      "Requests are variable.",
      "Missing requirements cause rework.",
      "Human judgment required for pricing/scope.",
      "AI can help organize, not decide.",
    ],
    risks: [
      "Scope creep from bad assumptions.",
      "Underpricing due to missing requirements.",
      "Client dissatisfaction from misaligned expectations.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, freelance/client context: an independent consultant evaluating their own project-intake process. Discovery should validate whether AI-assisted organizing (not deciding) is the right fit, and should notice that a better intake checklist might resolve much of the pain on its own.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — symptoms, not requirements",
      text: "Clients usually call me and describe a problem, not really what they need built - like 'our website is slow' or 'we need better reporting', and it's on me to figure out what that actually means as a project.",
      expectedSignals: ["Vague symptom-based requests", "Phone call as intake channel (not an agent-relevant signal)"],
    },
    {
      label: "Chunk 2 — missing requirement fields",
      text: "A lot of the time I don't get a real budget range, I don't get a timeline, I don't always know who the actual stakeholders are that need to sign off, and I definitely don't get a clear definition of what success looks like.",
      expectedSignals: ["Missing budget/timeline/stakeholders/success criteria"],
    },
    {
      label: "Chunk 3 — manual proposal rewriting",
      text: "After the call I go back through my notes and basically rewrite all of it into a proposal document - that part alone probably takes me a couple hours every time.",
      expectedSignals: ["Manual note-to-proposal rewriting as a time cost"],
    },
    {
      label: "Chunk 4 — scope creep from bad assumptions",
      text: "The times I've gotten burned are when I assumed something about scope that wasn't actually true, and then three weeks in the client's asking for something totally different than what I quoted.",
      expectedSignals: ["Scope creep from unvalidated assumptions"],
    },
    {
      label: "Chunk 5 — safe first version",
      text: "If something helped me turn my call notes into an organized summary, and flagged 'hey you don't have a budget or a timeline yet', that would save real time. I still want to be the one who decides the price and the scope.",
      expectedSignals: ["Summarization + completeness framing", "Human decides price/scope"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "Fewer proposals that need a total rewrite later because I missed something, and less of my own time spent just organizing notes instead of actually thinking about the project.",
      expectedSignals: ["Fewer proposal rewrites", "Less time spent organizing notes"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Receive project request via call or email",
      "Determine scope, budget, timeline, and stakeholders",
      "Organize notes into a project summary",
      "Draft a proposal",
    ],
    expectedActors: ["Consultant"],
    expectedSystems: [],
    expectedGaps: [
      "Standard intake checklist for budget, timeline, stakeholders, and success criteria",
      "Clear scope-change process to prevent scope creep",
    ],
    expectedEvidenceChecks: [
      "Symptom-based request quotes chunk 1",
      "Missing requirement fields quotes chunk 2",
      "Manual rewriting time cost quotes chunk 3",
      "Scope creep quotes chunk 4",
      "Summarize/flag-missing/human-decides framing quotes chunk 5",
    ],
    expectedReviewAssessment:
      "partially_supported - the transcript supports an AI-assisted note-organizing and completeness-checking tool, with the consultant still deciding price and scope, but the underlying intake process (no checklist, no standard requirements gathering) is thin enough that a better intake form/checklist could resolve much of the pain before any AI is needed.",
    expectedAmbiguities: [
      "What counts as a 'complete' project intake (budget/timeline/stakeholders/success criteria) is not formally defined",
    ],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["human_in_the_loop_review_queue"],
      expectedSupportingPatternIds: [
        "completeness_checker",
        "summarization_assistant",
        "draft_generation_assistant",
        "decision_support_copilot",
        "no_build_process_fix",
      ],
      expectedWeakOrNotReadyPatternIds: ["voice_conversation_agent", "tool_using_agent"],
    },
  },
  evaluationNotes: [
    "voice_conversation_agent should stay capped despite 'clients usually call me' - the transcript never discusses an AI conducting the call, consent, or escalation, which is exactly the distinction Sprint 26's pattern-fit ceiling exists to enforce.",
    "no_build_process_fix should show up as a credible supporting option alongside the AI patterns - a better intake checklist addresses much of chunk 2's pain on its own.",
    "human_in_the_loop_review_queue is the most reliably evidenced pattern here (chunk 5: 'I still want to be the one who decides the price and the scope') - completeness/summarization/drafting are real but score more thinly against a short transcript and are documented as supporting rather than asserted strictly.",
  ],
  scenarioType: "freelance_client",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "ai_assist",
  expectedTopPatterns: ["human_in_the_loop_review_queue"],
  expectedWeakOrUnsafePatterns: ["voice_conversation_agent", "tool_using_agent"],
  difficulty: "intermediate",
  fieldTestRelevance: "high",
  fieldTestUse: {
    approximates: "A freelance/consulting discovery call about the consultant's own intake process.",
    facilitatorSkillTested:
      "Recognizing when the real fix is better intake structure, not a build, while still finding a legitimate AI-assist angle (organizing notes).",
    discoveryOsBehaviorStressed:
      "Completeness-checking and summarization pattern fit, no-build-process-fix as a co-equal recommendation, voice-channel-mentioned-but-not-agent-relevant nuance.",
    successValidates:
      "Whether pattern fit correctly avoids over-crediting voice_conversation_agent just because calls were mentioned as an intake channel.",
  },
};

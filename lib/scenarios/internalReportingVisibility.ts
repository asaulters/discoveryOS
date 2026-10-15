import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: internal-ops discovery deliberately built as a "trap"
 * scenario - the tentative build direction is an AI-generated summary,
 * but the transcript is explicit that the real bottleneck is late,
 * inconsistent, unowned data collection, not the summary-writing step
 * itself. Exercises DiscoveryOS's willingness to recommend no build at
 * all (or a process/visibility fix) when that's what the evidence
 * actually supports - the deliberate counterweight to every AI-assist-
 * leaning scenario in the library.
 */
export const internalReportingVisibilityScenario: DiscoveryScenario = {
  id: "internal-reporting-visibility",
  name: "Internal Reporting Visibility Demo",
  description:
    "Teams manually collecting status updates in a shared spreadsheet before a leadership meeting, with late/inconsistent submissions and no data ownership - tests whether DiscoveryOS recommends reporting/visibility and process fixes over AI summarization when that's what the evidence actually shows.",
  meetingSetup: {
    meetingName: "Internal Reporting Visibility Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "broad_exploration",
    goal: "Determine whether leadership reporting delays need AI, automation, or process redesign.",
    currentUnderstanding: "Teams manually collect status updates in a shared spreadsheet and emails before leadership meetings.",
    tentativeBuildDirection: "AI-generated status summaries.",
    assumptions: [
      "Summary writing may not be the main bottleneck.",
      "Data ownership may be unclear.",
      "Visibility may be the real problem.",
      "AI may be premature.",
    ],
    risks: [
      "Leadership making decisions on stale or incomplete data.",
      "Continued time waste chasing updates.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, internal ops context: an internal PMO/ops function preparing weekly leadership status reporting. The current idea is an AI-generated summary, but discovery should validate whether that actually addresses the bottleneck, or whether the real issue is late, inconsistent, unowned data collection.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — late updates",
      text: "Every week before the leadership meeting, someone has to go around and chase down status updates from each team lead, and half the time people don't submit until the morning of, or later.",
      expectedSignals: ["Late/chased status updates"],
    },
    {
      label: "Chunk 2 — inconsistent fields",
      text: "Everybody fills out the spreadsheet a little differently - some people write a paragraph, some people write one word, some people just leave it blank and you have to go ask them directly.",
      expectedSignals: ["Inconsistent spreadsheet fields", "Shared spreadsheet as the system"],
    },
    {
      label: "Chunk 3 — no data ownership",
      text: "Nobody really owns making sure this stuff is accurate or on time. It's kind of everybody's job and nobody's job at the same time.",
      expectedSignals: ["No clear ownership of data accuracy/timeliness"],
    },
    {
      label: "Chunk 4 — what leadership actually wants",
      text: "Honestly what leadership cares about is pretty simple - what's the status, what's blocking it, and what's been sitting there too long without movement.",
      expectedSignals: ["Leadership wants status/blockers/aging items"],
    },
    {
      label: "Chunk 5 — summarizing is the easy part",
      text: "Once I actually have everyone's real updates in front of me, writing the summary itself doesn't take long at all - the hard part is getting the actual updates out of people on time.",
      expectedSignals: ["Summary writing is not the bottleneck"],
    },
    {
      label: "Chunk 6 — safe first version explicitly not AI",
      text: "What would actually help is people just knowing they're accountable for their own update, and some kind of reminder or nudge before the deadline. An AI writing the summary doesn't fix the part that's actually broken.",
      expectedSignals: ["Explicit rejection of AI-first framing", "Accountability/reminder as the real fix"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Team leads submit status updates to a shared spreadsheet",
      "Coordinator chases down late or missing updates",
      "Coordinator compiles updates into a leadership summary",
      "Leadership reviews status, blockers, and aging items",
    ],
    expectedActors: ["Team leads", "Leadership"],
    expectedSystems: ["Spreadsheet"],
    expectedGaps: [
      "Clear ownership of data accuracy and timeliness for status updates",
      "Standard format or fields for status updates",
      "Reminder or accountability mechanism for late submissions",
    ],
    expectedEvidenceChecks: [
      "Late updates quote chunk 1",
      "Inconsistent spreadsheet fields quotes chunk 2",
      "No ownership quote chunk 3 ('everybody's job and nobody's job')",
      "Summary-writing-is-easy quote chunk 5",
      "Explicit not-AI framing quote chunk 6 ('An AI writing the summary doesn't fix the part that's actually broken')",
    ],
    expectedReviewAssessment:
      "needs_reframing - the tentative AI-generated-summary direction targets the easy part (writing the summary once data exists), while the transcript is explicit that the real bottleneck is late, inconsistent, unowned data collection - a reporting/visibility and ownership fix, not an AI-summarization problem.",
    expectedAmbiguities: ["No one clearly owns data accuracy or timeliness for status updates"],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["reporting_visibility_layer", "no_build_process_fix"],
      expectedSupportingPatternIds: ["workflow_orchestration", "summarization_assistant"],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "This scenario is a deliberate trap: the tentative build direction (AI summary) should be reframed, not endorsed - chunk 6 says so directly, in the stakeholder's own words.",
    "reporting_visibility_layer and/or no_build_process_fix should outrank every AI pattern including summarization_assistant - this is the counterweight scenario to the library's more AI-forward entries.",
    "The spreadsheet should be captured as a real system component; team leads/leadership as real actors.",
  ],
  scenarioType: "internal_ops",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "reporting_visibility",
  expectedTopPatterns: ["reporting_visibility_layer", "no_build_process_fix"],
  expectedWeakOrUnsafePatterns: ["tool_using_agent", "voice_conversation_agent"],
  difficulty: "adversarial",
  fieldTestRelevance: "high",
  fieldTestUse: {
    approximates: "An internal PMO/ops leader discovery conversation where AI was the first idea raised.",
    facilitatorSkillTested: "Resisting an AI-first framing when the evidence clearly points to a process/ownership/visibility fix instead.",
    discoveryOsBehaviorStressed:
      "needs_reframing build-direction assessment, reporting_visibility_layer and no_build_process_fix ranking above every AI pattern.",
    successValidates: "Whether DiscoveryOS is willing to recommend no build at all when that's what the evidence actually supports.",
  },
};

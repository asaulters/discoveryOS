import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: internal-ops discovery for a support team considering
 * a RAG/knowledge assistant - tests rag_knowledge_assistant fit and
 * data-readiness (freshness/ownership) concerns specifically, since a
 * knowledge source existing is not the same as it being safe to build on.
 */
export const knowledgeBaseSupportAssistantScenario: DiscoveryScenario = {
  id: "knowledge-base-support-assistant",
  name: "Knowledge Base Support Assistant Demo",
  description:
    "A support team searching Confluence, Slack, and old tickets to answer customer questions - tests RAG/knowledge-assistant pattern fit against real data-readiness concerns (stale docs, no content ownership) rather than assuming a named knowledge source is automatically safe to build on.",
  meetingSetup: {
    meetingName: "Knowledge Base Support Assistant Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "broad_exploration",
    goal: "Determine whether support reps could use an internal knowledge assistant.",
    currentUnderstanding:
      "Support reps search Confluence, SOP documents, Slack threads, and old tickets to answer customer questions.",
    tentativeBuildDirection: "RAG-based internal support assistant.",
    assumptions: [
      "Trusted knowledge exists.",
      "Content may be outdated.",
      "Source citation matters.",
      "Reps need help finding answers, not replacing judgment.",
    ],
    risks: [
      "An outdated doc could produce a wrong answer.",
      "Reps could over-trust an AI answer without checking the source.",
      "No one may own keeping documentation current.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, internal ops context: a product support team exploring a RAG-based knowledge assistant. Discovery should validate whether the underlying knowledge sources are actually trustworthy and current before endorsing the pattern, not just confirm that sources exist.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — multiple knowledge sources",
      text: "When a rep doesn't know the answer off the top of their head, they're usually digging through Confluence, or searching old Slack threads, or looking at how a similar ticket got resolved before.",
      expectedSignals: ["Confluence and Slack as knowledge sources"],
    },
    {
      label: "Chunk 2 — stale documentation",
      text: "The problem is some of that Confluence stuff hasn't been touched in over a year. Sometimes a rep will confidently answer with something that's just... not true anymore because the product changed.",
      expectedSignals: ["Stale/outdated documentation risk"],
    },
    {
      label: "Chunk 3 — asking senior reps instead",
      text: "A lot of the time, instead of searching, people just ping one of the senior reps in Slack because they trust that answer more than whatever they'd find themselves.",
      expectedSignals: ["Senior rep as informal trusted source"],
    },
    {
      label: "Chunk 4 — customer impact",
      text: "If we give a customer the wrong answer about billing or a feature, that's a real trust problem, especially if they act on it.",
      expectedSignals: ["Customer-impact risk of a wrong answer"],
    },
    {
      label: "Chunk 5 — citation and freshness requirement",
      text: "Whatever this is, it needs to actually show where the answer came from, and it needs to know when to just say 'I'm not sure' instead of guessing, especially if the source looks old.",
      expectedSignals: ["Citation requirement", "Abstain-when-unsure requirement"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "Reps spending less time hunting for the answer, and fewer of those senior-rep interruptions for stuff that's actually already documented somewhere.",
      expectedSignals: ["Reduced search time", "Reduced senior-rep interruptions"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Rep receives customer question",
      "Rep searches Confluence, Slack, or past tickets for an answer",
      "Rep asks a senior teammate if the answer isn't found or trusted",
      "Rep responds to customer",
    ],
    expectedActors: ["Support rep", "Senior rep"],
    expectedSystems: ["Confluence", "Slack"],
    expectedGaps: [
      "Ownership of keeping documentation current",
      "Confidence threshold for when the assistant should abstain",
      "Process for flagging or updating stale documentation",
    ],
    expectedEvidenceChecks: [
      "Confluence/Slack/tickets quotes chunk 1",
      "Stale-documentation quote chunk 2 ('hasn't been touched in over a year')",
      "Senior-rep escalation quotes chunk 3",
      "Citation/abstain requirement quotes chunk 5",
    ],
    expectedReviewAssessment:
      "partially_supported - a RAG-based assistant is supported for surfacing existing documented answers with citations, but freshness and ownership of the underlying content, plus a clear abstain-when-unsure behavior, remain open enough that a fuller autonomous-answer framing would be premature.",
    expectedAmbiguities: [
      "No clear owner keeps documentation up to date",
      "How stale a source has to be before a rep should distrust it is not defined",
    ],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["rag_knowledge_assistant"],
      expectedSupportingPatternIds: ["decision_support_copilot", "review_quality_assistant", "reporting_visibility_layer"],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "Confluence and Slack should be captured as real system components - unlike some other Sprint 27 scenarios, this one does name concrete tools.",
    "The review/assessment should not endorse the RAG assistant unconditionally - staleness and lack of content ownership are explicit, evidenced gaps.",
    "Missing information should explicitly name documentation ownership/freshness, not just gloss over it.",
  ],
  scenarioType: "internal_ops",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "not_ready",
  expectedTopPatterns: ["rag_knowledge_assistant"],
  expectedWeakOrUnsafePatterns: ["tool_using_agent", "voice_conversation_agent"],
  difficulty: "intermediate",
  fieldTestRelevance: "medium",
  fieldTestUse: {
    approximates: "An internal support-ops discovery call about a RAG/knowledge-assistant idea.",
    facilitatorSkillTested:
      "Probing data readiness (freshness/ownership) before endorsing a RAG pattern, not just confirming a knowledge source exists.",
    discoveryOsBehaviorStressed:
      "RAG pattern-fit scoring, citation/abstain requirements, reporting/visibility as a supporting rather than primary pattern.",
    successValidates:
      "Whether the assessment flags content ownership/freshness as missing information rather than assuming a RAG assistant is automatically safe once a knowledge source is named.",
  },
};

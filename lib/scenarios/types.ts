import type { DiscoveryStrategy, MeetingType } from "@/lib/types/database";
import type { AppliedAiRecommendationType } from "@/lib/lenses/appliedAiOpportunityLens";

/** Everything the New Meeting form needs to prefill from a scenario. Assumptions/risks are plain strings here (not {text, confidenceLevel} pairs) - the New Meeting page defaults confidence to "unclear" for every loaded assumption, same as it does for a manually-added blank one. */
export interface ScenarioMeetingSetup {
  meetingName: string;
  meetingType: MeetingType;
  discoveryStrategy: DiscoveryStrategy;
  goal: string;
  currentUnderstanding: string;
  tentativeBuildDirection: string;
  assumptions: string[];
  risks: string[];
  pastedContext: string;
}

export interface ScenarioTranscriptChunk {
  label: string;
  text: string;
  /** Optional hint text for a human QA reader - what this chunk is expected to surface. Not sent to the model, not shown as a guarantee. */
  expectedSignals?: string[];
}

/**
 * Sprint 26 Part G: expected Applied AI pattern-fit outcomes (lib/patterns/
 * patternFit.ts) for scenarios that exercise Applied AI Discovery mode -
 * optional, only meaningful for `applied_ai_discovery` scenarios. Pattern
 * ids are the AppliedAiPatternId strings from lib/patterns/appliedAiPatterns.ts.
 */
export interface ScenarioExpectedPatternFits {
  /** Pattern ids expected to reach at least "possible" fit. */
  expectedPossibleOrStrongPatternIds: string[];
  /** Pattern ids expected to be worth noting as supporting/partial, even if not top-ranked. */
  expectedSupportingPatternIds?: string[];
  /** High-autonomy pattern ids expected to stay at "weak" or "not_enough_info" - never "possible"/"strong" - given this scenario's evidence. */
  expectedWeakOrNotReadyPatternIds: string[];
}

export interface ScenarioExpectedOutputs {
  expectedWorkflowSteps: string[];
  expectedActors: string[];
  expectedSystems: string[];
  expectedGaps: string[];
  expectedEvidenceChecks: string[];
  expectedReviewAssessment: string;
  expectedAmbiguities?: string[];
  /** Sprint 12: expected contradiction-detector "clarification needs" - two separately-evidenced claims that should surface as a possible-inconsistency candidate, not a plain gap or ambiguity flag. */
  expectedClarifications?: string[];
  /** Sprint 15: expected speaker-role/conversation-state behavior for this scenario's mixed facilitator/stakeholder transcript chunk(s), if any - what should happen with a facilitator question/hypothesis vs. the stakeholder's evidence. */
  expectedSpeakerRoleNotes?: string[];
  /** Sprint 26: expected Applied AI pattern-fit outcomes - only set for applied_ai_discovery scenarios. */
  expectedPatternFits?: ScenarioExpectedPatternFits;
}

// ---------------------------------------------------------------------------
// Sprint 27 Part B: lightweight, additive scenario metadata - every field is
// optional so every pre-Sprint-27 scenario keeps working untouched (no
// defaults needed at the type level; callers that want a display value
// handle the undefined case themselves, e.g. the New Meeting page's
// grouping). These are convenience/documentation metadata for humans and
// the scenario selector - they are never read by regressionRunner.ts, which
// keeps using expectedOutputs.expectedPatternFits (Sprint 26) as the single
// source of truth for pattern-fit regression checks, so there's no risk of
// the two ever disagreeing about what the runner actually checks.
// ---------------------------------------------------------------------------

export type ScenarioType = "internal_ops" | "freelance_client" | "mixed";

export type PrimaryDiscoveryMode = "applied_ai_discovery" | "automation_discovery" | "process_discovery";

export type ScenarioDifficulty = "basic" | "intermediate" | "messy" | "adversarial";

export type FieldTestRelevance = "high" | "medium" | "low";

/**
 * Sprint 27 Part F: prepares each scenario for Sprint 28's likely "Real
 * Applied AI Field Test Package" - what real meeting this approximates and
 * what running it well/poorly would actually tell you, distinct from the
 * regression-oriented `evaluationNotes` below.
 */
export interface ScenarioFieldTestNotes {
  /** What real-world meeting this scenario approximates. */
  approximates: string;
  /** What facilitator skill this scenario exercises. */
  facilitatorSkillTested: string;
  /** What DiscoveryOS behavior this scenario stresses. */
  discoveryOsBehaviorStressed: string;
  /** What a successful real meeting modeled on this scenario would validate. */
  successValidates: string;
}

export interface DiscoveryScenario {
  id: string;
  name: string;
  description: string;
  meetingSetup: ScenarioMeetingSetup;
  transcriptChunks: ScenarioTranscriptChunk[];
  expectedOutputs: ScenarioExpectedOutputs;
  /** Freeform pointers for a human filling out the /evaluate checklist - not a substitute for the rubric, just what to specifically watch for on this scenario. */
  evaluationNotes: string[];
  /** Sprint 27 Part B: internal-ops vs. freelance/client-style discovery - metadata only, optional. */
  scenarioType?: ScenarioType;
  primaryDiscoveryMode?: PrimaryDiscoveryMode;
  /** Sprint 27 Part B: the single recommendation type this scenario is designed to produce - regressionRunner.ts checks this tolerantly (warn, never fail, on mismatch - recommendation type is AI judgment, not a trust/safety matter). */
  expectedPrimaryRecommendation?: AppliedAiRecommendationType;
  /** Sprint 27 Part B: quick-reference pattern ids, kept consistent with expectedOutputs.expectedPatternFits for scenarios that set both - display/documentation only. */
  expectedTopPatterns?: string[];
  expectedWeakOrUnsafePatterns?: string[];
  difficulty?: ScenarioDifficulty;
  fieldTestRelevance?: FieldTestRelevance;
  /** Sprint 27 Part F. */
  fieldTestUse?: ScenarioFieldTestNotes;
}

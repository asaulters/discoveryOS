// Sprint 9: static evaluation rubric. Pure data, no DB dependency, so it can
// drive both the /evaluate form and (if ever needed) a server-side check.
// Deliberately a hand-filled manual checklist, not an AI-automated grader -
// evaluation_runs.evaluator_type defaults to "manual" for exactly this
// reason. Categories match the seven evaluation_runs.*_score columns
// (question_direction, workflow_extraction, evidence_quality, gap_quality,
// review_quality, hallucination_risk) plus "Demo readiness", which has no
// dedicated score column and only rolls into overall_score.

export interface RubricItem {
  category: string;
  label: string;
}

export const EVALUATION_CATEGORIES = [
  "Question direction quality",
  "Workflow extraction accuracy",
  "Evidence correctness",
  "Gap quality",
  "Review usefulness",
  "Hallucination checks",
  "Clarification / contradiction detection quality",
  "Conversation state / speaker role quality",
  "Demo readiness",
] as const;

export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];

/** Maps a rubric category to the evaluation_runs column it rolls up into - "Demo readiness" has none, it only feeds overall_score. */
export const CATEGORY_SCORE_COLUMN: Record<EvaluationCategory, string | null> = {
  "Question direction quality": "question_direction_score",
  "Workflow extraction accuracy": "workflow_extraction_score",
  "Evidence correctness": "evidence_quality_score",
  "Gap quality": "gap_quality_score",
  "Review usefulness": "review_quality_score",
  "Hallucination checks": "hallucination_risk_score",
  "Clarification / contradiction detection quality": "contradiction_quality_score",
  "Conversation state / speaker role quality": "conversation_state_score",
  "Demo readiness": null,
};

export const EVALUATION_RUBRIC: RubricItem[] = [
  { category: "Question direction quality", label: "Directions are specific to the transcript" },
  { category: "Question direction quality", label: "Questions are useful for discovery" },
  { category: "Question direction quality", label: "Questions are non-generic" },
  {
    category: "Question direction quality",
    label: "No more than 3 directions, no more than 2 questions per direction",
  },

  { category: "Workflow extraction accuracy", label: "Major steps are captured" },
  { category: "Workflow extraction accuracy", label: "Actors are captured" },
  { category: "Workflow extraction accuracy", label: "Systems/tools are captured only when supported" },
  { category: "Workflow extraction accuracy", label: "Approvals/handoffs/failure points are captured" },
  { category: "Workflow extraction accuracy", label: "Human-edited/locked items are respected" },

  { category: "Evidence correctness", label: "Known items have real quotes" },
  { category: "Evidence correctness", label: "Quotes actually appear in the transcript" },
  { category: "Evidence correctness", label: "Unknown gaps are not given fake quotes" },
  { category: "Evidence correctness", label: "Source transcript segments are correct" },

  { category: "Gap quality", label: "Open gaps are truly unresolved" },
  { category: "Gap quality", label: "Answered/dismissed gaps are not shown as open" },
  { category: "Gap quality", label: "Broad gaps are narrowed when partially answered" },
  { category: "Gap quality", label: "The app prefers uncertainty over false certainty" },

  { category: "Review usefulness", label: "Review reflects current structured workflow rows" },
  { category: "Review usefulness", label: "Review avoids stale top-level summaries" },
  { category: "Review usefulness", label: "Review assesses the build direction correctly" },
  { category: "Review usefulness", label: "Review recommends useful follow-ups" },

  { category: "Hallucination checks", label: "No generic queue becomes a fake system" },
  { category: "Hallucination checks", label: "No unsupported actors are invented" },
  { category: "Hallucination checks", label: "No unsupported systems are invented" },
  { category: "Hallucination checks", label: "No unsupported source quotes are invented" },

  { category: "Clarification / contradiction detection quality", label: "Identified real tensions, not just missing info" },
  { category: "Clarification / contradiction detection quality", label: "Avoided false positives (no normal branching flagged as conflict)" },
  { category: "Clarification / contradiction detection quality", label: "Each candidate includes real evidence for both claims" },
  { category: "Clarification / contradiction detection quality", label: "Language is calm and non-accusatory throughout" },
  { category: "Clarification / contradiction detection quality", label: "Suggested clarification questions are useful and natural" },
  { category: "Clarification / contradiction detection quality", label: "No duplicate candidates for the same underlying tension" },

  { category: "Conversation state / speaker role quality", label: "Facilitator questions were distinguished from stakeholder facts" },
  { category: "Conversation state / speaker role quality", label: "Facilitator questions influenced focus/priority appropriately" },
  { category: "Conversation state / speaker role quality", label: "Facilitator hypotheses did not become confirmed facts without stakeholder support" },
  { category: "Conversation state / speaker role quality", label: "Long answers produced multiple useful topic signals, not just the last sentence" },
  { category: "Conversation state / speaker role quality", label: "Glossed-over topics remained in Still to explore" },
  { category: "Conversation state / speaker role quality", label: "No duplicate/noisy Still-to-explore threads were created" },
  { category: "Conversation state / speaker role quality", label: "Suggested directions followed the current focus/topic" },

  { category: "Demo readiness", label: "User can navigate without typing URLs" },
  { category: "Demo readiness", label: "The workflow is understandable" },
  { category: "Demo readiness", label: "The review is useful" },
  { category: "Demo readiness", label: "The demo tells a coherent story" },
];

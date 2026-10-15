import type { FieldTest } from "@/lib/types/database";

const SCORE_FIELDS = [
  "helped_ask_better_questions",
  "reduced_missed_followups",
  "improved_workflow_understanding",
  "stayed_non_distracting",
  "evidence_trustworthy",
  "applied_ai_judgment_useful",
  "overall_usefulness",
] as const satisfies readonly (keyof FieldTest)[];

export interface FieldTestSummary {
  /** Mean of whichever of the 7 rubric scores are actually set - null if none are. */
  averageScore: number | null;
  /** How many of the 7 rubric scores have been filled in. */
  scoredCount: number;
  /**
   * True when this field test's own signal says the product needs work
   * before the next iteration - either the facilitator said so directly
   * (success_decision) or the scores themselves are lukewarm. Never
   * derived from AI output; purely the facilitator's own entered data.
   */
  needsNextIteration: boolean;
}

/**
 * Lightweight, deterministic derived state for a single field test - no AI,
 * no DB access. Shared by the Review page's field-test section (Part D)
 * and the /pilot dashboard aggregation (Part E) so the two can never
 * disagree about what "needs next iteration" means.
 */
export function computeFieldTestSummary(fieldTest: Pick<FieldTest, (typeof SCORE_FIELDS)[number] | "success_decision">): FieldTestSummary {
  const scores = SCORE_FIELDS.map((key) => fieldTest[key]).filter((v): v is number => v !== null);
  const averageScore = scores.length > 0 ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null;

  const needsNextIteration =
    fieldTest.success_decision === "weak_signal" ||
    fieldTest.success_decision === "mixed_signal" ||
    (averageScore !== null && averageScore < 3);

  return { averageScore, scoredCount: scores.length, needsNextIteration };
}

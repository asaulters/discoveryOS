import type { ConfidenceLevel } from "@/lib/types/database";

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["unclear", "emerging", "likely", "confirmed"];

export function isHigherConfidence(candidate: ConfidenceLevel, current: ConfidenceLevel): boolean {
  return CONFIDENCE_ORDER.indexOf(candidate) > CONFIDENCE_ORDER.indexOf(current);
}

/** True if candidate sits strictly below current on the ordinal scale - used to stop a later AI run from lowering a human-verified item's confidence. */
export function isConfidenceDowngrade(candidate: ConfidenceLevel, current: ConfidenceLevel): boolean {
  return CONFIDENCE_ORDER.indexOf(candidate) < CONFIDENCE_ORDER.indexOf(current);
}

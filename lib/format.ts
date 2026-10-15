/** Words that should render as a fixed acronym instead of title-case (e.g. "ai" -> "AI", not "Ai") - checked case-insensitively. */
const ACRONYM_WORDS: Record<string, string> = { ai: "AI" };

/** "automation_discovery" -> "Automation Discovery", "applied_ai_discovery" -> "Applied AI Discovery" - for rendering enum-like DB values (meeting_type, discovery_strategy, status, ...) as readable labels. */
export function formatEnumLabel(value: string): string {
  return value
    .split("_")
    .map((word) => ACRONYM_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

import type { RecordingMode } from "@/lib/types/database";

/**
 * Sprint 18: shared copy/labels for the Pilot Readiness UI (Brief, Live HUD,
 * Review pages) so the three surfaces never drift out of sync. No Supabase
 * import here - safe to use from client components.
 */

export const RECORDING_MODE_OPTIONS: { value: RecordingMode; label: string }[] = [
  { value: "manual_transcript", label: "Manual transcript" },
  { value: "browser_mic", label: "Browser microphone" },
  { value: "mixed", label: "Mixed (manual + browser mic)" },
  { value: "none", label: "None yet" },
];

export function recordingModeLabel(mode: RecordingMode | null): string {
  if (!mode) return "Not selected";
  return RECORDING_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? mode;
}

export const CONSENT_DISCLOSURE_COPY =
  "DiscoveryOS can capture microphone audio or manual transcript text to help " +
  "summarize the process and suggest follow-up questions. Please confirm " +
  "participants are aware and have agreed before using live capture. Browser " +
  "microphone capture may not capture remote meeting participants reliably.";

export const CONSENT_DISCLOSURE_BULLETS = [
  "Live capture is browser-microphone only - it does not connect to Zoom, Teams, or any other call system.",
  "Remote/dial-in participant audio is not reliably captured by a browser microphone.",
  "The transcript (manual or captured) is the source of truth, not any AI summary.",
  "AI outputs are working interpretations, not verified facts.",
  "Human review is required before using any output externally.",
];

export const CONSENT_DISCLOSURE_DISCLAIMER =
  "This is usage guidance, not a legal compliance tool. It does not constitute legal advice and does not guarantee compliance with recording/consent laws in your jurisdiction.";

export interface ChecklistItem {
  key: string;
  label: string;
}

export const PRE_MEETING_CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "participants_aware", label: "Participants know live capture/manual transcript may be used" },
  { key: "goal_strategy_reviewed", label: "Goal and discovery strategy reviewed" },
  { key: "demo_mode_off", label: "Scenario/demo mode off if real meeting" },
  { key: "manual_fallback_ready", label: "Manual transcript fallback ready" },
];

export const POST_MEETING_CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "review_generated", label: "Review generated" },
  { key: "process_checked", label: "Process so far checked" },
  { key: "evidence_spot_checked", label: "Evidence spot-checked" },
  { key: "corrections_added", label: "Human corrections added where needed" },
  { key: "followups_captured", label: "Open follow-ups captured" },
  { key: "export_reviewed", label: "Export/share output reviewed" },
  { key: "issues_documented", label: "Issues observed documented" },
  { key: "safe_for_notes", label: "Meeting safe to use for notes/follow-up" },
];

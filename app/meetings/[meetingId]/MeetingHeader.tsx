import Link from "next/link";
import { formatEnumLabel } from "@/lib/format";
import type { Meeting, MeetingStatus } from "@/lib/types/database";
import { MeetingModeBadges } from "./MeetingModeBadges";

/**
 * Sprint 21: shared header for every meeting-scoped page (Brief/Live/
 * Workflow/Review/Evaluate) so they read as parts of one meeting rather
 * than unrelated screens - same name/type/strategy/status/badges, same
 * tab order, every time. Share and Debug intentionally don't use this:
 * Share is meant to look like a clean, external document, not an app
 * screen with internal navigation; Debug keeps its own visually-distinct
 * dev-tool header (see debug/page.tsx) precisely so it never reads as a
 * primary surface.
 */

export type MeetingTabSegment = "brief" | "live" | "workflow" | "review" | "share" | "evaluate";

const TABS: { segment: MeetingTabSegment; label: string }[] = [
  { segment: "brief", label: "Brief" },
  { segment: "live", label: "Live" },
  { segment: "workflow", label: "Workflow" },
  { segment: "review", label: "Review" },
  { segment: "share", label: "Share" },
  { segment: "evaluate", label: "Evaluate" },
];

function statusBadgeStyles(status: MeetingStatus): string {
  switch (status) {
    case "live":
      return "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400";
    case "completed":
      return "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400";
    case "archived":
      return "border-neutral-300 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500";
    default:
      // prepared, paused
      return "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400";
  }
}

export default function MeetingHeader({
  meeting,
  pilotMode,
  active,
  purpose,
}: {
  meeting: Meeting;
  pilotMode: boolean;
  active: MeetingTabSegment | "debug";
  /** One-sentence "what is this page for" line - Sprint 21 Part D. */
  purpose?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{meeting.name}</h1>
            <MeetingModeBadges scenarioId={meeting.scenario_id} pilotMode={pilotMode} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
            {meeting.company && (
              <>
                <span>{meeting.company}</span>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
              </>
            )}
            <span>{formatEnumLabel(meeting.meeting_type)}</span>
            {meeting.discovery_strategy && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span>{formatEnumLabel(meeting.discovery_strategy)}</span>
              </>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${statusBadgeStyles(meeting.status)}`}
        >
          {meeting.status}
        </span>
      </div>

      {purpose && (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{purpose}</p>
      )}

      <nav className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-200 pb-2 text-sm dark:border-neutral-800">
        {TABS.map((tab) => (
          <Link
            key={tab.segment}
            href={`/meetings/${meeting.id}/${tab.segment}`}
            className={
              active === tab.segment
                ? "font-semibold text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }
          >
            {tab.label}
          </Link>
        ))}
        {/* Debug stays reachable but visually secondary - muted even when active, pushed to the far side instead of sitting level with the primary tabs. */}
        <Link
          href={`/meetings/${meeting.id}/debug`}
          title="Inspect raw state and AI runs for troubleshooting"
          className={
            active === "debug"
              ? "ml-auto text-neutral-500 dark:text-neutral-400"
              : "ml-auto text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
          }
        >
          Debug
        </Link>
      </nav>
    </div>
  );
}

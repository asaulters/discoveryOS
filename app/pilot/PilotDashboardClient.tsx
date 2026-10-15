"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  PilotDashboardSummary,
  PilotIssueSummary,
  PilotMeetingSummary,
  PilotPostMeetingStatus,
  PilotReadinessStatus,
} from "@/lib/services/pilotDashboard";
import type { FieldTestDashboardSummary, FieldTestWithMeetingName } from "@/lib/services/fieldTests";
import { computeFieldTestSummary } from "@/lib/fieldTestSummary";
import type {
  FieldTest,
  FieldTestSuccessDecision,
  PilotIssueCategory,
  PilotIssueSeverity,
  PilotIssueStatus,
  RecordingMode,
  RemoteCaptureSetup,
} from "@/lib/types/database";
import { RECORDING_MODE_OPTIONS, recordingModeLabel } from "@/lib/pilotReadinessConstants";
import { ISSUE_CATEGORY_LABELS } from "@/lib/pilotIssueCategories";
import {
  PILOT_ISSUE_SEVERITY_OPTIONS,
  PILOT_ISSUE_SEVERITY_STYLES,
  PILOT_ISSUE_STATUS_LABELS,
  PILOT_ISSUE_STATUS_STYLES,
} from "@/lib/pilotIssueConstants";
import { ScenarioBadge } from "../meetings/[meetingId]/MeetingModeBadges";

/** Sprint 32: short labels for the capture-quality summary row - same setups as RemoteCaptureSetupPanel/FieldTestDebriefSection, just condensed for a one-line breakdown. */
const CAPTURE_SETUP_LABELS: Record<RemoteCaptureSetup, string> = {
  browser_mic_room_audio: "Browser mic (in-room)",
  blackhole_virtual_audio: "BlackHole/virtual routing",
  two_laptop_external_mic: "Two laptops + external mic",
  two_laptop_builtin_mic: "Two laptops + built-in mic",
  same_laptop_speakers: "Same laptop + speakers",
  manual_notes_primary: "Manual notes only",
  unknown: "Unknown",
};

const MEETING_LINKS = [
  { segment: "brief", label: "Brief" },
  { segment: "live", label: "Live" },
  { segment: "review", label: "Review" },
  { segment: "share", label: "Share" },
  { segment: "evaluate", label: "Evaluate" },
  { segment: "debug", label: "Debug" },
] as const;

const ISSUE_LINKS = [
  { segment: "review", label: "Review" },
  { segment: "debug", label: "Debug" },
  { segment: "share", label: "Share" },
] as const;

type QuickFilter = "all" | "has_issues" | "has_followups" | "missing_consent" | "incomplete_post";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "has_issues", label: "Has issues" },
  { key: "has_followups", label: "Has follow-ups" },
  { key: "missing_consent", label: "Missing consent" },
  { key: "incomplete_post", label: "Incomplete post-meeting checklist" },
];

const ISSUE_STATUS_FILTERS: { key: PilotIssueStatus | "all"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];

const CATEGORY_OPTIONS = Object.entries(ISSUE_CATEGORY_LABELS) as [PilotIssueCategory, string][];

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(fraction: number | null): string {
  if (fraction === null) return "—";
  return `${Math.round(fraction * 100)}%`;
}

function formatScore(score: number | null): string {
  return score === null ? "—" : `${score.toFixed(1)} / 5`;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
    </div>
  );
}

function YesNoChip({ ok, yesLabel, noLabel }: { ok: boolean; yesLabel: string; noLabel: string }) {
  return (
    <span
      className={
        ok
          ? "rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
          : "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
      }
    >
      {ok ? yesLabel : noLabel}
    </span>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function ReadinessBadge({ status }: { status: PilotReadinessStatus }) {
  const styles: Record<PilotReadinessStatus, string> = {
    ready: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    incomplete: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    missing_consent: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
    missing_limitations: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  const labels: Record<PilotReadinessStatus, string> = {
    ready: "Ready",
    incomplete: "Incomplete",
    missing_consent: "Missing consent",
    missing_limitations: "Missing limitations",
  };
  return <Badge label={labels[status]} className={styles[status]} />;
}

const SUCCESS_DECISION_STYLES: Record<FieldTestSuccessDecision, string> = {
  strong_signal: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
  mixed_signal: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  weak_signal: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  not_enough_data: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
};
const SUCCESS_DECISION_LABELS: Record<FieldTestSuccessDecision, string> = {
  strong_signal: "Strong signal",
  mixed_signal: "Mixed signal",
  weak_signal: "Weak signal",
  not_enough_data: "Not enough data",
};

/** Sprint 28 Part E: a compact per-meeting-row indicator - only rendered when a field_tests row exists for that meeting, and only ever reflects the facilitator's own entered status/decision, never AI output. */
function FieldTestBadge({ fieldTest }: { fieldTest: FieldTest }) {
  if (fieldTest.success_decision) {
    return (
      <Badge
        label={`Field test: ${SUCCESS_DECISION_LABELS[fieldTest.success_decision]}`}
        className={SUCCESS_DECISION_STYLES[fieldTest.success_decision]}
      />
    );
  }
  return (
    <Badge
      label={`Field test: ${fieldTest.status}`}
      className="border-neutral-300 text-neutral-500 dark:border-neutral-700"
    />
  );
}

function PostMeetingBadge({ status }: { status: PilotPostMeetingStatus }) {
  const styles: Record<PilotPostMeetingStatus, string> = {
    complete: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    incomplete: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    not_started: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
  };
  const labels: Record<PilotPostMeetingStatus, string> = {
    complete: "Complete",
    incomplete: "Incomplete",
    not_started: "Not started",
  };
  return <Badge label={labels[status]} className={styles[status]} />;
}

function IssueCategoryChips({ meeting }: { meeting: PilotMeetingSummary }) {
  if (meeting.issueCategories.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {meeting.issueCategories.map((category) => (
        <span
          key={category}
          className="rounded-full border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
        >
          {ISSUE_CATEGORY_LABELS[category]}
        </span>
      ))}
    </div>
  );
}

function MeetingLinks({ meetingId }: { meetingId: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {MEETING_LINKS.map((link) => (
        <Link
          key={link.segment}
          href={`/meetings/${meetingId}/${link.segment}`}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function TrackedIssueLinks({ meetingId }: { meetingId: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {ISSUE_LINKS.map((link) => (
        <Link
          key={link.segment}
          href={`/meetings/${meetingId}/${link.segment}`}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

/** Why a meeting showed up in "Meetings needing attention" - short, plain-language reasons, not a repeat of every badge. */
function attentionReasons(m: PilotMeetingSummary): string[] {
  const reasons: string[] = [];
  if (m.readinessStatus === "missing_consent") reasons.push("Consent not confirmed");
  if (m.readinessStatus === "missing_limitations") reasons.push("Limitations not acknowledged");
  if (m.readinessStatus === "incomplete") reasons.push("Pre-meeting checklist incomplete");
  if (m.postMeetingStatus === "incomplete") reasons.push("Post-meeting checklist incomplete");
  if (m.hasIssues) reasons.push("Issues observed");
  if (m.hasFollowupActions) reasons.push("Open follow-ups");
  return reasons;
}

export default function PilotDashboardClient({
  meetings,
  issues,
  summary,
  fieldTests,
  fieldTestSummary,
}: {
  meetings: PilotMeetingSummary[];
  issues: PilotIssueSummary[];
  summary: PilotDashboardSummary;
  fieldTests: FieldTestWithMeetingName[];
  fieldTestSummary: FieldTestDashboardSummary;
}) {
  const fieldTestByMeetingId = useMemo(() => new Map(fieldTests.map((f) => [f.meeting_id, f])), [fieldTests]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [recordingModeFilter, setRecordingModeFilter] = useState<RecordingMode | "all">("all");

  // Defaults to "open" (not "all") so this section reads as "Open tracked
  // issues" out of the box - resolved/dismissed stay one click away via
  // the same filter, never removed from the page.
  const [issueStatusFilter, setIssueStatusFilter] = useState<PilotIssueStatus | "all">("open");
  const [issueCategoryFilter, setIssueCategoryFilter] = useState<PilotIssueCategory | "all">("all");
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<PilotIssueSeverity | "all">("all");

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (recordingModeFilter !== "all" && m.recordingMode !== recordingModeFilter) return false;
      switch (quickFilter) {
        case "has_issues":
          return m.hasIssues;
        case "has_followups":
          return m.hasFollowupActions;
        case "missing_consent":
          return !m.consentConfirmed;
        case "incomplete_post":
          return m.postMeetingStatus !== "complete";
        default:
          return true;
      }
    });
  }, [meetings, quickFilter, recordingModeFilter]);

  const issuesObservedList = useMemo(
    () => filteredMeetings.filter((m) => m.hasIssues),
    [filteredMeetings]
  );
  const followupsList = useMemo(
    () => filteredMeetings.filter((m) => m.hasFollowupActions),
    [filteredMeetings]
  );

  const needsAttentionList = useMemo(
    () =>
      meetings.filter(
        (m) =>
          m.readinessStatus !== "ready" ||
          m.postMeetingStatus === "incomplete" ||
          m.hasIssues ||
          m.hasFollowupActions
      ),
    [meetings]
  );

  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (issueStatusFilter !== "all" && i.status !== issueStatusFilter) return false;
      if (issueCategoryFilter !== "all" && i.category !== issueCategoryFilter) return false;
      if (issueSeverityFilter !== "all" && i.severity !== issueSeverityFilter) return false;
      return true;
    });
  }, [issues, issueStatusFilter, issueCategoryFilter, issueSeverityFilter]);

  const categorySummary = useMemo(() => {
    const counts = new Map<PilotIssueCategory, { openCount: number; highCriticalCount: number }>();
    for (const issue of filteredIssues) {
      if (issue.status !== "open") continue;
      const entry = counts.get(issue.category) ?? { openCount: 0, highCriticalCount: 0 };
      entry.openCount += 1;
      if (issue.severity === "high" || issue.severity === "critical") entry.highCriticalCount += 1;
      counts.set(issue.category, entry);
    }
    return Array.from(counts.entries())
      .map(([category, counts]) => ({ category, ...counts }))
      .sort((a, b) => b.openCount - a.openCount);
  }, [filteredIssues]);

  if (meetings.length === 0 && issues.length === 0 && fieldTests.length === 0) {
    return (
      <div className="mt-10 rounded border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
        <p className="text-sm text-neutral-500">No pilot meetings yet.</p>
        <p className="mt-1 text-xs text-neutral-400">
          Mark a meeting as a pilot from its Brief page to see it here, or complete a field-test
          debrief from a meeting&apos;s Review page.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-10">
      {/* 1. Pilot summary */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Pilot meetings" value={String(summary.pilotMeetingCount)} />
          <SummaryCard label="Ready meetings" value={String(summary.readyCount)} />
          <SummaryCard label="Meetings with issues" value={String(summary.meetingsWithIssuesCount)} />
          <SummaryCard label="Open follow-ups" value={String(summary.openFollowupCount)} />
          <SummaryCard label="Avg pre-checklist" value={formatPercent(summary.avgPreChecklistCompletion)} />
          <SummaryCard label="Avg post-checklist" value={formatPercent(summary.avgPostChecklistCompletion)} />
          <SummaryCard label="Open tracked issues" value={String(summary.openTrackedIssueCount)} />
          <SummaryCard label="High/critical issues" value={String(summary.highOrCriticalOpenIssueCount)} />
          <SummaryCard label="Resolved issues" value={String(summary.resolvedIssueCount)} />
          <SummaryCard label="Meetings with open issues" value={String(summary.meetingsWithOpenIssuesCount)} />
        </div>
      </section>

      {/* Field tests (Sprint 28) - deliberately its own small section, not merged into the pilot summary grid above, so it never crowds out tracked pilot issues. */}
      <section>
        <SectionHeading
          title="Field tests"
          subtitle="Real applied-AI field-test debriefs logged from meetings' Review pages. See docs/real-applied-ai-field-test-guide.md."
        />
        {fieldTests.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            No field tests logged yet. Complete a field-test debrief from a meeting&apos;s Review
            page to see it here.
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryCard label="Field tests completed" value={String(fieldTestSummary.completedCount)} />
              <SummaryCard label="Strong signals" value={String(fieldTestSummary.strongSignalCount)} />
              <SummaryCard label="Mixed/weak signals" value={String(fieldTestSummary.mixedOrWeakSignalCount)} />
              <SummaryCard label="Avg overall usefulness" value={formatScore(fieldTestSummary.avgOverallUsefulness)} />
              <SummaryCard label="Needing next iteration" value={String(fieldTestSummary.needingNextIterationCount)} />
            </div>

            {/* Sprint 32 Part G: capture-quality summary - only shown once at least one field test has actually recorded a capture setup, so an all-in-person history doesn't show a row of empty stats. Deliberately its own small row, not merged into the 5 cards above, so remote-specific and general field-test signal stay easy to tell apart. */}
            {fieldTestSummary.remoteTestsCompletedCount > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Capture quality (remote calls)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <SummaryCard label="Remote tests completed" value={String(fieldTestSummary.remoteTestsCompletedCount)} />
                  <SummaryCard label="Avg transcript usefulness" value={formatScore(fieldTestSummary.avgTranscriptUsefulness)} />
                  <SummaryCard label="High manual-notes need" value={String(fieldTestSummary.highManualNotesNeedCount)} />
                </div>
                {Object.keys(fieldTestSummary.captureSetupsUsed).length > 0 && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Setups used:{" "}
                    {Object.entries(fieldTestSummary.captureSetupsUsed)
                      .map(([setup, count]) => `${CAPTURE_SETUP_LABELS[setup as RemoteCaptureSetup] ?? setup} (${count})`)
                      .join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950">
                  <tr>
                    <th className="px-4 py-2 font-medium">Meeting</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Success decision</th>
                    <th className="px-4 py-2 font-medium">Overall usefulness</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                    <th className="px-4 py-2 font-medium">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldTests.map((ft) => {
                    const ftSummary = computeFieldTestSummary(ft);
                    return (
                      <tr key={ft.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                        <td className="px-4 py-3 font-medium">{ft.meetingName}</td>
                        <td className="px-4 py-3 capitalize text-neutral-600 dark:text-neutral-400">{ft.status}</td>
                        <td className="px-4 py-3">
                          {ft.success_decision ? (
                            <Badge
                              label={SUCCESS_DECISION_LABELS[ft.success_decision]}
                              className={SUCCESS_DECISION_STYLES[ft.success_decision]}
                            />
                          ) : (
                            <span className="text-neutral-400">Not decided</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                          {formatScore(ft.overall_usefulness)}
                          {ftSummary.needsNextIteration && (
                            <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                              needs next iteration
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">{formatDate(ft.updated_at)}</td>
                        <td className="px-4 py-3">
                          <MeetingLinks meetingId={ft.meeting_id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 2. Open tracked issues */}
      <section>
        <SectionHeading
          title="Tracked pilot issues"
          subtitle="Lightweight open/resolved/dismissed tracking, created manually from each meeting's Review page. Not a ticketing system."
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {ISSUE_STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setIssueStatusFilter(f.key)}
                className={
                  issueStatusFilter === f.key
                    ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={issueCategoryFilter}
            onChange={(e) => setIssueCategoryFilter(e.target.value as PilotIssueCategory | "all")}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="all">All categories</option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={issueSeverityFilter}
            onChange={(e) => setIssueSeverityFilter(e.target.value as PilotIssueSeverity | "all")}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="all">All severities</option>
            {PILOT_ISSUE_SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {categorySummary.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {categorySummary.map(({ category, openCount, highCriticalCount }) => (
              <li
                key={category}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
              >
                {ISSUE_CATEGORY_LABELS[category]}: {openCount} open
                {highCriticalCount > 0 ? ` (${highCriticalCount} high/critical)` : ""}
              </li>
            ))}
          </ul>
        )}

        {issues.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            Create tracked issues from a meeting Review page when pilot feedback needs follow-up.
          </p>
        ) : filteredIssues.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No tracked issues match this filter.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Issue</th>
                  <th className="px-4 py-2 font-medium">Meeting</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.map((issue) => (
                  <tr
                    key={issue.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{issue.title}</div>
                      {issue.description && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {truncate(issue.description, 140)}
                        </p>
                      )}
                      {issue.status !== "open" && issue.resolutionNote && (
                        <p className="mt-0.5 text-xs italic text-neutral-400">
                          {PILOT_ISSUE_STATUS_LABELS[issue.status]}: {truncate(issue.resolutionNote, 140)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {issue.meetingName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={ISSUE_CATEGORY_LABELS[issue.category]}
                        className="border-neutral-300 text-neutral-500 dark:border-neutral-700"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={PILOT_ISSUE_SEVERITY_OPTIONS.find((o) => o.value === issue.severity)?.label ?? issue.severity}
                        className={PILOT_ISSUE_SEVERITY_STYLES[issue.severity]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={PILOT_ISSUE_STATUS_LABELS[issue.status]}
                        className={PILOT_ISSUE_STATUS_STYLES[issue.status]}
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(issue.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <TrackedIssueLinks meetingId={issue.meetingId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Meetings needing attention - a curated subset, not the full table (that's at the bottom). */}
      <section>
        <SectionHeading
          title="Meetings needing attention"
          subtitle="Missing consent/limitations, incomplete checklists, or open issues/follow-ups."
        />
        {needsAttentionList.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">
            Nothing needs attention right now - every pilot meeting is ready or fully wrapped up.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {needsAttentionList.map((m) => (
              <li
                key={m.id}
                className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/meetings/${m.id}/review`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {m.name}
                    </Link>
                    {m.scenarioId && <ScenarioBadge />}
                    <ReadinessBadge status={m.readinessStatus} />
                  </div>
                  <span className="text-xs text-neutral-400">{formatDate(m.updatedAt)}</span>
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">
                  {attentionReasons(m).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Raw issues observed */}
      <section>
        <SectionHeading title="Issues observed" subtitle="Raw free-text pilot notes, not tracked issues." />
        {issuesObservedList.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No issues observed.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {issuesObservedList.map((m) => (
              <li
                key={m.id}
                className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/meetings/${m.id}/review`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {m.name}
                  </Link>
                  <span className="text-xs text-neutral-400">{formatDate(m.updatedAt)}</span>
                </div>
                <div className="mt-1.5">
                  <IssueCategoryChips meeting={m} />
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                  {truncate(m.issuesObserved ?? "", 220)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5. Open follow-up actions */}
      <section>
        <SectionHeading title="Open follow-up actions" />
        {followupsList.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No open follow-ups.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {followupsList.map((m) => (
              <li
                key={m.id}
                className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/meetings/${m.id}/review`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {m.name}
                  </Link>
                  <span className="text-xs text-neutral-400">{formatDate(m.updatedAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
                  {truncate(m.followupActions ?? "", 220)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6. All pilot meetings - the full table, filterable, intentionally last. */}
      <section>
        <SectionHeading title="All pilot meetings" />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setQuickFilter(f.key)}
                className={
                  quickFilter === f.key
                    ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={recordingModeFilter}
            onChange={(e) => setRecordingModeFilter(e.target.value as RecordingMode | "all")}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="all">All recording modes</option>
            {RECORDING_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Meeting</th>
                <th className="px-4 py-2 font-medium">Recording mode</th>
                <th className="px-4 py-2 font-medium">Consent</th>
                <th className="px-4 py-2 font-medium">Limitations</th>
                <th className="px-4 py-2 font-medium">Pre-checklist</th>
                <th className="px-4 py-2 font-medium">Post-checklist</th>
                <th className="px-4 py-2 font-medium">Issues</th>
                <th className="px-4 py-2 font-medium">Follow-ups</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeetings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-neutral-400">
                    No meetings match this filter.
                  </td>
                </tr>
              ) : (
                filteredMeetings.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {m.scenarioId && <ScenarioBadge />}
                        <ReadinessBadge status={m.readinessStatus} />
                        {fieldTestByMeetingId.has(m.id) && (
                          <FieldTestBadge fieldTest={fieldTestByMeetingId.get(m.id)!} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {recordingModeLabel(m.recordingMode)}
                    </td>
                    <td className="px-4 py-3">
                      <YesNoChip ok={m.consentConfirmed} yesLabel="Confirmed" noLabel="Not confirmed" />
                    </td>
                    <td className="px-4 py-3">
                      <YesNoChip
                        ok={m.knownLimitationsAcknowledged}
                        yesLabel="Acknowledged"
                        noLabel="Not acknowledged"
                      />
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {m.preChecklistCompleteCount}/{m.preChecklistTotalCount}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-600 dark:text-neutral-400">
                          {m.postChecklistCompleteCount}/{m.postChecklistTotalCount}
                        </span>
                        <PostMeetingBadge status={m.postMeetingStatus} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <IssueCategoryChips meeting={m} />
                    </td>
                    <td className="px-4 py-3">
                      {m.hasFollowupActions ? (
                        <span className="text-amber-600 dark:text-amber-400">Yes</span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(m.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <MeetingLinks meetingId={m.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

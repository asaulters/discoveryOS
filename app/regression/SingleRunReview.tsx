"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  classifyRegressionCheck,
  groupRegressionChecks,
  type ClassifiedRegressionCheck,
} from "@/lib/services/regressionReviewClassify";
import type { RegressionCheck, RegressionRun } from "@/lib/types/database";
import { ResultBadge, SeverityBadge, formatTimestamp, inspectionHref, inspectionLabel } from "./ReviewBadges";

const MEETING_LINKS = [
  { segment: "workflow", label: "Workflow" },
  { segment: "review", label: "Review" },
  { segment: "share", label: "Share" },
  { segment: "evaluate", label: "Evaluate" },
  { segment: "debug", label: "Debug" },
] as const;

type ShowFilter = "all" | "needs_attention" | "fails" | "warnings" | "passes";
type GroupBy = "reviewGroup" | "category";

const SHOW_FILTERS: { key: ShowFilter; label: string }[] = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "fails", label: "Fails only" },
  { key: "warnings", label: "Warnings only" },
  { key: "passes", label: "Passes only" },
];

function matchesShowFilter(check: ClassifiedRegressionCheck, filter: ShowFilter): boolean {
  switch (filter) {
    case "needs_attention":
      return check.result !== "pass";
    case "fails":
      return check.result === "fail";
    case "warnings":
      return check.result === "warn";
    case "passes":
      return check.result === "pass";
    default:
      return true;
  }
}

function CheckRow({ check, meetingId }: { check: ClassifiedRegressionCheck; meetingId: string }) {
  const href = inspectionHref(check.suggestedInspectionTarget, meetingId);
  return (
    <li
      className={`rounded border p-3 text-sm ${
        check.result === "fail"
          ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
          : check.result === "warn"
            ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
            : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ResultBadge result={check.result} />
        <SeverityBadge severity={check.severity} />
        <span className="font-medium">{check.check}</span>
        <span className="text-xs text-neutral-400">({check.category})</span>
      </div>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{check.likelyMeaning}</p>
      {(check.expected || check.actual) && (
        <div className="mt-1.5 grid gap-1 text-xs text-neutral-500 sm:grid-cols-2">
          {check.expected && (
            <div>
              <span className="font-medium text-neutral-400">Expected: </span>
              {check.expected}
            </div>
          )}
          {check.actual && (
            <div>
              <span className="font-medium text-neutral-400">Actual: </span>
              {check.actual}
            </div>
          )}
        </div>
      )}
      {check.friendlyNotes && (
        <p className="mt-1.5 text-xs text-neutral-700 dark:text-neutral-300">{check.friendlyNotes}</p>
      )}
      {check.notes && !check.friendlyNotes && (
        <p className="mt-1.5 text-xs italic text-neutral-500">{check.notes}</p>
      )}
      {href && (
        <Link
          href={href}
          className="mt-1.5 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Inspect on {inspectionLabel(check.suggestedInspectionTarget)} →
        </Link>
      )}
    </li>
  );
}

export default function SingleRunReview({
  run,
  checks,
  meetingId,
  meetingName,
  meetingExists,
  scenarioName,
  detailHref,
}: {
  run: RegressionRun;
  checks: RegressionCheck[];
  meetingId: string;
  meetingName: string | null;
  meetingExists: boolean;
  scenarioName: string | null;
  detailHref?: string;
}) {
  const [showFilter, setShowFilter] = useState<ShowFilter>("needs_attention");
  const [groupBy, setGroupBy] = useState<GroupBy>("reviewGroup");
  const [passedOpen, setPassedOpen] = useState(false);
  const [showRawTable, setShowRawTable] = useState(false);

  const classified = useMemo(() => checks.map((c) => classifyRegressionCheck(c)), [checks]);
  const groupedByMeaning = useMemo(() => groupRegressionChecks(classified), [classified]);
  // "Group by original category" is a plain string grouping, not the fixed
  // ReviewGroup taxonomy groupRegressionChecks uses - a raw category like
  // "Process so far - steps" isn't one of the 10 canonical review groups,
  // so reusing that function here would silently drop every check (none of
  // them would match REVIEW_GROUPS). Grouped locally instead, same
  // fail-before-warn-before-pass ordering within each group.
  const groupedByCategory = useMemo(() => {
    const byCategory = new Map<string, ClassifiedRegressionCheck[]>();
    for (const check of classified) {
      const bucket = byCategory.get(check.category) ?? [];
      bucket.push(check);
      byCategory.set(check.category, bucket);
    }
    const resultOrder: Record<ClassifiedRegressionCheck["result"], number> = { fail: 0, warn: 1, pass: 2 };
    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, categoryChecks]) => {
        const sorted = [...categoryChecks].sort((a, b) => resultOrder[a.result] - resultOrder[b.result]);
        return {
          reviewGroup: category,
          checks: sorted,
          failCount: sorted.filter((c) => c.result === "fail").length,
          warnCount: sorted.filter((c) => c.result === "warn").length,
          passCount: sorted.filter((c) => c.result === "pass").length,
        };
      });
  }, [classified]);
  const grouped = groupBy === "reviewGroup" ? groupedByMeaning : groupedByCategory;

  const filtered = useMemo(
    () =>
      grouped
        .map((g) => ({ ...g, checks: g.checks.filter((c) => matchesShowFilter(c, showFilter)) }))
        .filter((g) => g.checks.length > 0),
    [grouped, showFilter]
  );

  const passCount = classified.filter((c) => c.result === "pass").length;
  const warnCount = classified.filter((c) => c.result === "warn").length;
  const failCount = classified.filter((c) => c.result === "fail").length;
  const passedChecks = classified.filter((c) => c.result === "pass");

  return (
    <div className="space-y-4">
      {/* 1. Summary strip */}
      <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <ResultBadge result={run.overall_result} />
          <span className="text-sm font-medium">{classified.length} checks</span>
          <span className="text-xs text-neutral-500">
            {passCount} pass · {warnCount} warn · {failCount} fail
          </span>
          <span className="text-xs text-neutral-400">{formatTimestamp(run.created_at)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <span>
            Scenario: <span className="font-medium text-neutral-700 dark:text-neutral-300">{scenarioName ?? run.scenario_id}</span>
          </span>
          <span className="text-neutral-300 dark:text-neutral-700">|</span>
          {meetingExists ? (
            <>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{meetingName}</span>
              {MEETING_LINKS.map((link) => (
                <Link
                  key={link.segment}
                  href={`/meetings/${meetingId}/${link.segment}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {link.label}
                </Link>
              ))}
            </>
          ) : (
            <span className="italic text-neutral-400">Linked meeting no longer exists</span>
          )}
          {detailHref && (
            <Link href={detailHref} className="text-blue-600 hover:underline dark:text-blue-400">
              Open full detail
            </Link>
          )}
        </div>
        {run.summary && <p className="mt-2 text-sm">{run.summary}</p>}
        <p className="mt-2 text-xs text-neutral-400">
          Warnings usually mean expected scenario details were missing, weak, or incomplete. Failures mean a trust,
          evidence, export-safety, or app-pipeline rule broke. A &ldquo;completed&rdquo; run status means the
          pipeline ran end-to-end - it does not mean every check passed.
        </p>
      </div>

      {/* Filters (Part G) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {SHOW_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setShowFilter(f.key)}
              className={
                showFilter === f.key
                  ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="reviewGroup">Group by meaning</option>
          <option value="category">Group by original category</option>
        </select>
        <button
          type="button"
          onClick={() => setShowRawTable((v) => !v)}
          className="ml-auto rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
        >
          {showRawTable ? "Hide raw table" : "Show raw table"}
        </button>
      </div>

      {/* Raw table - the original flat check listing, kept available per Part B */}
      {showRawTable && (
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <tr>
                <th className="py-1.5 px-3 font-medium">Category</th>
                <th className="py-1.5 px-3 font-medium">Check</th>
                <th className="py-1.5 px-3 font-medium">Result</th>
                <th className="py-1.5 px-3 font-medium">Expected</th>
                <th className="py-1.5 px-3 font-medium">Actual</th>
                <th className="py-1.5 px-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id} className="border-b border-neutral-100 align-top last:border-0 dark:border-neutral-900">
                  <td className="py-1.5 px-3 whitespace-nowrap text-neutral-500">{c.category}</td>
                  <td className="py-1.5 px-3">{c.label}</td>
                  <td className="py-1.5 px-3">
                    <ResultBadge result={c.result} />
                  </td>
                  <td className="py-1.5 px-3 text-neutral-600 dark:text-neutral-400">{c.expected ?? "—"}</td>
                  <td className="py-1.5 px-3 text-neutral-600 dark:text-neutral-400">{c.actual ?? "—"}</td>
                  <td className="py-1.5 px-3 text-neutral-400">{c.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showRawTable && (
        <>
          {/* 2. Needs attention (or whatever the current filter shows) */}
          {filtered.length === 0 ? (
            <p className="rounded border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
              {showFilter === "needs_attention" || showFilter === "fails" || showFilter === "warnings"
                ? "Nothing matches this filter - no issues found."
                : "No checks match this filter."}
            </p>
          ) : (
            <div className="space-y-4">
              {filtered.map((group) => (
                <div key={group.reviewGroup}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{group.reviewGroup}</h3>
                    <span className="text-xs text-neutral-400">
                      {group.failCount > 0 && `${group.failCount} fail `}
                      {group.warnCount > 0 && `${group.warnCount} warn `}
                      {showFilter === "all" && group.passCount > 0 && `${group.passCount} pass`}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {group.checks.map((check) => (
                      <CheckRow key={check.id} check={check} meetingId={meetingId} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* 3. Passed checks - collapsed, never crowding out issues */}
          {passedChecks.length > 0 && showFilter === "needs_attention" && (
            <details open={passedOpen} onToggle={(e) => setPassedOpen(e.currentTarget.open)} className="rounded border border-neutral-200 dark:border-neutral-800">
              <summary className="cursor-pointer p-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {passedChecks.length} passed check{passedChecks.length === 1 ? "" : "s"}
              </summary>
              <ul className="space-y-1 px-3 pb-3 text-xs text-neutral-500">
                {passedChecks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <ResultBadge result={c.result} />
                    <span>{c.check}</span>
                    <span className="text-neutral-400">({c.category})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

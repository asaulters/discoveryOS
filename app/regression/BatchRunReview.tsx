"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BatchRegressionReview } from "@/lib/services/regressionReview";
import { formatTimestamp, inspectionHref } from "./ReviewBadges";

const SCENARIO_LINKS = [
  { segment: "review", label: "Review" },
  { segment: "debug", label: "Debug" },
  { segment: "share", label: "Share" },
] as const;

type ScenarioFilter = "needs_attention" | "all" | "failures" | "warnings" | "pipeline_failed" | "clean";

const SCENARIO_FILTERS: { key: ScenarioFilter; label: string }[] = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "failures", label: "With failures" },
  { key: "warnings", label: "With warnings" },
  { key: "pipeline_failed", label: "Pipeline failed" },
  { key: "clean", label: "Clean" },
];

function BatchStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    completed: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    partial: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    failed: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[status] ?? styles.running}`}>
      {status}
    </span>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "border-neutral-300 text-neutral-400 dark:border-neutral-700",
    running: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    completed: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    failed: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function matchesScenarioFilter(scenario: BatchRegressionReview["scenarios"][number], filter: ScenarioFilter): boolean {
  const failCount = scenario.groups?.reduce((sum, g) => sum + g.failCount, 0) ?? 0;
  const warnCount = scenario.groups?.reduce((sum, g) => sum + g.warnCount, 0) ?? 0;
  switch (filter) {
    case "needs_attention":
      return scenario.item.status === "failed" || failCount > 0 || warnCount > 0;
    case "failures":
      return failCount > 0;
    case "warnings":
      return warnCount > 0;
    case "pipeline_failed":
      return scenario.item.status === "failed";
    case "clean":
      return scenario.item.status === "completed" && failCount === 0 && warnCount === 0;
    default:
      return true;
  }
}

export default function BatchRunReview({ review, detailHref }: { review: BatchRegressionReview; detailHref?: string }) {
  const [filter, setFilter] = useState<ScenarioFilter>("needs_attention");
  const { batchRun, scenarios, aggregateGroups } = review;

  const filteredScenarios = useMemo(
    () => scenarios.filter((s) => matchesScenarioFilter(s, filter)),
    [scenarios, filter]
  );

  return (
    <div className="space-y-4">
      {/* 1. Batch summary */}
      <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <BatchStatusBadge status={batchRun.status} />
          <span className="text-xs text-neutral-500">
            {batchRun.scenario_count} scenarios · {batchRun.completed_count} completed · {batchRun.failed_count} pipeline failed
          </span>
          <span className="text-xs text-neutral-500">
            {batchRun.total_pass} pass · {batchRun.total_warn} warn · {batchRun.total_fail} fail
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <span>Started {formatTimestamp(batchRun.started_at)}</span>
          {batchRun.completed_at && <span>Completed {formatTimestamp(batchRun.completed_at)}</span>}
          {detailHref && (
            <Link href={detailHref} className="text-blue-600 hover:underline dark:text-blue-400">
              Open full detail
            </Link>
          )}
        </div>
        {batchRun.error_message && (
          <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {batchRun.error_message}
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          Warnings usually mean expected scenario details were missing, weak, or incomplete. Failures mean a trust,
          evidence, export-safety, or app-pipeline rule broke. A scenario item marked &ldquo;completed&rdquo; means
          the replay/regression pipeline ran end-to-end - it does not mean every quality check passed, so always
          check the fail/warn counts too.
        </p>
      </div>

      {/* Grouped warning/failure summary across the batch */}
      {aggregateGroups.length > 0 && (
        <div className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Across this batch</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {aggregateGroups
              .filter((g) => g.failCount > 0 || g.warnCount > 0)
              .map((g) => (
                <li
                  key={g.reviewGroup}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    g.failCount > 0
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                      : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  }`}
                >
                  {g.reviewGroup}: {g.failCount > 0 ? `${g.failCount} fail` : ""}
                  {g.failCount > 0 && g.warnCount > 0 ? ", " : ""}
                  {g.warnCount > 0 ? `${g.warnCount} warn` : ""}
                </li>
              ))}
            {aggregateGroups.every((g) => g.failCount === 0 && g.warnCount === 0) && (
              <li className="text-xs text-neutral-400">No warnings or failures across the batch.</li>
            )}
          </ul>
        </div>
      )}

      {/* Filters (Part G) */}
      <div className="flex flex-wrap gap-2">
        {SCENARIO_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 3. Scenario result table */}
      {filteredScenarios.length === 0 ? (
        <p className="rounded border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400 dark:border-neutral-700">
          No scenarios match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Scenario</th>
                <th className="px-4 py-2 font-medium">Item status</th>
                <th className="px-4 py-2 font-medium">Checks</th>
                <th className="px-4 py-2 font-medium">Pass</th>
                <th className="px-4 py-2 font-medium">Warn</th>
                <th className="px-4 py-2 font-medium">Fail</th>
                <th className="px-4 py-2 font-medium">Main concern</th>
                <th className="px-4 py-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {filteredScenarios.map((s) => {
                const total = s.item.checks_total;
                const failCount = s.groups?.reduce((sum, g) => sum + g.failCount, 0) ?? 0;
                return (
                  <tr key={s.item.id} className="border-b border-neutral-100 align-top last:border-0 dark:border-neutral-900">
                    <td className="px-4 py-3 font-medium">{s.scenarioName}</td>
                    <td className="px-4 py-3">
                      <ItemStatusBadge status={s.item.status} />
                      {s.item.error_message && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{s.item.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{total}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{s.item.checks_pass}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{s.item.checks_warn}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{s.item.checks_fail}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          failCount > 0
                            ? "text-red-600 dark:text-red-400"
                            : s.mainConcern === "No issues"
                              ? "text-neutral-400"
                              : "text-amber-600 dark:text-amber-400"
                        }
                      >
                        {s.mainConcern}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {s.meetingExists &&
                          SCENARIO_LINKS.map((link) => (
                            <Link
                              key={link.segment}
                              href={inspectionHref(link.segment, s.item.meeting_id) ?? "#"}
                              className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {link.label}
                            </Link>
                          ))}
                        {s.item.regression_run_id && (
                          <Link
                            href={`/regression/runs/${s.item.regression_run_id}`}
                            className="text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Full result
                          </Link>
                        )}
                        {!s.meetingExists && !s.item.regression_run_id && <span className="text-neutral-400">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

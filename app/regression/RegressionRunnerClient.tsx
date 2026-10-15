"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import Link from "next/link";
import { SCENARIOS, getScenarioDisplayLabel } from "@/lib/scenarios";
import type { BatchRegressionReview, SingleRegressionReview } from "@/lib/services/regressionReview";
import type {
  BatchRegressionRun,
  BatchRegressionRunStatus,
  RegressionResult,
  RegressionRun,
  ScenarioReplayRun,
} from "@/lib/types/database";
import SingleRunReview from "./SingleRunReview";
import BatchRunReview from "./BatchRunReview";

export interface EligibleMeeting {
  id: string;
  name: string;
  scenarioId: string;
  scenarioName: string;
}

export interface RecentRunSummary {
  id: string;
  createdAt: string;
  meetingId: string;
  meetingName: string | null;
  scenarioId: string;
  scenarioName: string | null;
  overallResult: RegressionResult;
  status: "completed" | "failed";
}

interface ReplayInfo {
  meetingId: string | null;
  meetingName: string | null;
  status: ScenarioReplayRun["status"];
  chunksSubmitted: number;
  chunkCount: number;
  errorMessage: string | null;
  hasRegressionRun: boolean;
}

const MEETING_LINKS = [
  { segment: "live", label: "Live" },
  { segment: "workflow", label: "Workflow" },
  { segment: "review", label: "Review" },
  { segment: "share", label: "Share" },
  { segment: "evaluate", label: "Evaluate" },
  { segment: "debug", label: "Debug" },
] as const;

// Every scenario is expected to stay small (a handful of chunks), but a
// facilitator picking one with more should get a chance to reconsider
// before real AI calls fire off for each one - see Part E.
const CONFIRM_ABOVE_CHUNK_COUNT = 5;

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResultBadge({ result }: { result: RegressionResult }) {
  const styles: Record<RegressionResult, string> = {
    pass: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    warn: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    fail: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[result]}`}>
      {result}
    </span>
  );
}

function ReplayStatusBadge({ status }: { status: ScenarioReplayRun["status"] }) {
  const styles: Record<ScenarioReplayRun["status"], string> = {
    running: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    completed: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    failed: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

function BatchStatusBadge({ status }: { status: BatchRegressionRunStatus }) {
  const styles: Record<BatchRegressionRunStatus, string> = {
    running: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    completed: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    partial: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    failed: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function RegressionRunnerClient({
  eligibleMeetings,
  initialRecentRuns,
  initialRecentBatchRuns,
}: {
  eligibleMeetings: EligibleMeeting[];
  initialRecentRuns: RecentRunSummary[];
  initialRecentBatchRuns: BatchRegressionRun[];
}) {
  const [selectedMeetingId, setSelectedMeetingId] = useState(eligibleMeetings[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SingleRegressionReview | null>(null);
  const [recentRuns, setRecentRuns] = useState<RecentRunSummary[]>(initialRecentRuns);

  const [selectedScenarioId, setSelectedScenarioId] = useState(SCENARIOS[0]?.id ?? "");
  const [generateReview, setGenerateReview] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayInfo, setReplayInfo] = useState<ReplayInfo | null>(null);

  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(
    () => new Set(SCENARIOS.map((s) => s.id))
  );
  const [batchGenerateReview, setBatchGenerateReview] = useState(false);
  const [batchStopOnFailure, setBatchStopOnFailure] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchRegressionReview | null>(null);
  const [recentBatchRuns, setRecentBatchRuns] = useState<BatchRegressionRun[]>(initialRecentBatchRuns);

  const selectedMeeting = eligibleMeetings.find((m) => m.id === selectedMeetingId) ?? null;
  const selectedScenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? null;
  const busy = running || replaying || batchRunning;

  async function loadRunReview(runId: string): Promise<SingleRegressionReview | null> {
    const response = await fetch(`/api/regression/runs/${runId}/review`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load regression run review");
    }
    return data.review as SingleRegressionReview;
  }

  async function loadBatchRunReview(batchRunId: string): Promise<BatchRegressionReview | null> {
    const response = await fetch(`/api/regression/batch-runs/${batchRunId}/review`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load batch regression run review");
    }
    return data.review as BatchRegressionReview;
  }

  async function refreshRecentRuns() {
    try {
      const response = await fetch("/api/regression/runs", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setRecentRuns(
          data.runs.map((r: { run: RegressionRun; meetingName: string | null; scenarioName: string | null }) => ({
            id: r.run.id,
            createdAt: r.run.created_at,
            meetingId: r.run.meeting_id,
            meetingName: r.meetingName,
            scenarioId: r.run.scenario_id,
            scenarioName: r.scenarioName,
            overallResult: r.run.overall_result,
            status: r.run.status,
          }))
        );
      }
    } catch {
      // Non-fatal - the just-run result is already shown either way.
    }
  }

  async function handleRun() {
    if (!selectedMeetingId || busy) return;
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/regression/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: selectedMeetingId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to run regression");
      }
      setResult(await loadRunReview(data.run.id));
      await refreshRecentRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run regression");
    } finally {
      setRunning(false);
    }
  }

  async function handleReplay() {
    if (!selectedScenario || busy) return;

    if (selectedScenario.transcriptChunks.length > CONFIRM_ABOVE_CHUNK_COUNT) {
      const confirmed = window.confirm(
        `"${selectedScenario.name}" has ${selectedScenario.transcriptChunks.length} transcript chunks. Replaying it will create a fresh meeting and make a real AI call for each chunk - this may take a few minutes. Continue?`
      );
      if (!confirmed) return;
    }

    setReplaying(true);
    setReplayError(null);
    try {
      const response = await fetch("/api/regression/replay-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedScenarioId, generateReview }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to replay scenario");
      }

      const replayRun = data.replayRun as ScenarioReplayRun;
      setReplayInfo({
        meetingId: data.meeting?.id ?? null,
        meetingName: data.meeting?.name ?? null,
        status: replayRun.status,
        chunksSubmitted: replayRun.chunks_submitted,
        chunkCount: replayRun.chunk_count,
        errorMessage: replayRun.error_message,
        hasRegressionRun: !!data.regressionRun,
      });

      if (data.regressionRun) {
        setResult(await loadRunReview(data.regressionRun.id));
        await refreshRecentRuns();
      }
    } catch (err) {
      setReplayError(err instanceof Error ? err.message : "Failed to replay scenario");
    } finally {
      setReplaying(false);
    }
  }

  function toggleScenarioSelection(id: string) {
    setSelectedScenarioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshRecentBatchRuns() {
    try {
      const response = await fetch("/api/regression/batch-runs", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setRecentBatchRuns(data.runs as BatchRegressionRun[]);
      }
    } catch {
      // Non-fatal - the just-run result is already shown either way.
    }
  }

  async function handleRunBatch() {
    if (busy || selectedScenarioIds.size === 0) return;

    const ids = Array.from(selectedScenarioIds);
    const totalChunks = SCENARIOS.filter((s) => selectedScenarioIds.has(s.id)).reduce(
      (sum, s) => sum + s.transcriptChunks.length,
      0
    );
    const confirmed = window.confirm(
      `This will replay ${ids.length} scenario${ids.length === 1 ? "" : "s"} (${totalChunks} transcript chunks total), each creating a fresh meeting and making real AI calls sequentially - this can take several minutes. Continue?`
    );
    if (!confirmed) return;

    setBatchRunning(true);
    setBatchError(null);
    try {
      const response = await fetch("/api/regression/batch-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioIds: ids,
          generateReview: batchGenerateReview,
          stopOnFailure: batchStopOnFailure,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to run batch regression");
      }
      setBatchResult(await loadBatchRunReview(data.batchRun.id));
      await refreshRecentBatchRuns();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Failed to run batch regression");
    } finally {
      setBatchRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Batch regression
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Batch regression replays selected scenarios through real AI calls, then runs
          deterministic checks. Warnings mean expected outputs were missing or weak. Fails
          indicate safety, trust, or app issues.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedScenarioIds(new Set(SCENARIOS.map((s) => s.id)))}
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
          >
            All scenarios
          </button>
          <button
            type="button"
            onClick={() => setSelectedScenarioIds(new Set())}
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
          >
            None
          </button>
        </div>

        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedScenarioIds.has(s.id)}
                  onChange={() => toggleScenarioSelection(s.id)}
                />
                {getScenarioDisplayLabel(s)}{" "}
                <span className="text-xs text-neutral-400">({s.transcriptChunks.length} chunks)</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={batchGenerateReview}
              onChange={(e) => setBatchGenerateReview(e.target.checked)}
            />
            Generate review after replay
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={batchStopOnFailure}
              onChange={(e) => setBatchStopOnFailure(e.target.checked)}
            />
            Stop on first failure
          </label>
          <WriteButton
            type="button"
            onClick={handleRunBatch}
            disabled={busy || selectedScenarioIds.size === 0}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {batchRunning ? "Running batch…" : "Run batch regression"}
          </WriteButton>
        </div>

        {batchError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{batchError}</p>}

        {batchResult && (
          <div className="mt-4">
            <BatchRunReview review={batchResult} detailHref={`/regression/batch-runs/${batchResult.batchRun.id}`} />
          </div>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Replay scenario and run regression
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Creates a fresh meeting and runs real AI calls for each transcript chunk, then checks
          the result deterministically. Use this for QA, not during live meetings.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Scenario</span>
            <select
              value={selectedScenarioId}
              onChange={(e) => setSelectedScenarioId(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {getScenarioDisplayLabel(s)} ({s.transcriptChunks.length} chunks)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input
              type="checkbox"
              checked={generateReview}
              onChange={(e) => setGenerateReview(e.target.checked)}
            />
            Generate review after replay
          </label>
          <WriteButton
            type="button"
            onClick={handleReplay}
            disabled={busy || !selectedScenarioId}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {replaying ? "Replaying…" : "Replay scenario and run regression"}
          </WriteButton>
        </div>

        {replayError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{replayError}</p>}

        {replayInfo && (
          <div className="mt-3 rounded border border-neutral-200 p-3 text-xs dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{replayInfo.meetingName ?? "(meeting not created)"}</span>
              <ReplayStatusBadge status={replayInfo.status} />
              <span className="text-neutral-500">
                {replayInfo.chunksSubmitted}/{replayInfo.chunkCount} chunks submitted
              </span>
            </div>
            {replayInfo.errorMessage && (
              <p className="mt-1 text-red-600 dark:text-red-400">{replayInfo.errorMessage}</p>
            )}
            {replayInfo.meetingId && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-neutral-500">
                {MEETING_LINKS.map((link) => (
                  <Link
                    key={link.segment}
                    href={`/meetings/${replayInfo.meetingId}/${link.segment}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {link.label}
                  </Link>
                ))}
                {replayInfo.hasRegressionRun && (
                  <a href="#latest-result" className="text-blue-600 hover:underline dark:text-blue-400">
                    Regression result
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Run regression on existing meeting
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Checks a meeting that already has scenario data in it, without replaying anything new.
        </p>

        {eligibleMeetings.length === 0 ? (
          <div className="mt-3 rounded border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
            <p className="text-sm text-neutral-500">
              No scenario-created meetings yet. Create one from the New Meeting page&apos;s
              &ldquo;Load demo scenario&rdquo; dropdown, or replay a scenario above.
            </p>
            <Link
              href="/meetings/new"
              className="mt-3 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              New meeting
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Meeting</span>
                <select
                  value={selectedMeetingId}
                  onChange={(e) => setSelectedMeetingId(e.target.value)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                >
                  {eligibleMeetings.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.scenarioName}
                    </option>
                  ))}
                </select>
              </label>
              <WriteButton
                type="button"
                onClick={handleRun}
                disabled={busy || !selectedMeetingId}
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {running ? "Running…" : "Run regression"}
              </WriteButton>
            </div>

            {selectedMeeting && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                <span>
                  Scenario:{" "}
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{selectedMeeting.scenarioName}</span>
                </span>
                <span className="text-neutral-300 dark:text-neutral-700">|</span>
                {MEETING_LINKS.map((link) => (
                  <Link
                    key={link.segment}
                    href={`/meetings/${selectedMeeting.id}/${link.segment}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </section>

      {result && (
        <section
          id="latest-result"
          className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Latest result</h2>
          <SingleRunReview
            run={result.run}
            checks={result.checks}
            meetingId={result.meetingId}
            meetingName={result.meetingName}
            meetingExists={result.meetingExists}
            scenarioName={result.scenarioName}
            detailHref={`/regression/runs/${result.run.id}`}
          />
        </section>
      )}

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent runs</h2>
        {recentRuns.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {recentRuns.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
              >
                <span className="text-neutral-400">{formatTimestamp(r.createdAt)}</span>
                <span className="font-medium">{r.meetingName ?? "(deleted meeting)"}</span>
                <span className="text-neutral-500">{r.scenarioName ?? r.scenarioId}</span>
                <ResultBadge result={r.overallResult} />
                {r.status === "failed" && (
                  <span className="text-red-500" title="Run itself crashed unexpectedly">
                    ⚠ run error
                  </span>
                )}
                <Link
                  href={`/regression/runs/${r.id}`}
                  className="ml-auto rounded border border-neutral-300 px-2 py-1 text-xs font-medium dark:border-neutral-700"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            No regression runs yet. Replay a scenario or run regression on an existing scenario
            meeting above.
          </p>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent batch runs</h2>
        {recentBatchRuns.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {recentBatchRuns.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
              >
                <span className="text-neutral-400">{formatTimestamp(b.started_at)}</span>
                <BatchStatusBadge status={b.status} />
                <span className="text-neutral-500">
                  {b.scenario_count} scenarios · {b.completed_count} completed · {b.failed_count} failed
                </span>
                <span className="text-neutral-500">
                  {b.total_pass} pass · {b.total_warn} warn · {b.total_fail} fail
                </span>
                <Link
                  href={`/regression/batch-runs/${b.id}`}
                  className="ml-auto rounded border border-neutral-300 px-2 py-1 text-xs font-medium dark:border-neutral-700"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            No batch runs yet. Select scenarios above and run batch regression to see aggregate
            results here.
          </p>
        )}
      </section>
    </div>
  );
}

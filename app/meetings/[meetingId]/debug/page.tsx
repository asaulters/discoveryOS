import { notFound } from "next/navigation";
import Link from "next/link";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getAiRunLogsForMeeting } from "@/lib/services/aiRuns";
import type { AiRunLog } from "@/lib/types/database";

const RUN_TYPE_LABELS: Record<string, string> = {
  setup_analyst: "Setup Analyst",
  fast_loop_analysis: "Fast Loop",
  workflow_extractor: "Workflow Extractor",
  post_meeting_review: "Post-Meeting Review",
  audio_transcription: "Audio Transcription",
  contradiction_detector: "Contradiction Detector",
  conversation_state_analyzer: "Conversation State Analyzer",
  applied_ai_opportunity_assessment: "Applied AI Opportunity Assessment",
};

/**
 * Sprint 29 Part G: statuses beyond succeeded/failed - "timeout" and
 * "retry_failed" are still failures (red-family), "retry_succeeded" is
 * still a success (green-family) that just needed one extra attempt. See
 * lib/ai/aiCallRunner.ts's aiCallSuccessStatus/describeAiCallFailureForLog
 * for where these come from.
 */
function statusStyles(status: string) {
  switch (status) {
    case "succeeded":
    case "retry_succeeded":
      return "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400";
    case "failed":
    case "retry_failed":
      return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400";
    case "timeout":
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400";
    default:
      return "border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400";
  }
}

/** Shape written by aiCallRunner.ts's describeAiCallFailureForLog - present on failed/timeout/retry_failed runs whose failure came from the wrapped AI call itself (not a later persistence-layer error). */
interface AiCallFailureOutput {
  failureType: string;
  attempts: number;
  durationMs: number;
  retryable: boolean;
  callKind: string;
}

function isAiCallFailureOutput(output: unknown): output is AiCallFailureOutput {
  return (
    !!output &&
    typeof output === "object" &&
    "failureType" in output &&
    "attempts" in output &&
    "retryable" in output
  );
}

function extractModel(input: unknown): string {
  if (input && typeof input === "object" && "model" in input) {
    const model = (input as { model?: unknown }).model;
    if (typeof model === "string") return model;
  }
  return "-";
}

function formatLatency(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return "-";
  const ms = new Date(completedAt).getTime() - new Date(createdAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function RunRow({ run }: { run: AiRunLog }) {
  const failureInfo = isAiCallFailureOutput(run.output) ? run.output : null;

  return (
    <li className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{RUN_TYPE_LABELS[run.run_type] ?? run.run_type}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusStyles(run.status)}`}>
          {run.status.replace(/_/g, " ")}
        </span>
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700">
          {extractModel(run.input)}
        </span>
        <span className="text-xs text-neutral-500">latency: {formatLatency(run.created_at, run.completed_at)}</span>
        <span className="text-xs text-neutral-400">{formatTimestamp(run.created_at)}</span>
      </div>

      {run.error && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {run.error}
        </p>
      )}

      {failureInfo && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
          <span>
            failure type: <span className="font-medium capitalize text-neutral-700 dark:text-neutral-300">{failureInfo.failureType}</span>
          </span>
          <span>
            attempts: <span className="font-medium text-neutral-700 dark:text-neutral-300">{failureInfo.attempts}</span>
          </span>
          <span>
            retryable:{" "}
            <span className="font-medium text-neutral-700 dark:text-neutral-300">{failureInfo.retryable ? "yes" : "no"}</span>
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4">
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-neutral-500">Input payload</summary>
          <pre className="mt-1 max-w-full overflow-x-auto rounded bg-neutral-100 p-2 text-[11px] dark:bg-neutral-950">
            {JSON.stringify(run.input, null, 2)}
          </pre>
        </details>
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-neutral-500">Output payload</summary>
          <pre className="mt-1 max-w-full overflow-x-auto rounded bg-neutral-100 p-2 text-[11px] dark:bg-neutral-950">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </details>
      </div>
    </li>
  );
}

export default async function MeetingDebugPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const details = await getMeetingWithDetails(meetingId);

  if (!details) {
    notFound();
  }

  const runs = await getAiRunLogsForMeeting(meetingId);

  return (
    <div className="min-h-screen bg-neutral-50 p-4 dark:bg-neutral-950">
      <header className="rounded border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Debug
        </p>
        <h1 className="mt-0.5 text-lg font-semibold text-neutral-700 dark:text-neutral-300">
          {details.meeting.name}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          Inspect raw state and AI runs for troubleshooting - every setup_analyst,
          fast_loop_analysis, workflow_extractor, and post_meeting_review run for this meeting,
          newest first.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
            Dashboard
          </Link>
          <Link
            href={`/meetings/${meetingId}/brief`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Brief
          </Link>
          <Link
            href={`/meetings/${meetingId}/live`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Live
          </Link>
          <Link
            href={`/meetings/${meetingId}/review`}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Review
          </Link>
        </div>
      </header>

      <section className="mt-4 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        {runs.length > 0 ? (
          <ul className="space-y-3">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-400">No AI runs logged for this meeting yet.</p>
        )}
      </section>
    </div>
  );
}

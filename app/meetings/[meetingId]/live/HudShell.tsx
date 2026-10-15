"use client";

import { WriteButton } from "@/app/RoleControls";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HudState } from "@/lib/services/hudState";
import type { ThreadPriority, TranscriptSegment } from "@/lib/types/database";
import ManualTranscriptInput from "./ManualTranscriptInput";
import QuickAnchorNote from "./QuickAnchorNote";
import DemoScenarioChunks from "./DemoScenarioChunks";
import LiveAudioPanel from "./LiveAudioPanel";
import DirectionCard from "./DirectionCard";
import WorkflowPanel from "./WorkflowPanel";
import PilotStatusBar from "./PilotStatusBar";
import RemoteCaptureSetupPanel from "./RemoteCaptureSetupPanel";
import MeetingHeader from "../MeetingHeader";
import type { RemoteCaptureReadinessView } from "@/lib/services/remoteCaptureReadiness";

const POLL_INTERVAL_MS = 4000;

/** Sprint 30 Part D: display-only ranking to decide what counts as "highest priority" for Still to explore's default-visible slice - never touches sort_order or any persisted ordering. */
const PRIORITY_RANK: Record<ThreadPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const DEFAULT_VISIBLE_QUEUE_COUNT = 4;

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium capitalize dark:border-neutral-700">
      {level}
    </span>
  );
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SourceBadge({ segment }: { segment: TranscriptSegment }) {
  if (segment.source_type !== "live_audio") return null;
  const reason = segment.transcription_metadata?.detection_reason;
  return (
    <>
      <span className="ml-2 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
        Live capture
      </span>
      {reason && (
        <span
          className="ml-1 text-[10px] font-normal normal-case text-neutral-400"
          title="Why this live-capture segment was analyzed (meaningful segment detection)"
        >
          ({reason})
        </span>
      )}
    </>
  );
}

/** Zone divider used to visually split "steering the conversation" from "what we understand so far" - copy/grouping only, no new data or logic. */
function ZoneHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="col-span-full mt-2 flex items-baseline gap-2 border-b border-neutral-200 pb-1 dark:border-neutral-800">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        {title}
      </h2>
      <span className="text-xs text-neutral-400 dark:text-neutral-600">{subtitle}</span>
    </div>
  );
}

export default function HudShell({
  meetingId,
  initialState,
  initialRemoteCaptureReadiness,
}: {
  meetingId: string;
  initialState: HudState;
  initialRemoteCaptureReadiness: RemoteCaptureReadinessView;
}) {
  const [hudState, setHudState] = useState<HudState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [threadActionPending, setThreadActionPending] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState("");
  const [retryingAnalysis, setRetryingAnalysis] = useState(false);

  // Sprint 30 Part F: session-only attention controls - never persisted,
  // never sent to the server, and never affect capture/analysis behavior.
  // Quiet mode reduces Suggested directions to a count-only teaser (the
  // section most likely to compete for attention during a live
  // conversation); Focus only goes further and hides the secondary
  // sections entirely. Capture controls (Live capture/Manual transcript)
  // and recovery banners are deliberately never touched by either mode.
  const [quietMode, setQuietMode] = useState(false);
  const [focusOnly, setFocusOnly] = useState(false);
  const [showDirectionsAnyway, setShowDirectionsAnyway] = useState(false);
  const [showAllOpenQueue, setShowAllOpenQueue] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/hud-state`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to refresh HUD state");
        const data: HudState = await response.json();
        if (!cancelled) {
          setHudState(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to refresh HUD state");
        }
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [meetingId]);

  const {
    meeting,
    activeThread,
    queuedThreads,
    directions,
    alerts,
    recentTranscriptSegments,
    workflow,
    evidenceTranscriptSegments,
    fastLoopWarning,
    workflowExtractionWarning,
    openContradictionCount,
    pilotReadiness,
  } = hudState;

  // Sprint 29: the transcript segment behind fastLoopWarning is already
  // saved (see transcriptAnalysis.ts) - this only re-runs analysis, it
  // never re-submits text, so it's safe to call from anywhere in the HUD,
  // not just the input that happened to trigger the failure (manual paste
  // or live audio both funnel into the same fastLoopWarning field).
  async function retryPendingAnalysis() {
    setRetryingAnalysis(true);
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/analyze-pending`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Retry failed");
      }
      setHudState(result as HudState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingAnalysis(false);
    }
  }

  async function runThreadAction(key: string, path: string) {
    setError(null);
    setThreadActionPending(key);
    try {
      const response = await fetch(path, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Thread action failed");
      }
      setHudState(result as HudState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thread action failed");
    } finally {
      setThreadActionPending(null);
    }
  }

  function focusThread(threadId: string) {
    runThreadAction(`focus:${threadId}`, `/api/meetings/${meetingId}/threads/${threadId}/focus`);
  }

  function releaseFocus(threadId: string) {
    runThreadAction(
      `release:${threadId}`,
      `/api/meetings/${meetingId}/threads/${threadId}/release-focus`
    );
  }

  function markCovered(threadId: string) {
    runThreadAction(
      `covered:${threadId}`,
      `/api/meetings/${meetingId}/threads/${threadId}/mark-covered`
    );
  }

  function deferThreadAction(threadId: string) {
    runThreadAction(`defer:${threadId}`, `/api/meetings/${meetingId}/threads/${threadId}/defer`);
  }

  // Sprint 30 Part D: Still to explore reads like a live discovery backlog
  // rather than a second dashboard - open items lead (highest priority
  // first, display-only), deferred items sit collapsed below since they're
  // things the facilitator deliberately set aside, not the active backlog.
  const openQueued = queuedThreads
    .filter((thread) => thread.status !== "deferred")
    .slice()
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const deferredQueued = queuedThreads.filter((thread) => thread.status === "deferred");
  const visibleOpenQueued = showAllOpenQueue ? openQueued : openQueued.slice(0, DEFAULT_VISIBLE_QUEUE_COUNT);
  const hiddenOpenQueueCount = openQueued.length - visibleOpenQueued.length;

  const directionsHiddenByQuiet = quietMode && !showDirectionsAnyway;

  return (
    <div className="grid min-h-screen grid-cols-1 gap-4 bg-neutral-50 p-4 dark:bg-neutral-950 lg:grid-cols-3">
      <div className="col-span-full">
        <MeetingHeader
          meeting={meeting}
          pilotMode={pilotReadiness.pilot_mode}
          active="live"
          purpose="Capture the conversation, track open threads, and decide what to ask next."
        />
      </div>

      <PilotStatusBar meetingId={meetingId} pilotReadiness={pilotReadiness} />

      {/* Sprint 30 Part F: session-only, never persisted - see the state declarations above. */}
      <div className="col-span-full flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setQuietMode((prev) => !prev)}
          title="Reduces Suggested directions to a count-only teaser. Never loses data or stops capture."
          className={
            quietMode
              ? "rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:border-neutral-300 dark:bg-neutral-100 dark:text-neutral-900"
              : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
          }
        >
          Quiet mode{quietMode ? ": on" : ""}
        </button>
        <button
          type="button"
          onClick={() => setFocusOnly((prev) => !prev)}
          title="Shows only Current focus and Suggested directions. Capture controls always stay visible."
          className={
            focusOnly
              ? "rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium text-white dark:border-neutral-300 dark:bg-neutral-100 dark:text-neutral-900"
              : "rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
          }
        >
          Focus only{focusOnly ? ": on" : ""}
        </button>
      </div>

      {error && (
        <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {fastLoopWarning && (
        <div className="col-span-full flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Transcript saved, but analysis failed or timed out. You can retry analysis. ({fastLoopWarning})
          </p>
          <WriteButton
            onClick={retryPendingAnalysis}
            disabled={retryingAnalysis}
            className="shrink-0 rounded border border-amber-400 px-3 py-1 text-sm font-medium text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200"
          >
            {retryingAnalysis ? "Retrying..." : "Retry analysis"}
          </WriteButton>
        </div>
      )}

      {/* Sprint 8: no alert-generation logic exists anywhere in the app yet, so this list is always empty - showing an always-empty "No alerts" card is pure demo clutter, so the section only renders once there's something to show. */}
      {alerts.length > 0 && (
        <section className="col-span-full rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Alerts
          </h2>
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="text-sm">
                {alert.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ZoneHeading title="Live mode" subtitle="What should I ask next, and is capture running?" />

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Current focus
        </h2>
        {activeThread ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-medium">{activeThread.title}</h3>
                <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium capitalize text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  {activeThread.priority} priority
                </span>
                <ConfidenceBadge level={activeThread.confidence_level} />
                {activeThread.locked_until_release ? (
                  <span
                    title="Locked - won't be auto-swapped until released"
                    className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  >
                    🔒 Focused by you
                  </span>
                ) : (
                  <span
                    title="No one has explicitly focused a thread yet - this is the app's current best guess."
                    className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-400 dark:border-neutral-800"
                  >
                    Suggested by DiscoveryOS
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeThread.locked_until_release && (
                  <WriteButton
                    onClick={() => releaseFocus(activeThread.id)}
                    disabled={threadActionPending !== null}
                    className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
                  >
                    {threadActionPending === `release:${activeThread.id}`
                      ? "Releasing..."
                      : "Release focus"}
                  </WriteButton>
                )}
                <WriteButton
                  onClick={() => deferThreadAction(activeThread.id)}
                  disabled={threadActionPending !== null}
                  className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
                >
                  {threadActionPending === `defer:${activeThread.id}` ? "Deferring..." : "Defer"}
                </WriteButton>
                <WriteButton
                  onClick={() => markCovered(activeThread.id)}
                  disabled={threadActionPending !== null}
                  className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
                >
                  {threadActionPending === `covered:${activeThread.id}`
                    ? "Marking..."
                    : "Mark covered"}
                </WriteButton>
                <Link
                  href={`/meetings/${meetingId}/workflow`}
                  className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  View process
                </Link>
              </div>
            </div>

            {activeThread.why_it_matters && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Why it matters: {activeThread.why_it_matters}
              </p>
            )}

            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Suggested directions
                </h4>
                {directionsHiddenByQuiet && directions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDirectionsAnyway(true)}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                  >
                    Show {directions.length} suggested direction{directions.length === 1 ? "" : "s"} (quiet mode)
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                Use these during a natural pause. They are prompts, not instructions.
              </p>
              {!directionsHiddenByQuiet &&
                (directions.length > 0 ? (
                  <ol className="mt-2 space-y-3">
                    {directions.map((direction, index) => (
                      <DirectionCard
                        key={direction.id}
                        meetingId={meetingId}
                        direction={direction}
                        index={index}
                        onUpdated={setHudState}
                      />
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-neutral-400">
                    Add a transcript segment or use live capture to generate suggested directions.
                  </p>
                ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-400">
            No active focus yet. Add transcript or choose a topic from Still to explore.
          </p>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Still to explore
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            Topics to return to if the conversation opens space.
          </p>
          {openQueued.length > 0 ? (
            <>
              <ul className="mt-3 space-y-2">
                {visibleOpenQueued.map((thread) => (
                  <li key={thread.id}>
                    <WriteButton
                      onClick={() => focusThread(thread.id)}
                      disabled={threadActionPending !== null}
                      className="w-full rounded border border-neutral-200 p-2 text-left text-sm hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-800 dark:hover:border-neutral-600"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {threadActionPending === `focus:${thread.id}` ? "Focusing..." : thread.title}
                        </span>
                        <ConfidenceBadge level={thread.confidence_level} />
                      </div>
                      <span className="text-xs capitalize text-neutral-500">
                        priority: {thread.priority}
                      </span>
                      {thread.why_it_matters && (
                        <p className="mt-1 text-xs italic text-neutral-500">
                          {thread.why_it_matters}
                        </p>
                      )}
                    </WriteButton>
                  </li>
                ))}
              </ul>
              {hiddenOpenQueueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllOpenQueue(true)}
                  className="mt-2 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Show {hiddenOpenQueueCount} more
                </button>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-400">No open discovery threads yet.</p>
          )}

          {deferredQueued.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold uppercase tracking-wide text-neutral-500">
                Deferred ({deferredQueued.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {deferredQueued.map((thread) => (
                  <li key={thread.id}>
                    <WriteButton
                      onClick={() => focusThread(thread.id)}
                      disabled={threadActionPending !== null}
                      className="w-full rounded border border-neutral-200 p-2 text-left text-sm hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-800 dark:hover:border-neutral-600"
                    >
                      <span className="font-medium">
                        {threadActionPending === `focus:${thread.id}` ? "Focusing..." : thread.title}
                      </span>
                    </WriteButton>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </aside>

      {/* Sprint 30 Part E: capture controls always stay visible - never hidden by Quiet mode or Focus only. Sprint 32: quick anchor note and remote capture setup live here too, for the same reason - both are capture-adjacent, not investigation detail. */}
      <section className="space-y-4 lg:col-span-2">
        <QuickAnchorNote meetingId={meetingId} onAnalyzed={setHudState} />
        <ManualTranscriptInput
          meetingId={meetingId}
          value={transcriptText}
          onValueChange={setTranscriptText}
          onAnalyzed={setHudState}
        />
        <LiveAudioPanel meetingId={meetingId} onAnalyzed={setHudState} />
        <RemoteCaptureSetupPanel meetingId={meetingId} initialReadiness={initialRemoteCaptureReadiness} />
      </section>

      {!focusOnly && (
        <>
          <ZoneHeading title="Investigation" subtitle="What do we understand so far, and what's still unclear?" />

          <section className="lg:col-span-2">
            <WorkflowPanel
              meetingId={meetingId}
              workflow={workflow}
              warning={workflowExtractionWarning}
              openContradictionCount={openContradictionCount}
              evidenceTranscriptSegments={evidenceTranscriptSegments}
              onUpdated={setHudState}
            />
          </section>

          <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setTranscriptExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Captured transcript
              </h2>
              <span className="text-xs text-neutral-400">{transcriptExpanded ? "Hide" : "Show"}</span>
            </button>
            {transcriptExpanded &&
              (recentTranscriptSegments.filter((segment) => segment.raw_text.trim()).length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {recentTranscriptSegments
                    .filter((segment) => segment.raw_text.trim())
                    .map((segment) => (
                      <li
                        key={segment.id}
                        className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800"
                      >
                        <span className="text-neutral-400">{formatTime(segment.created_at)}</span>
                        <SourceBadge segment={segment} />
                        <p className="mt-0.5 text-neutral-700 dark:text-neutral-300">{segment.raw_text}</p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">No transcript captured yet.</p>
              ))}
          </section>

          {meeting.scenario_id && (
            <div className="col-span-full">
              <DemoScenarioChunks scenarioId={meeting.scenario_id} onInsert={setTranscriptText} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

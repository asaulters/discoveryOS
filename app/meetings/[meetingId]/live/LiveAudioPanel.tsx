"use client";

import { WriteButton } from "@/app/RoleControls";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { HudState } from "@/lib/services/hudState";
import { detectMeaningfulSegment, type DetectionReason } from "@/lib/live/meaningfulSegments";
import LiveAudioRecorder, { browserSupportsLiveAudio } from "./LiveAudioRecorder";

const CHUNK_INTERVAL_MS = 15000;

const REASON_LABELS: Record<DetectionReason, string> = {
  empty: "No speech detected yet",
  filler_only: "Only filler speech so far",
  analysis_paused: "Analysis paused",
  analysis_in_flight: "Analysis already running",
  manual_force: "Manually analyzed",
  token_threshold: "Enough content accumulated",
  high_signal_short: "High-signal terms detected",
  time_threshold: "45+ seconds of pending speech",
  process_statement_pattern: "Process statement detected",
  below_threshold: "Not enough content yet",
};

// Browser mic support never changes after mount, so there's nothing to
// subscribe to - this only exists to give useSyncExternalStore a
// server/client snapshot split, which is the hydration-safe way to read a
// value that legitimately differs between SSR (no `navigator`) and the
// client's first render without triggering a mismatch.
function subscribeToNothing() {
  return () => {};
}

function ConsentModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Live capture — continuous mode
        </h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-neutral-700 dark:text-neutral-300">
          <li>Live capture listens through your browser microphone.</li>
          <li>Once started, it listens continuously until you click Stop.</li>
          <li>Audio is recorded internally in short (~15s) chunks for reliable transcription, but you won&apos;t need to restart anything.</li>
          <li>Text is buffered first and only analyzed when it looks meaningful.</li>
          <li>Use only with participant consent.</li>
          <li>This does not capture Zoom/Teams/system audio reliably.</li>
          <li>Manual transcript entry still works.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
          >
            Cancel
          </button>
          <WriteButton
            type="button"
            onClick={onConfirm}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Start listening
          </WriteButton>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${on ? "bg-green-500" : "bg-neutral-300 dark:bg-neutral-600"}`}
    />
  );
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function LiveAudioPanel({
  meetingId,
  onAnalyzed,
}: {
  meetingId: string;
  onAnalyzed: (hudState: HudState) => void;
}) {
  const [showConsent, setShowConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(true);
  const [transcribing, setTranscribing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [micReleased, setMicReleased] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The live transcript buffer (Sprint 13 Part B): chunks transcribed but
  // not yet turned into a transcript_segment. Client-side only, matching
  // the existing pause/resume toggle - see docs/live-audio-readiness.md.
  const [pendingChunks, setPendingChunks] = useState<string[]>([]);
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [lastTranscriptionModel, setLastTranscriptionModel] = useState<string | null>(null);
  const [lastTranscriptionTime, setLastTranscriptionTime] = useState<string | null>(null);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [lastDetectionReason, setLastDetectionReason] = useState<DetectionReason | null>(null);
  const [lastSignalTerms, setLastSignalTerms] = useState<string[]>([]);
  // Sprint 30 Part E: the per-tick diagnostic readout (chunk counts,
  // last-transcribed/analyzed timestamps, detection reason, signal terms)
  // is genuinely useful for trust/debugging but is exactly the kind of
  // detail that turns this into a command center during a live meeting -
  // collapsed by default, one click away, no behavior change underneath.
  const [showDetails, setShowDetails] = useState(false);

  const supported = useSyncExternalStore(subscribeToNothing, browserSupportsLiveAudio, () => false);

  // Ticks once a second while text is pending, purely so the "pending
  // duration" display (and the 45s time-threshold rule's UI preview) stay
  // live - Date.now() itself is only ever read inside this effect/event
  // handlers, never directly during render (React purity rule).
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (pendingChunks.length === 0) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pendingChunks.length]);

  async function runAnalyzeBuffer(chunksSnapshot: string[], pendingStartedAt: number | null, force: boolean) {
    if (analyzing) return;
    const text = chunksSnapshot.join(" ").trim();
    if (!text) return;

    setAnalyzing(true);
    setError(null);
    try {
      const latestChunkText = chunksSnapshot[chunksSnapshot.length - 1] ?? "";
      const secondsPending = pendingStartedAt ? (Date.now() - pendingStartedAt) / 1000 : 0;

      const response = await fetch(`/api/meetings/${meetingId}/live-audio/analyze-buffer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          chunkCount: chunksSnapshot.length,
          latestChunkText,
          secondsPending,
          force,
          analysisPausedAtCreation: !analysisRunning,
          mimeType: "audio/webm",
          model: lastTranscriptionModel ?? undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to analyze pending transcript");
      }

      if (result.created) {
        onAnalyzed(result as HudState);
        // Only clear on confirmed success - a network/server error or a
        // "not meaningful after all" no-op below leaves the buffer intact.
        setPendingChunks([]);
        setPendingSince(null);
        setLastAnalyzedAt(new Date().toISOString());
        setLastDetectionReason(result.detection?.reason ?? null);
        setLastSignalTerms(result.detection?.signalTerms ?? []);
      } else {
        // Server re-checked and disagreed (buffer/timing shifted between
        // the client's local check and this call) - nothing was saved,
        // buffer stays exactly as it was.
        setLastDetectionReason(result.reason ?? null);
        setLastSignalTerms(result.signalTerms ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze pending transcript");
    } finally {
      setAnalyzing(false);
    }
  }

  async function uploadChunk(blob: Blob, durationMs: number, chunkIndex: number) {
    setTranscribing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("audio", blob, `chunk-${chunkIndex}.webm`);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("durationMs", String(Math.round(durationMs)));

      const response = await fetch(`/api/meetings/${meetingId}/transcribe-audio`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to transcribe audio chunk");
      }

      const text: string = typeof result.text === "string" ? result.text.trim() : "";
      if (!text) {
        // Silent/empty chunk - a normal no-op, nothing to buffer.
        return;
      }

      setLastTranscriptionModel(typeof result.model === "string" ? result.model : null);
      setLastTranscriptionTime(new Date().toISOString());

      const updatedChunks = [...pendingChunks, text];
      const startedAt = pendingChunks.length === 0 ? Date.now() : (pendingSince ?? Date.now());
      setPendingChunks(updatedChunks);
      if (pendingChunks.length === 0) {
        setPendingSince(startedAt);
      }

      if (!analysisRunning) {
        // Paused: keep listening/transcribing and accumulating, but never
        // auto-analyze - matches Sprint 13 Part E.
        return;
      }

      const combinedText = updatedChunks.join(" ");
      const detection = detectMeaningfulSegment({
        pendingText: combinedText,
        latestChunkText: text,
        secondsSincePendingStart: (Date.now() - startedAt) / 1000,
        analysisPaused: false,
        analysisInFlight: analyzing,
      });

      if (detection.shouldAnalyze) {
        await runAnalyzeBuffer(updatedChunks, startedAt, false);
      } else {
        setLastDetectionReason(detection.reason);
        setLastSignalTerms(detection.signalTerms);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transcribe audio chunk");
    } finally {
      setTranscribing(false);
    }
  }

  function handleManualAnalyze() {
    if (pendingChunks.length === 0 || analyzing) return;
    void runAnalyzeBuffer(pendingChunks, pendingSince, true);
  }

  function handleStartClick() {
    setError(null);
    setShowConsent(true);
  }

  function handleConfirmStart() {
    setShowConsent(false);
    setMicReleased(false);
    setRecording(true);
  }

  function handleStop() {
    setRecording(false);
  }

  async function handleResume() {
    setAnalysisRunning(true);
    if (pendingChunks.length === 0 || analyzing) return;

    const combinedText = pendingChunks.join(" ");
    const latestChunkText = pendingChunks[pendingChunks.length - 1] ?? "";
    const detection = detectMeaningfulSegment({
      pendingText: combinedText,
      latestChunkText,
      secondsSincePendingStart: pendingSince ? (Date.now() - pendingSince) / 1000 : 0,
      analysisPaused: false,
      analysisInFlight: analyzing,
    });

    if (detection.shouldAnalyze) {
      await runAnalyzeBuffer(pendingChunks, pendingSince, false);
    } else {
      setLastDetectionReason(detection.reason);
      setLastSignalTerms(detection.signalTerms);
    }
  }

  function handlePause() {
    setAnalysisRunning(false);
  }

  function handleClearBuffer() {
    if (pendingChunks.length === 0) return;
    const confirmed = window.confirm(
      "Clear the unanalyzed live text? This only discards unsaved buffered text - it never deletes anything already analyzed."
    );
    if (!confirmed) return;
    setPendingChunks([]);
    setPendingSince(null);
    setLastDetectionReason(null);
    setLastSignalTerms([]);
  }

  const pendingText = pendingChunks.join(" ");
  const displaySecondsPending =
    pendingSince && nowTick ? Math.max(0, Math.round((nowTick - pendingSince) / 1000)) : 0;
  const localDetection =
    pendingChunks.length > 0
      ? detectMeaningfulSegment({
          pendingText,
          latestChunkText: pendingChunks[pendingChunks.length - 1] ?? "",
          secondsSincePendingStart: displaySecondsPending,
          analysisPaused: false,
          analysisInFlight: false,
        })
      : null;
  const readyToAnalyze = localDetection?.shouldAnalyze ?? false;

  // Sprint 30 Part E: preferred, calmer status vocabulary - same
  // underlying conditions as before, just fewer/plainer words so the
  // facilitator can read this at a glance instead of parsing a debug-style
  // state machine mid-meeting.
  let statusLabel = "Live capture off";
  if (showConsent) statusLabel = "Consent required";
  else if (!recording && pendingChunks.length > 0) statusLabel = "Live capture off — unanalyzed text not saved";
  else if (!recording) statusLabel = "Live capture off";
  else if (analyzing) statusLabel = "Analyzing";
  else if (transcribing) statusLabel = "Transcribing";
  else if (!analysisRunning) statusLabel = "Paused";
  else if (readyToAnalyze || pendingChunks.length > 0) statusLabel = "Unanalyzed text waiting";
  else statusLabel = "Listening";

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Live capture</h2>
        <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
          Continuous mode
        </span>
      </div>

      <div className="mt-1 space-y-0.5 text-[11px] text-neutral-400">
        <p>Use manual transcript when browser mic misses remote audio.</p>
        <p>Transcript is saved before analysis runs. Analysis can be retried if it fails.</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{statusLabel}</p>
        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="text-[11px] font-medium text-neutral-400 underline underline-offset-2 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {showDetails ? "Hide capture details" : "Show capture details"}
        </button>
      </div>

      {showDetails && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <StatusDot on={recording} />
              <span className="text-neutral-500">Listening: {recording ? "yes" : "no"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot on={transcribing} />
              <span className="text-neutral-500">Transcribing: {transcribing ? "yes" : "no"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <StatusDot on={analysisRunning} />
              <span className="text-neutral-500">
                Analysis: {analysisRunning ? (analyzing ? "running — analyzing…" : "running") : "paused"}
              </span>
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
            <span>
              Unanalyzed live text: {localDetection?.tokenEstimate ?? 0} tokens
              {pendingChunks.length > 0 ? ` (${pendingChunks.length} chunk${pendingChunks.length === 1 ? "" : "s"})` : ""}
            </span>
            {lastTranscriptionTime && <span>Last transcribed: {formatTime(lastTranscriptionTime)}</span>}
            {lastAnalyzedAt && <span>Last analyzed: {formatTime(lastAnalyzedAt)}</span>}
            {lastDetectionReason && <span>Last detection reason: {REASON_LABELS[lastDetectionReason]}</span>}
            {lastSignalTerms.length > 0 && <span>Last signal terms: {lastSignalTerms.join(", ")}</span>}
          </div>
        </>
      )}

      {!supported && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
          This browser doesn&apos;t support microphone recording (no MediaRecorder/getUserMedia) -
          manual transcript input still works below.
        </p>
      )}

      {supported && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!recording ? (
            <WriteButton
              type="button"
              onClick={handleStartClick}
              className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Start live capture
            </WriteButton>
          ) : (
            <WriteButton
              type="button"
              onClick={handleStop}
              className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 dark:border-red-800 dark:text-red-400"
            >
              Stop live capture
            </WriteButton>
          )}

          {analysisRunning ? (
            <WriteButton
              type="button"
              onClick={handlePause}
              disabled={!recording}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
            >
              Pause analysis
            </WriteButton>
          ) : (
            <WriteButton
              type="button"
              onClick={handleResume}
              disabled={analyzing}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
            >
              {analyzing ? "Resuming…" : "Resume analysis"}
            </WriteButton>
          )}

          <WriteButton
            type="button"
            onClick={handleManualAnalyze}
            disabled={pendingChunks.length === 0 || analyzing}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
          >
            {analyzing ? "Analyzing…" : "Analyze live text"}
          </WriteButton>

          <WriteButton
            type="button"
            onClick={handleClearBuffer}
            disabled={pendingChunks.length === 0}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
          >
            Clear unanalyzed text
          </WriteButton>
        </div>
      )}

      {pendingChunks.length > 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900 dark:bg-amber-950">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            {readyToAnalyze ? "Ready to analyze" : "Unanalyzed live text"}
            {localDetection && !readyToAnalyze ? ` — ${REASON_LABELS[localDetection.reason]}` : ""}
          </p>
          <p className="mt-1 text-amber-900/80 dark:text-amber-300/80">{pendingText}</p>
          {localDetection && localDetection.signalTerms.length > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-500">
              Signal terms: {localDetection.signalTerms.join(", ")}
            </p>
          )}
        </div>
      )}

      {pendingChunks.length === 0 && lastDetectionReason && (lastDetectionReason === "filler_only" || lastDetectionReason === "empty") && (
        <p className="mt-2 text-xs text-neutral-400">No meaningful speech detected in the last chunk.</p>
      )}

      {!recording && micReleased && (
        <p className="mt-2 text-xs text-neutral-400">Microphone stream released.</p>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {showConsent && (
        <ConsentModal onConfirm={handleConfirmStart} onCancel={() => setShowConsent(false)} />
      )}

      {supported && (
        <LiveAudioRecorder
          recording={recording}
          chunkIntervalMs={CHUNK_INTERVAL_MS}
          onChunk={uploadChunk}
          onError={(message) => {
            setError(message);
            setRecording(false);
          }}
          onStreamReleased={() => setMicReleased(true)}
        />
      )}
    </section>
  );
}

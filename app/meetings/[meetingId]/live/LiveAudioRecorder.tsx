"use client";

import { useEffect, useRef } from "react";

const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function browserSupportsLiveAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export interface LiveAudioRecorderProps {
  /** Toggling this on/off starts/stops mic capture and releases the stream on false. */
  recording: boolean;
  /** How often to cut a chunk and hand it off, in ms. Read once per recording session start. */
  chunkIntervalMs?: number;
  onChunk: (blob: Blob, durationMs: number, chunkIndex: number) => void;
  onError: (message: string) => void;
  /** Fires once the mic stream's tracks are actually stopped/released. */
  onStreamReleased?: () => void;
}

/**
 * Sprint 11, Part B. Headless (renders nothing) - pure mic-capture logic,
 * controlled entirely via the `recording` prop. Cuts a fresh, independently
 * decodable audio file every `chunkIntervalMs` by stopping and immediately
 * restarting a new MediaRecorder on the same stream, rather than relying on
 * MediaRecorder's `start(timeslice)` mode - timeslice-sliced WebM chunks
 * aren't reliably standalone-decodable across browsers, and a real
 * stop/start per chunk sidesteps that entirely at the cost of a few
 * milliseconds of gap per cut, which is fine for this prototype's ~15s
 * chunks.
 *
 * Callbacks are read through refs updated every render (not captured in
 * the mic-setup effect's closure) so a parent's `onChunk` always reflects
 * current state (e.g. whether analysis is paused) without needing to
 * restart the mic stream just because a callback identity changed.
 */
export default function LiveAudioRecorder({
  recording,
  chunkIntervalMs = 15000,
  onChunk,
  onError,
  onStreamReleased,
}: LiveAudioRecorderProps) {
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);
  const onStreamReleasedRef = useRef(onStreamReleased);
  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onStreamReleasedRef.current = onStreamReleased;
  }, [onStreamReleased]);

  useEffect(() => {
    if (!recording) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let chunkIndex = 0;
    let chunkStartedAt = 0;
    let stopping = false;

    function startNewRecorder(activeStream: MediaStream) {
      const mimeType = pickSupportedMimeType();
      recorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
      chunkStartedAt = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          onChunkRef.current(event.data, Date.now() - chunkStartedAt, chunkIndex);
          chunkIndex += 1;
        }
      };

      recorder.onstop = () => {
        // A chunk-cut stop, not the real stop (that path clears
        // `stopping` before calling recorder.stop()) - immediately start
        // a fresh recorder on the same stream so capture continues.
        if (!stopping && stream) {
          startNewRecorder(stream);
        }
      };

      recorder.onerror = () => {
        onErrorRef.current("Recording error - the microphone stream may have been interrupted.");
      };

      recorder.start();
    }

    async function begin() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone permission was denied."
            : err instanceof DOMException && err.name === "NotFoundError"
              ? "No microphone was found on this device."
              : err instanceof Error
                ? err.message
                : "Could not access the microphone.";
        onErrorRef.current(message);
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      startNewRecorder(stream);
      intervalId = setInterval(() => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
        }
      }, chunkIntervalMs);
    }

    begin();

    return () => {
      cancelled = true;
      stopping = true;
      if (intervalId) clearInterval(intervalId);
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      onStreamReleasedRef.current?.();
    };
    // Deliberately only `recording`/`chunkIntervalMs` - callbacks are read
    // through the refs above so they don't need to be dependencies.
  }, [recording, chunkIntervalMs]);

  return null;
}

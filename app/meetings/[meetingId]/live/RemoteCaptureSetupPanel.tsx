"use client";

import { WriteSelect, WriteInput, WriteTextarea } from "@/app/RoleControls";

import { useState } from "react";
import Link from "next/link";
import type { RemoteCaptureReadinessView } from "@/lib/services/remoteCaptureReadiness";
import type { RemoteCaptureSetup } from "@/lib/types/database";

const CAPTURE_SETUP_OPTIONS: { value: RemoteCaptureSetup; label: string }[] = [
  { value: "unknown", label: "Not decided yet" },
  { value: "blackhole_virtual_audio", label: "BlackHole / virtual audio routing" },
  { value: "two_laptop_external_mic", label: "Two laptops + external mic near speaker" },
  { value: "two_laptop_builtin_mic", label: "Two laptops + built-in mic" },
  { value: "same_laptop_speakers", label: "Same laptop + speakers + browser mic" },
  { value: "browser_mic_room_audio", label: "Same laptop + browser mic (in-room audio)" },
  { value: "manual_notes_primary", label: "Manual notes only (no live capture)" },
];

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Sprint 32 Part B: a collapsible, entirely optional pre-call checklist
 * for remote conversations - browser mic alone often can't hear a remote
 * participant reliably (see docs/remote-conversation-capture-guide.md).
 * Deliberately separate from Pilot Readiness (which still owns consent/
 * disclosure) and from Live Capture itself (whose recording/analysis
 * behavior this panel never touches - it only records what the
 * facilitator plans/observes). Internal-only, never read by export/share.
 */
export default function RemoteCaptureSetupPanel({
  meetingId,
  initialReadiness,
}: {
  meetingId: string;
  initialReadiness: RemoteCaptureReadinessView;
}) {
  const [open, setOpen] = useState(false);
  const [readiness, setReadiness] = useState<RemoteCaptureReadinessView>(initialReadiness);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(overrides: Partial<RemoteCaptureReadinessView>) {
    setError(null);
    setStatus("saving");
    const next = { ...readiness, ...overrides };
    setReadiness(next);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/remote-capture-readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureSetup: next.capture_setup,
          preCallTestCompleted: next.pre_call_test_completed,
          remoteAudioCapturedClearly: next.remote_audio_captured_clearly,
          userVoiceDominated: next.user_voice_dominated,
          manualBackupReady: next.manual_backup_ready,
          notes: next.notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save remote capture setup");
      }
      setReadiness({ ...next, ...result });
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save remote capture setup");
    }
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Remote capture setup
        </h2>
        <span className="text-xs text-neutral-400">{open ? "Hide" : "Show"}</span>
      </button>
      <p className="mt-1 text-xs text-neutral-500">
        Remote calls can be unreliable with browser mic alone. Test capture before the meeting and
        use manual anchor notes for critical claims.
      </p>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Capture setup
            </label>
            <WriteSelect
              value={readiness.capture_setup}
              onChange={(e) => save({ capture_setup: e.target.value as RemoteCaptureSetup })}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              {CAPTURE_SETUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WriteSelect>
            <p className="mt-1 text-[11px] text-neutral-400">
              See <code className="text-[11px]">docs/remote-conversation-capture-guide.md</code> for
              setup instructions and tradeoffs.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <WriteInput
                type="checkbox"
                checked={readiness.pre_call_test_completed}
                onChange={(e) => save({ pre_call_test_completed: e.target.checked })}
              />
              Pre-call test completed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <WriteInput
                type="checkbox"
                checked={readiness.remote_audio_captured_clearly}
                onChange={(e) => save({ remote_audio_captured_clearly: e.target.checked })}
              />
              Remote audio captured clearly
            </label>
            <label className="flex items-center gap-2 text-sm">
              <WriteInput
                type="checkbox"
                checked={readiness.user_voice_dominated}
                onChange={(e) => save({ user_voice_dominated: e.target.checked })}
              />
              My voice dominated the recording
            </label>
            <label className="flex items-center gap-2 text-sm">
              <WriteInput
                type="checkbox"
                checked={readiness.manual_backup_ready}
                onChange={(e) => save({ manual_backup_ready: e.target.checked })}
              />
              Manual backup ready
            </label>
          </div>

          <p className="text-[11px] text-neutral-400">
            Consent/disclosure is tracked separately in{" "}
            <Link
              href={`/meetings/${meetingId}/brief#pilot-readiness`}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Pilot Readiness
            </Link>{" "}
            - confirm it there before a real remote call.
          </p>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Notes</label>
            <WriteTextarea
              value={readiness.notes ?? ""}
              onChange={(e) => setReadiness((r) => ({ ...r, notes: e.target.value }))}
              onBlur={() => save({ notes: readiness.notes })}
              placeholder="Anything worth remembering about this setup for next time."
              rows={2}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>

          {status === "saved" && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
          {status === "error" && error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </section>
  );
}

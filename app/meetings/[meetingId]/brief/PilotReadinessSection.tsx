"use client";

import { WriteInput, WriteSelect, WriteTextarea } from "@/app/RoleControls";

import { useEffect, useRef, useState } from "react";
import type { PilotReadiness } from "@/lib/services/pilotReadiness";
import type { RecordingMode } from "@/lib/types/database";
import {
  CONSENT_DISCLOSURE_BULLETS,
  CONSENT_DISCLOSURE_COPY,
  CONSENT_DISCLOSURE_DISCLAIMER,
  PRE_MEETING_CHECKLIST_ITEMS,
  RECORDING_MODE_OPTIONS,
} from "@/lib/pilotReadinessConstants";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_MESSAGE_MS = 2500;

export default function PilotReadinessSection({
  meetingId,
  initialReadiness,
}: {
  meetingId: string;
  initialReadiness: PilotReadiness;
}) {
  const [readiness, setReadiness] = useState<PilotReadiness>(initialReadiness);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    initialReadiness.pre_meeting_checklist ?? {}
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  async function save(overrides: Partial<PilotReadiness> = {}, nextChecklist = checklist) {
    setError(null);
    setStatus("saving");
    const next = { ...readiness, ...overrides };
    try {
      const response = await fetch(`/api/meetings/${meetingId}/pilot-readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pilotMode: next.pilot_mode,
          consentConfirmed: next.consent_confirmed,
          consentNote: next.consent_note,
          recordingMode: next.recording_mode,
          knownLimitationsAcknowledged: next.known_limitations_acknowledged,
          preMeetingChecklist: nextChecklist,
          pilotNotes: next.pilot_notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save pilot readiness");
      }
      setReadiness(result as PilotReadiness);
      setChecklist((result as PilotReadiness).pre_meeting_checklist ?? {});
      setStatus("saved");
      savedTimeoutRef.current = setTimeout(() => setStatus("idle"), SAVED_MESSAGE_MS);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save pilot readiness");
    }
  }

  function toggleChecklistItem(key: string) {
    const nextChecklist = { ...checklist, [key]: !checklist[key] };
    setChecklist(nextChecklist);
    save({}, nextChecklist);
  }

  const saving = status === "saving";

  return (
    <section
      id="pilot-readiness"
      className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Pilot readiness
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Optional. Turn this on for a real meeting to track consent, recording mode, and a
            quick pre-meeting checklist. Not required for scenario/demo use.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
          <WriteInput
            type="checkbox"
            checked={readiness.pilot_mode}
            onChange={(e) => {
              const pilot_mode = e.target.checked;
              setReadiness((r) => ({ ...r, pilot_mode }));
              save({ pilot_mode });
            }}
          />
          Pilot mode
        </label>
      </div>

      {status === "saved" && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400">Saved.</p>
      )}
      {status === "error" && error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {readiness.pilot_mode && (
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Recording mode
            </h3>
            <WriteSelect
              value={readiness.recording_mode ?? ""}
              onChange={(e) => {
                const recording_mode = (e.target.value || null) as RecordingMode | null;
                setReadiness((r) => ({ ...r, recording_mode }));
                save({ recording_mode });
              }}
              className="mt-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">Not selected</option>
              {RECORDING_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </WriteSelect>
          </div>

          <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Consent &amp; disclosure
            </h3>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
              {CONSENT_DISCLOSURE_COPY}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
              {CONSENT_DISCLOSURE_BULLETS.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs italic text-amber-700 dark:text-amber-400">
              {CONSENT_DISCLOSURE_DISCLAIMER}
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <WriteInput
                type="checkbox"
                checked={readiness.consent_confirmed}
                onChange={(e) => {
                  const consent_confirmed = e.target.checked;
                  setReadiness((r) => ({ ...r, consent_confirmed }));
                  save({ consent_confirmed });
                }}
              />
              Consent confirmed with participants
            </label>
            <WriteTextarea
              value={readiness.consent_note ?? ""}
              onChange={(e) => setReadiness((r) => ({ ...r, consent_note: e.target.value }))}
              onBlur={() => save({ consent_note: readiness.consent_note })}
              placeholder="Optional consent note (e.g. how/when it was confirmed)"
              rows={2}
              className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs dark:border-amber-800 dark:bg-neutral-950"
            />
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <WriteInput
                type="checkbox"
                checked={readiness.known_limitations_acknowledged}
                onChange={(e) => {
                  const known_limitations_acknowledged = e.target.checked;
                  setReadiness((r) => ({ ...r, known_limitations_acknowledged }));
                  save({ known_limitations_acknowledged });
                }}
              />
              Known limitations acknowledged
            </label>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Pre-meeting checklist
            </h3>
            <ul className="mt-2 space-y-1.5">
              {PRE_MEETING_CHECKLIST_ITEMS.map((item) => (
                <li key={item.key}>
                  <label className="flex items-center gap-2 text-sm">
                    <WriteInput
                      type="checkbox"
                      checked={Boolean(checklist[item.key])}
                      onChange={() => toggleChecklistItem(item.key)}
                    />
                    {item.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Pilot notes
            </h3>
            <WriteTextarea
              value={readiness.pilot_notes ?? ""}
              onChange={(e) => setReadiness((r) => ({ ...r, pilot_notes: e.target.value }))}
              onBlur={() => save({ pilot_notes: readiness.pilot_notes })}
              placeholder="Anything worth remembering before you start (context, participants, setup notes)…"
              rows={3}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>

          {saving && <p className="text-xs text-neutral-400">Saving…</p>}
        </div>
      )}
    </section>
  );
}

"use client";

import { WriteInput, WriteTextarea } from "@/app/RoleControls";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PilotReadiness } from "@/lib/services/pilotReadiness";
import { POST_MEETING_CHECKLIST_ITEMS, recordingModeLabel } from "@/lib/pilotReadinessConstants";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_MESSAGE_MS = 2500;

/**
 * Internal-only post-meeting pilot checklist + issue log (Sprint 18 Parts D/G).
 * Deliberately lives only on this page, not in meetingExportBuilder/share -
 * pilot notes should never leak into exported/shared output by default.
 */
export default function PilotChecklistSection({
  meetingId,
  initialReadiness,
}: {
  meetingId: string;
  initialReadiness: PilotReadiness;
}) {
  const [readiness, setReadiness] = useState<PilotReadiness>(initialReadiness);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(
    initialReadiness.post_meeting_checklist ?? {}
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
          postMeetingChecklist: nextChecklist,
          issuesObserved: next.issues_observed,
          followupActions: next.followup_actions,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save pilot checklist");
      }
      setReadiness(result as PilotReadiness);
      setChecklist((result as PilotReadiness).post_meeting_checklist ?? {});
      setStatus("saved");
      savedTimeoutRef.current = setTimeout(() => setStatus("idle"), SAVED_MESSAGE_MS);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save pilot checklist");
    }
  }

  function toggleChecklistItem(key: string) {
    const nextChecklist = { ...checklist, [key]: !checklist[key] };
    setChecklist(nextChecklist);
    save({}, nextChecklist);
  }

  if (!readiness.pilot_mode) {
    return (
      <section className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        Pilot mode is off for this meeting.{" "}
        <Link
          href={`/meetings/${meetingId}/brief#pilot-readiness`}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Turn it on from the brief page
        </Link>{" "}
        to track a post-meeting pilot checklist here.
      </section>
    );
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Pilot readiness (internal)
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Facilitator-only. Not included in export/share output.
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
        <span>
          Consent:{" "}
          <span className={readiness.consent_confirmed ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
            {readiness.consent_confirmed ? "confirmed" : "not confirmed"}
          </span>
        </span>
        <span>Recording mode: {recordingModeLabel(readiness.recording_mode)}</span>
        <span>
          Limitations:{" "}
          <span className={readiness.known_limitations_acknowledged ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
            {readiness.known_limitations_acknowledged ? "acknowledged" : "not acknowledged"}
          </span>
        </span>
      </div>

      {readiness.pilot_notes && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pre-meeting pilot notes
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">
            {readiness.pilot_notes}
          </p>
        </div>
      )}

      {status === "saved" && (
        <p className="mt-2 text-xs text-green-600 dark:text-green-400">Saved.</p>
      )}
      {status === "error" && error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Post-meeting checklist
        </h3>
        <ul className="mt-2 space-y-1.5">
          {POST_MEETING_CHECKLIST_ITEMS.map((item) => (
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Issues observed
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Example: live capture missed a phrase; directions too generic; workflow missed an
            actor. Shows up grouped by category on the{" "}
            <Link href="/pilot" className="underline hover:text-neutral-500">
              Pilot Feedback
            </Link>{" "}
            dashboard.
          </p>
          <WriteTextarea
            value={readiness.issues_observed ?? ""}
            onChange={(e) => setReadiness((r) => ({ ...r, issues_observed: e.target.value }))}
            onBlur={() => save({ issues_observed: readiness.issues_observed })}
            placeholder="e.g. missed a named system, suggested directions too generic, live capture missed a phrase…"
            rows={4}
            className="mt-1.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Follow-up actions
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Example: tighten live-capture detection threshold; review direction prompt; double-
            check evidence quotes next time.
          </p>
          <WriteTextarea
            value={readiness.followup_actions ?? ""}
            onChange={(e) => setReadiness((r) => ({ ...r, followup_actions: e.target.value }))}
            onBlur={() => save({ followup_actions: readiness.followup_actions })}
            placeholder="What should change before the next pilot meeting?"
            rows={4}
            className="mt-1.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>
    </section>
  );
}

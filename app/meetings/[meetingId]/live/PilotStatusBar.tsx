import Link from "next/link";
import type { PilotReadiness } from "@/lib/services/pilotReadiness";
import { recordingModeLabel } from "@/lib/pilotReadinessConstants";

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
          : "rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
      }
    >
      {label}
    </span>
  );
}

/** Compact, meeting-scoped pilot status strip for the Live HUD - always visible so a facilitator can check consent/limitations mid-meeting without leaving the HUD, but small enough not to compete with Active focus / Workflow. */
export default function PilotStatusBar({
  meetingId,
  pilotReadiness,
}: {
  meetingId: string;
  pilotReadiness: PilotReadiness;
}) {
  if (!pilotReadiness.pilot_mode) {
    return (
      <div className="col-span-full flex items-center justify-between rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        <span>Pilot mode off (scenario/demo or informal use)</span>
        <Link
          href={`/meetings/${meetingId}/brief#pilot-readiness`}
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Set up pilot readiness
        </Link>
      </div>
    );
  }

  return (
    <div className="col-span-full flex flex-wrap items-center justify-between gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-1.5 dark:border-blue-900 dark:bg-blue-950">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
          Pilot
        </span>
        <StatusChip
          ok={pilotReadiness.consent_confirmed}
          label={pilotReadiness.consent_confirmed ? "Consent confirmed" : "Consent not confirmed"}
        />
        <StatusChip
          ok={pilotReadiness.known_limitations_acknowledged}
          label={
            pilotReadiness.known_limitations_acknowledged
              ? "Limitations acknowledged"
              : "Limitations not acknowledged"
          }
        />
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {recordingModeLabel(pilotReadiness.recording_mode)}
        </span>
      </div>
      <Link
        href={`/meetings/${meetingId}/brief#pilot-readiness`}
        className="text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        Edit
      </Link>
    </div>
  );
}

/**
 * Sprint 18: distinguishes scenario/demo meetings from real pilot meetings
 * at a glance. Purely presentational - `scenario_id` already existed
 * (Sprint 10), `pilotMode` comes from the new meeting_pilot_notes row. Used
 * on Brief/Live/Review headers so a facilitator can never mistake one for
 * the other.
 */

export function ScenarioBadge() {
  return (
    <span
      title="Created from a scenario fixture - demo/QA data, not a real meeting"
      className="rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400"
    >
      Scenario meeting
    </span>
  );
}

export function PilotBadge() {
  return (
    <span
      title="Marked as a real-use pilot meeting"
      className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
    >
      Pilot meeting
    </span>
  );
}

export function MeetingModeBadges({
  scenarioId,
  pilotMode,
}: {
  scenarioId: string | null;
  pilotMode: boolean;
}) {
  if (!scenarioId && !pilotMode) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {scenarioId && <ScenarioBadge />}
      {pilotMode && <PilotBadge />}
      {scenarioId && pilotMode && (
        <span
          title="This meeting was created from a scenario fixture but is also marked pilot mode - double-check that's intentional"
          className="text-xs text-amber-600 dark:text-amber-400"
        >
          ⚠ both scenario and pilot mode set
        </span>
      )}
    </div>
  );
}

import { OwnerOnly } from "./RoleControls";
import Link from "next/link";
import { getAllMeetings } from "@/lib/services/meetings";
import { getLatestEvaluationScores } from "@/lib/services/evaluations";
import { formatEnumLabel } from "@/lib/format";

// Must reflect newly created/updated meetings on every load - without this,
// Next would statically prerender the dashboard at build time (no dynamic
// route segment to force it otherwise) and bake in a stale meeting list.
export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium capitalize dark:border-neutral-700">
      {status}
    </span>
  );
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EvalScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  const styles =
    score >= 4
      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
      : score >= 2.5
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
        : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{score}/5</span>
  );
}

export default async function DashboardPage() {
  const meetings = await getAllMeetings();
  const latestEvaluations = await getLatestEvaluationScores(meetings.map((m) => m.id));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Start or reopen discovery meetings. Every meeting created so far, newest updated
            first.
          </p>
          <Link
            href="/pilot"
            className="mt-2 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            View pilot feedback →
          </Link>
        </div>
        <OwnerOnly><Link
          href="/meetings/new"
          className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          + New meeting
        </Link></OwnerOnly>
      </div>

      {meetings.length === 0 ? (
        <div className="mt-10 rounded border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500">No meetings yet.</p>
          <OwnerOnly><Link
            href="/meetings/new"
            className="mt-3 inline-block rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Create your first meeting
          </Link></OwnerOnly>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Strategy</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Eval</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2 font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => (
                <tr
                  key={meeting.id}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{meeting.name}</div>
                    {meeting.company && (
                      <div className="text-xs text-neutral-500">{meeting.company}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {formatEnumLabel(meeting.meeting_type)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {meeting.discovery_strategy ? formatEnumLabel(meeting.discovery_strategy) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={meeting.status} />
                  </td>
                  <td className="px-4 py-3">
                    <EvalScoreBadge score={latestEvaluations.get(meeting.id)?.overall_score} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{formatDate(meeting.created_at)}</td>
                  <td className="px-4 py-3 text-neutral-500">{formatDate(meeting.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <Link
                        href={`/meetings/${meeting.id}/brief`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Brief
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/live`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Live
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/workflow`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Workflow
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/review`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Review
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/share`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Share
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/evaluate`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Evaluate
                      </Link>
                      <Link
                        href={`/meetings/${meeting.id}/debug`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Debug
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

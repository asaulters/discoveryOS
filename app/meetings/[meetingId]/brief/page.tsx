import { notFound } from "next/navigation";
import Link from "next/link";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getPreMeetingBriefView } from "@/lib/services/setupAnalystService";
import { defaultPilotReadiness, getPilotReadiness } from "@/lib/services/pilotReadiness";
import StartMeetingButton from "./StartMeetingButton";
import GenerateBriefSection from "./GenerateBriefSection";
import PilotReadinessSection from "./PilotReadinessSection";
import MeetingHeader from "../MeetingHeader";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </h3>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default async function MeetingBriefPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const [details, briefView, pilotReadiness] = await Promise.all([
    getMeetingWithDetails(meetingId),
    getPreMeetingBriefView(meetingId),
    // Never let pilot readiness (Sprint 18) fail the whole brief page.
    getPilotReadiness(meetingId).catch(() => defaultPilotReadiness(meetingId)),
  ]);

  if (!details) {
    notFound();
  }

  const { meeting, contextItems } = details;
  const risks = (meeting.risks_unknowns ?? []) as string[];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <MeetingHeader
        meeting={meeting}
        pilotMode={pilotReadiness.pilot_mode}
        active="brief"
        purpose="Review the plan before the meeting starts."
      />

      <div className="space-y-6">
        <Field label="Goal" value={meeting.goal} />
        <Field label="Current understanding" value={meeting.current_understanding} />
        <Field
          label="Tentative build direction"
          value={meeting.tentative_build_direction}
        />

        {risks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Risks &amp; unknowns
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {risks.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>
        )}

        {contextItems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Pasted context
            </h3>
            {contextItems.map((item) => (
              <p
                key={item.id}
                className="mt-1 whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                {item.content}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <GenerateBriefSection meetingId={meeting.id} initialBriefView={briefView} />
      </div>

      <div className="mt-6">
        <PilotReadinessSection meetingId={meeting.id} initialReadiness={pilotReadiness} />
      </div>

      <div className="mt-10 flex flex-col items-start gap-3">
        {!briefView.brief && meeting.status !== "live" && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No discovery brief has been generated yet — consider generating one above
            before you start the meeting.
          </p>
        )}
        {meeting.status === "live" ? (
          <Link
            href={`/meetings/${meeting.id}/live`}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Go to Live
          </Link>
        ) : (
          <StartMeetingButton meetingId={meeting.id} />
        )}
      </div>
    </main>
  );
}

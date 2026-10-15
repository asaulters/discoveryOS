import { notFound } from "next/navigation";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getLatestEvaluationRun } from "@/lib/services/evaluations";
import { getScenarioById } from "@/lib/scenarios";
import { defaultPilotReadiness, getPilotReadiness } from "@/lib/services/pilotReadiness";
import EvaluateForm from "./EvaluateForm";
import MeetingHeader from "../MeetingHeader";

export default async function MeetingEvaluatePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  const [details, latest, pilotReadiness] = await Promise.all([
    getMeetingWithDetails(meetingId),
    getLatestEvaluationRun(meetingId),
    // Never let pilot readiness (Sprint 18) fail the whole evaluate page.
    getPilotReadiness(meetingId).catch(() => defaultPilotReadiness(meetingId)),
  ]);

  if (!details) {
    notFound();
  }

  const { meeting } = details;
  const scenario = meeting.scenario_id ? getScenarioById(meeting.scenario_id) ?? null : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <MeetingHeader
        meeting={meeting}
        pilotMode={pilotReadiness.pilot_mode}
        active="evaluate"
        purpose="Score the quality of this meeting's discovery output."
      />

      <EvaluateForm meetingId={meeting.id} initialLatest={latest} scenario={scenario} />
    </main>
  );
}

import SendToProject from "../../SendToProject";
import { notFound } from "next/navigation";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getWorkflowView } from "@/lib/services/workflows";
import { collectEvidenceSegmentIds } from "@/lib/services/hudState";
import { getTranscriptSegmentsByIds } from "@/lib/services/transcriptSegments";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import {
  defaultPilotReadiness,
  getPilotReadiness,
} from "@/lib/services/pilotReadiness";
import WorkflowDiagram from "./WorkflowDiagram";
import MeetingHeader from "../MeetingHeader";

export default async function MeetingWorkflowPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    notFound();
  }

  const workflow = await getWorkflowView(meetingId);
  const evidenceSegments = await getTranscriptSegmentsByIds(
    collectEvidenceSegmentIds(workflow),
  );
  const evidenceTranscriptSegments = Object.fromEntries(
    evidenceSegments.map((s) => [s.id, s]),
  );
  const ambiguityFlags = await getAmbiguityFlagsForMeeting(meetingId);
  const contradictionCandidates = await listContradictionCandidates(meetingId);
  // Never let pilot readiness (Sprint 18) fail the whole workflow page.
  const pilotReadiness = await getPilotReadiness(meetingId).catch(() =>
    defaultPilotReadiness(meetingId),
  );

  const { meeting } = details;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <MeetingHeader
        meeting={meeting}
        pilotMode={pilotReadiness.pilot_mode}
        active="workflow"
        purpose="Review the structured interpretation of the process and the evidence behind it."
      />

      <WorkflowDiagram
        meetingId={meeting.id}
        workflow={workflow}
        evidenceTranscriptSegments={evidenceTranscriptSegments}
        initialAmbiguityFlags={ambiguityFlags}
        initialContradictionCandidates={contradictionCandidates}
      />
      <SendToProject meetingId={meetingId} />
    </main>
  );
}

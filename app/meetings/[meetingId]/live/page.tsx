import { notFound } from "next/navigation";
import { getHudState } from "@/lib/services/hudState";
import {
  getDefaultRemoteCaptureReadiness,
  getRemoteCaptureReadiness,
} from "@/lib/services/remoteCaptureReadiness";
import HudShell from "./HudShell";

export default async function MeetingLivePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const [hudState, remoteCaptureReadiness] = await Promise.all([
    getHudState(meetingId),
    // Sprint 32: never let a not-yet-applied migration (or any other
    // failure) break the Live page - same fallback pattern as
    // pilotReadiness/fieldTests everywhere else in the app.
    getRemoteCaptureReadiness(meetingId).catch(() => getDefaultRemoteCaptureReadiness(meetingId)),
  ]);

  if (!hudState) {
    notFound();
  }

  return (
    <HudShell
      meetingId={meetingId}
      initialState={hudState}
      initialRemoteCaptureReadiness={remoteCaptureReadiness}
    />
  );
}

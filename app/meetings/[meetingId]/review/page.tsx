import { notFound } from "next/navigation";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getLatestPostMeetingReview } from "@/lib/services/postMeetingReviews";
import { defaultPilotReadiness, getPilotReadiness } from "@/lib/services/pilotReadiness";
import { listPilotIssuesForMeeting } from "@/lib/services/pilotIssues";
import { getLatestAppliedAiOpportunityAssessment } from "@/lib/services/appliedAiOpportunityAssessment";
import { defaultFieldTest, getFieldTestForMeeting } from "@/lib/services/fieldTests";
import ReviewSection from "./ReviewSection";
import ExportPanel from "./ExportPanel";
import PilotChecklistSection from "./PilotChecklistSection";
import TrackedPilotIssuesSection from "./TrackedPilotIssuesSection";
import AppliedAiAssessmentSection from "./AppliedAiAssessmentSection";
import FieldTestDebriefSection from "./FieldTestDebriefSection";
import MeetingHeader from "../MeetingHeader";

export default async function MeetingReviewPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  const [details, review, pilotReadiness, pilotIssues, appliedAiAssessment, fieldTest] = await Promise.all([
    getMeetingWithDetails(meetingId),
    getLatestPostMeetingReview(meetingId),
    // Never let pilot readiness (Sprint 18) fail the whole review page.
    getPilotReadiness(meetingId).catch(() => defaultPilotReadiness(meetingId)),
    // Never let tracked pilot issues (Sprint 20) fail the whole review page.
    listPilotIssuesForMeeting(meetingId).catch(() => []),
    // Never let the Sprint 25 Applied AI assessment fail the whole review page.
    getLatestAppliedAiOpportunityAssessment(meetingId).catch(() => null),
    // Never let the Sprint 28 field test (or a not-yet-applied migration) fail the whole review page.
    getFieldTestForMeeting(meetingId).catch(() => defaultFieldTest(meetingId)),
  ]);

  if (!details) {
    notFound();
  }

  const { meeting } = details;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <MeetingHeader
        meeting={meeting}
        pilotMode={pilotReadiness.pilot_mode}
        active="review"
        purpose="Turn the meeting into a cautious, evidence-grounded summary."
      />

      {/* External-facing: review generation/status, summary, open follow-ups, then export/share. */}
      <div className="space-y-6">
        <ReviewSection meetingId={meeting.id} initialReview={review} />
        {meeting.meeting_type === "applied_ai_discovery" && (
          <AppliedAiAssessmentSection
            meetingId={meeting.id}
            currentUnderstanding={meeting.current_understanding}
            initialAssessment={appliedAiAssessment}
          />
        )}
        <ExportPanel meetingId={meeting.id} meetingName={meeting.name} />
      </div>

      {/* Internal-only, visually separated so it never competes with the review above. */}
      <div className="mt-10">
        <div className="flex items-center gap-3">
          <h2 className="shrink-0 text-xs font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            Internal only
          </h2>
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Internal pilot notes are not included in shared or exported output.
        </p>

        <div className="mt-4 space-y-6">
          <PilotChecklistSection meetingId={meeting.id} initialReadiness={pilotReadiness} />
          <TrackedPilotIssuesSection
            meetingId={meeting.id}
            initialIssues={pilotIssues}
            issuesObservedText={pilotReadiness.issues_observed}
            sourcePilotNoteId={pilotReadiness.id}
          />
          <FieldTestDebriefSection meetingId={meeting.id} initialFieldTest={fieldTest} />
        </div>
      </div>
    </main>
  );
}

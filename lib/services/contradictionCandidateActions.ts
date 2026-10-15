import {
  dismissContradictionCandidate,
  getContradictionCandidateWithMeeting,
  listContradictionCandidates,
  markContradictionResolved,
} from "@/lib/services/contradictionCandidates";
import { logUserAction } from "@/lib/services/userActions";
import type { ContradictionCandidate } from "@/lib/types/database";

/**
 * The Workflow page manages its own local contradiction-candidate list
 * rather than reusing HudState (mirrors ambiguityFlagActions.ts) - these
 * actions return the refreshed list directly.
 */
async function finish(meetingId: string): Promise<ContradictionCandidate[]> {
  return listContradictionCandidates(meetingId);
}

export async function resolveContradictionCandidateAction(
  meetingId: string,
  candidateId: string,
  resolutionNote?: string | null
): Promise<ContradictionCandidate[]> {
  const found = await getContradictionCandidateWithMeeting(candidateId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Contradiction candidate not found");
  }

  await markContradictionResolved(candidateId, resolutionNote);
  await logUserAction(meetingId, "contradiction_candidate_resolved", { candidateId });

  return finish(meetingId);
}

export async function dismissContradictionCandidateAction(
  meetingId: string,
  candidateId: string,
  resolutionNote?: string | null
): Promise<ContradictionCandidate[]> {
  const found = await getContradictionCandidateWithMeeting(candidateId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Contradiction candidate not found");
  }

  await dismissContradictionCandidate(candidateId, resolutionNote);
  await logUserAction(meetingId, "contradiction_candidate_dismissed", { candidateId });

  return finish(meetingId);
}

import {
  dismissAmbiguityFlag,
  getAmbiguityFlagsForMeeting,
  getAmbiguityFlagWithMeeting,
  resolveAmbiguityFlag,
} from "@/lib/services/ambiguityFlags";
import { logUserAction } from "@/lib/services/userActions";
import type { AmbiguityFlag } from "@/lib/types/database";

/**
 * The Workflow Diagram page (Sprint 9) manages its own local ambiguity-flag
 * list rather than reusing the live HUD's HudState (it doesn't need
 * threads/directions/alerts) - these actions return the refreshed list
 * directly, matching how ReviewSection.tsx manages its own local review
 * state instead of coupling to HudState.
 */
async function finish(meetingId: string): Promise<AmbiguityFlag[]> {
  return getAmbiguityFlagsForMeeting(meetingId);
}

export async function resolveAmbiguityFlagAction(
  meetingId: string,
  flagId: string
): Promise<AmbiguityFlag[]> {
  const found = await getAmbiguityFlagWithMeeting(flagId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Ambiguity flag not found");
  }

  await resolveAmbiguityFlag(flagId);
  await logUserAction(meetingId, "ambiguity_flag_resolved", { flagId });

  return finish(meetingId);
}

export async function dismissAmbiguityFlagAction(
  meetingId: string,
  flagId: string
): Promise<AmbiguityFlag[]> {
  const found = await getAmbiguityFlagWithMeeting(flagId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Ambiguity flag not found");
  }

  await dismissAmbiguityFlag(flagId);
  await logUserAction(meetingId, "ambiguity_flag_dismissed", { flagId });

  return finish(meetingId);
}

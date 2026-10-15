import {
  getDirectionWithMeeting,
  updateDirectionStatus,
} from "@/lib/services/questionDirections";
import { createQueuedThread, findQueueableThreadByTitle, updateThreadFields } from "@/lib/services/threads";
import { logUserAction } from "@/lib/services/userActions";
import { getHudState, type HudState } from "@/lib/services/hudState";

async function loadDirectionOrThrow(meetingId: string, directionId: string) {
  const found = await getDirectionWithMeeting(directionId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Direction not found");
  }
  return found;
}

async function finish(meetingId: string): Promise<HudState> {
  const hudState = await getHudState(meetingId);
  if (!hudState) {
    throw new Error("Meeting not found");
  }
  return hudState;
}

export async function markDirectionUsed(meetingId: string, directionId: string): Promise<HudState> {
  const { direction } = await loadDirectionOrThrow(meetingId, directionId);

  await updateDirectionStatus(direction.id, "used");
  await logUserAction(meetingId, "direction_used", {
    directionId: direction.id,
    threadId: direction.discovery_thread_id,
  });

  return finish(meetingId);
}

export async function dismissDirection(meetingId: string, directionId: string): Promise<HudState> {
  const { direction } = await loadDirectionOrThrow(meetingId, directionId);

  await updateDirectionStatus(direction.id, "dismissed");
  await logUserAction(meetingId, "direction_dismissed", {
    directionId: direction.id,
    threadId: direction.discovery_thread_id,
  });

  return finish(meetingId);
}

export async function deferDirection(meetingId: string, directionId: string): Promise<HudState> {
  const { direction } = await loadDirectionOrThrow(meetingId, directionId);

  const existingThread = await findQueueableThreadByTitle(meetingId, direction.text);

  const queuedThread = existingThread
    ? await updateThreadFields(existingThread.id, {
        status: "deferred",
        in_queue: true,
        why_it_matters: direction.reason ?? existingThread.why_it_matters,
      })
    : await createQueuedThread(meetingId, direction.text, direction.reason);

  await updateDirectionStatus(direction.id, "deferred");
  await logUserAction(meetingId, "direction_deferred", {
    directionId: direction.id,
    threadId: direction.discovery_thread_id,
    queuedThreadId: queuedThread.id,
  });

  return finish(meetingId);
}

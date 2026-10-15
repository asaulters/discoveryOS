import {
  ensureDefaultActiveThread,
  getActiveThread,
  getNextQueueSortOrder,
  getThreadById,
  updateThreadFields,
} from "@/lib/services/threads";
import { logUserAction } from "@/lib/services/userActions";
import { getHudState, type HudState } from "@/lib/services/hudState";

async function loadThreadOrThrow(meetingId: string, threadId: string) {
  const thread = await getThreadById(threadId);
  if (!thread || thread.meeting_id !== meetingId) {
    throw new Error("Thread not found");
  }
  return thread;
}

async function finish(meetingId: string): Promise<HudState> {
  const hudState = await getHudState(meetingId);
  if (!hudState) {
    throw new Error("Meeting not found");
  }
  return hudState;
}

/**
 * Focuses a queued thread: the previous active thread (if any) returns to
 * the open queue, and the selected thread becomes active and locked so
 * nothing else can silently take over while the facilitator is on it. This
 * is always a direct user action - nothing here runs from AI output.
 */
export async function focusThread(meetingId: string, threadId: string): Promise<HudState> {
  const target = await loadThreadOrThrow(meetingId, threadId);

  if (target.status === "active") {
    return finish(meetingId);
  }

  const currentActive = await getActiveThread(meetingId);
  if (currentActive) {
    await updateThreadFields(currentActive.id, {
      status: "open",
      in_queue: true,
      locked_until_release: false,
      sort_order: await getNextQueueSortOrder(meetingId),
    });
  }

  await updateThreadFields(target.id, {
    status: "active",
    in_queue: false,
    locked_until_release: true,
  });

  await logUserAction(meetingId, "thread_focused", {
    threadId: target.id,
    previousActiveThreadId: currentActive?.id ?? null,
  });

  return finish(meetingId);
}

export async function releaseFocus(meetingId: string, threadId: string): Promise<HudState> {
  const target = await loadThreadOrThrow(meetingId, threadId);

  if (target.status !== "active") {
    throw new Error("Thread is not currently focused");
  }

  await updateThreadFields(target.id, { locked_until_release: false });
  await logUserAction(meetingId, "focus_released", { threadId: target.id });

  return finish(meetingId);
}

export async function markThreadCovered(meetingId: string, threadId: string): Promise<HudState> {
  const target = await loadThreadOrThrow(meetingId, threadId);

  await updateThreadFields(target.id, {
    status: "covered",
    in_queue: false,
    locked_until_release: false,
  });
  await logUserAction(meetingId, "thread_marked_covered", { threadId: target.id });

  // Keep the HUD populated by promoting the next queued thread, if any.
  await ensureDefaultActiveThread(meetingId);

  return finish(meetingId);
}

/**
 * Sprint 30 Part B: returns the currently-focused thread to the queue as
 * "deferred" rather than "open" - same mechanics as releaseFocus (unlocks,
 * re-queues, promotes the next thread) but distinct status so Still to
 * explore can show it collapsed/secondary instead of mixed in with open
 * items (see HudShell.tsx). "deferred" was already a valid ThreadStatus
 * (used by directions' own defer action) but had no thread-level action
 * wired to it until now - a plain status transition, not a new AI feature.
 */
export async function deferThread(meetingId: string, threadId: string): Promise<HudState> {
  const target = await loadThreadOrThrow(meetingId, threadId);

  await updateThreadFields(target.id, {
    status: "deferred",
    in_queue: true,
    locked_until_release: false,
    sort_order: await getNextQueueSortOrder(meetingId),
  });
  await logUserAction(meetingId, "thread_deferred", { threadId: target.id });

  // Keep the HUD populated by promoting the next queued (non-deferred) thread, if any.
  await ensureDefaultActiveThread(meetingId);

  return finish(meetingId);
}

import {
  dismissGap,
  getWorkflowComponentWithMeeting,
  getWorkflowGapWithMeeting,
  getWorkflowItemMeetingId,
  getWorkflowStepWithMeeting,
  lockWorkflowItem,
  markGapAnswered,
  markWorkflowItemVerified,
  unlockWorkflowItem,
  updateWorkflowComponent,
  updateWorkflowGap,
  updateWorkflowStep,
  type WorkflowComponentEditInput,
  type WorkflowGapEditInput,
  type WorkflowItemType,
  type WorkflowStepEditInput,
} from "@/lib/services/workflows";
import { logUserAction } from "@/lib/services/userActions";
import { getHudState, type HudState } from "@/lib/services/hudState";

async function finish(meetingId: string): Promise<HudState> {
  const hudState = await getHudState(meetingId);
  if (!hudState) {
    throw new Error("Meeting not found");
  }
  return hudState;
}

async function requireItemMeetingId(
  meetingId: string,
  itemType: WorkflowItemType,
  itemId: string
): Promise<void> {
  const foundMeetingId = await getWorkflowItemMeetingId(itemType, itemId);
  if (!foundMeetingId || foundMeetingId !== meetingId) {
    throw new Error(`Workflow ${itemType} not found`);
  }
}

export async function editWorkflowStep(
  meetingId: string,
  stepId: string,
  input: WorkflowStepEditInput
): Promise<HudState> {
  const found = await getWorkflowStepWithMeeting(stepId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Workflow step not found");
  }

  await updateWorkflowStep(stepId, input);
  await logUserAction(meetingId, "workflow_step_edited", { stepId, ...input });

  return finish(meetingId);
}

export async function editWorkflowComponent(
  meetingId: string,
  componentId: string,
  input: WorkflowComponentEditInput
): Promise<HudState> {
  const found = await getWorkflowComponentWithMeeting(componentId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Workflow component not found");
  }

  await updateWorkflowComponent(componentId, input);
  await logUserAction(meetingId, "workflow_component_edited", { componentId, ...input });

  return finish(meetingId);
}

export async function editWorkflowGap(
  meetingId: string,
  gapId: string,
  input: WorkflowGapEditInput
): Promise<HudState> {
  const found = await getWorkflowGapWithMeeting(gapId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Workflow gap not found");
  }

  await updateWorkflowGap(gapId, input);
  await logUserAction(meetingId, "workflow_gap_edited", { gapId, ...input });

  return finish(meetingId);
}

export async function verifyWorkflowItem(
  meetingId: string,
  itemType: WorkflowItemType,
  itemId: string
): Promise<HudState> {
  await requireItemMeetingId(meetingId, itemType, itemId);

  await markWorkflowItemVerified(itemType, itemId);
  await logUserAction(meetingId, "workflow_item_verified", { itemType, itemId });

  return finish(meetingId);
}

export async function lockWorkflowItemAction(
  meetingId: string,
  itemType: WorkflowItemType,
  itemId: string
): Promise<HudState> {
  await requireItemMeetingId(meetingId, itemType, itemId);

  await lockWorkflowItem(itemType, itemId);
  await logUserAction(meetingId, "workflow_item_locked", { itemType, itemId });

  return finish(meetingId);
}

export async function unlockWorkflowItemAction(
  meetingId: string,
  itemType: WorkflowItemType,
  itemId: string
): Promise<HudState> {
  await requireItemMeetingId(meetingId, itemType, itemId);

  await unlockWorkflowItem(itemType, itemId);
  await logUserAction(meetingId, "workflow_item_unlocked", { itemType, itemId });

  return finish(meetingId);
}

export async function markWorkflowGapAnsweredAction(
  meetingId: string,
  gapId: string
): Promise<HudState> {
  const found = await getWorkflowGapWithMeeting(gapId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Workflow gap not found");
  }

  await markGapAnswered(gapId);
  await logUserAction(meetingId, "workflow_gap_answered", { gapId });

  return finish(meetingId);
}

export async function dismissWorkflowGapAction(
  meetingId: string,
  gapId: string
): Promise<HudState> {
  const found = await getWorkflowGapWithMeeting(gapId);
  if (!found || found.meetingId !== meetingId) {
    throw new Error("Workflow gap not found");
  }

  await dismissGap(gapId);
  await logUserAction(meetingId, "workflow_gap_dismissed", { gapId });

  return finish(meetingId);
}

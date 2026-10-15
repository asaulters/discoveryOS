import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveThread, getDirectionsForThread, getQueuedThreads } from "@/lib/services/threads";
import {
  getRecentTranscriptSegmentsForMeeting,
  getTranscriptSegmentsByIds,
} from "@/lib/services/transcriptSegments";
import { getWorkflowView, type WorkflowView } from "@/lib/services/workflows";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import {
  defaultPilotReadiness,
  getPilotReadiness,
  type PilotReadiness,
} from "@/lib/services/pilotReadiness";
import type {
  Alert,
  DiscoveryThread,
  Meeting,
  QuestionDirection,
  TranscriptSegment,
} from "@/lib/types/database";

export interface HudState {
  meeting: Meeting;
  activeThread: DiscoveryThread | null;
  queuedThreads: DiscoveryThread[];
  directions: QuestionDirection[];
  alerts: Alert[];
  recentTranscriptSegments: TranscriptSegment[];
  workflow: WorkflowView | null;
  /** Transcript segments cited as workflow evidence, keyed by id, for the evidence drawer - may include segments outside recentTranscriptSegments. */
  evidenceTranscriptSegments: Record<string, TranscriptSegment>;
  /** Sprint 29: transient, not persisted - only set on the response right after a chunk analysis whose fast-loop call failed (timeout/provider error/etc). The transcript segment itself is always saved before this can happen - see transcriptAnalysis.ts's runAnalysisPipeline. */
  fastLoopWarning?: string | null;
  /** Transient, not persisted - only set on the response right after a chunk analysis whose workflow extraction failed. */
  workflowExtractionWarning?: string | null;
  /** Transient, not persisted - only set on the response right after a chunk analysis whose contradiction detection failed. */
  contradictionDetectionWarning?: string | null;
  /** Sprint 15: transient, not persisted - only set on the response right after a chunk analysis whose conversation-state analysis failed. */
  conversationStateWarning?: string | null;
  /** Sprint 12: count of open ("needs clarification") contradiction candidates - a small, non-alarming compact indicator, not a loud alert. Full detail lives on the Workflow page. */
  openContradictionCount: number;
  /** Sprint 18: real-meeting pilot readiness state, for the HUD's compact status strip. Row-or-defaults - never null. */
  pilotReadiness: PilotReadiness;
}

/** Exported so other pages needing the same evidence-segment lookup (e.g. the Workflow Diagram page) don't have to duplicate this. */
export function collectEvidenceSegmentIds(workflow: WorkflowView | null): string[] {
  if (!workflow) {
    return [];
  }
  const ids = new Set<string>();
  for (const item of [...workflow.steps, ...workflow.components, ...workflow.gaps]) {
    if (item.source_transcript_segment_id) {
      ids.add(item.source_transcript_segment_id);
    }
  }
  return Array.from(ids);
}

export async function getHudState(meetingId: string): Promise<HudState | null> {
  const supabase = await createServerSupabaseClient();

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingError) {
    throw new Error(`Failed to load meeting: ${meetingError.message}`);
  }
  if (!meeting) {
    return null;
  }

  const activeThread = await getActiveThread(meetingId);
  const queuedThreads = await getQueuedThreads(meetingId);
  const directions = activeThread ? await getDirectionsForThread(activeThread.id) : [];
  const recentTranscriptSegments = await getRecentTranscriptSegmentsForMeeting(meetingId, 5);
  const workflow = await getWorkflowView(meetingId);

  const evidenceSegments = await getTranscriptSegmentsByIds(collectEvidenceSegmentIds(workflow));
  const evidenceTranscriptSegments = Object.fromEntries(evidenceSegments.map((s) => [s.id, s]));

  const contradictionCandidates = await listContradictionCandidates(meetingId);
  const openContradictionCount = contradictionCandidates.filter((c) => c.status === "open").length;
  // Never let pilot-readiness (Sprint 18, meeting_pilot_notes) fail the
  // whole HUD - same "non-essential data source" pattern as
  // app/regression/page.tsx's recentRunsError handling.
  const pilotReadiness = await getPilotReadiness(meetingId).catch(() =>
    defaultPilotReadiness(meetingId)
  );

  // Alert-generation logic is not implemented in Sprint 1/2.
  const alerts: Alert[] = [];

  return {
    meeting,
    activeThread,
    queuedThreads,
    directions,
    alerts,
    recentTranscriptSegments,
    workflow,
    evidenceTranscriptSegments,
    openContradictionCount,
    pilotReadiness,
  };
}

import { getMeetingWithDetails, type MeetingWithDetails } from "@/lib/services/meetings";
import { getActiveThread, updateThreadConfidence } from "@/lib/services/threads";
import {
  createTranscriptSegment,
  getTranscriptSegmentsForThread,
} from "@/lib/services/transcriptSegments";
import { analyzeTranscriptChunk } from "@/lib/services/fastLoopService";
import { extractWorkflowFromTranscript } from "@/lib/services/workflowExtractorService";
import { detectContradictions } from "@/lib/ai/contradictionDetectorService";
import { analyzeConversationState, type ConversationContextForFastLoop } from "@/lib/ai/conversationStateAnalyzerService";
import { refreshDirectionsForThread } from "@/lib/services/questionDirections";
import { logUserAction } from "@/lib/services/userActions";
import { getHudState, type HudState } from "@/lib/services/hudState";
import { isHigherConfidence } from "@/lib/confidence";
import type { DiscoveryThread, TranscriptionMetadata } from "@/lib/types/database";

/**
 * The fast-loop + workflow-extractor pipeline, shared by every way a
 * transcript segment can trigger analysis (manual submission, live audio
 * with analysis running, and the pending-analysis catch-up after a pause).
 * Reads ALL segments heard so far for the active thread/meeting, not just
 * the triggering one, so it's always safe to call this anchored on
 * whichever segment is newest - Live audio is only an input method into
 * this same path, never a separate reasoning path (Sprint 11 product
 * principle).
 */
async function runAnalysisPipeline(
  meetingId: string,
  details: MeetingWithDetails,
  activeThread: DiscoveryThread,
  latestTranscriptSegmentId: string
): Promise<HudState> {
  const priorSegments = await getTranscriptSegmentsForThread(activeThread.id);
  const transcriptChunks = priorSegments.map((segment) => segment.raw_text);

  // Sprint 15: runs before the fast loop (not after, unlike the workflow
  // extractor/contradiction detector) so its output - facilitator's latest
  // question/hypothesis, stakeholder's latest answer, topic signals - can
  // actually inform the fast loop's directions this same pass. Fail-soft:
  // a failure here must never block the fast loop the facilitator is
  // waiting on, so it's caught here rather than inside the service itself.
  let conversationStateWarning: string | null = null;
  let conversationContext: ConversationContextForFastLoop | null = null;
  try {
    conversationContext = await analyzeConversationState(meetingId, activeThread, latestTranscriptSegmentId);
  } catch (err) {
    conversationStateWarning =
      err instanceof Error ? err.message : "Conversation state analysis failed";
  }

  // Sprint 29: the transcript segment is already saved by the time this
  // runs (created before runAnalysisPipeline is ever called), so a fast-loop
  // failure - timeout, provider error, whatever - must never look like a
  // lost chunk. Fail-soft like the three analyses below it: catch here,
  // surface fastLoopWarning, and simply skip the directions/confidence/log
  // updates that depend on a result that doesn't exist.
  let fastLoopWarning: string | null = null;
  try {
    const analysis = await analyzeTranscriptChunk({
      meeting: details.meeting,
      assumptions: details.assumptions,
      activeThread,
      transcriptChunks,
      conversationContext,
    });

    await refreshDirectionsForThread(activeThread.id, analysis.directions);

    if (isHigherConfidence(analysis.understandingLevel, activeThread.confidence_level)) {
      await updateThreadConfidence(activeThread.id, analysis.understandingLevel);
    }

    await logUserAction(meetingId, "transcript_chunk_analyzed", {
      threadId: activeThread.id,
      understandingLevel: analysis.understandingLevel,
    });
  } catch (err) {
    fastLoopWarning = err instanceof Error ? err.message : "Fast loop analysis failed";
  }

  // The workflow extractor runs after the fast loop and is kept fully
  // separate: it never touches thread focus or directions, and if it fails
  // that must not break the fast-loop result the facilitator is waiting on
  // - the failure is already logged via ai_run_logs inside the extractor,
  // so here we only need to keep going and surface a soft warning.
  let workflowExtractionWarning: string | null = null;
  try {
    await extractWorkflowFromTranscript(meetingId, latestTranscriptSegmentId);
  } catch (err) {
    workflowExtractionWarning =
      err instanceof Error ? err.message : "Workflow extraction failed";
  }

  // Sprint 12: runs after the workflow extractor, same fail-soft pattern -
  // a detection failure must never take down the fast-loop/workflow result
  // the facilitator is waiting on. No separate reasoning path for live
  // audio: this runs on whatever's accumulated in transcript_segments
  // regardless of how each segment was captured.
  let contradictionDetectionWarning: string | null = null;
  try {
    await detectContradictions(meetingId, latestTranscriptSegmentId);
  } catch (err) {
    contradictionDetectionWarning =
      err instanceof Error ? err.message : "Contradiction detection failed";
  }

  const hudState = await getHudState(meetingId);
  if (!hudState) {
    throw new Error("Failed to load HUD state after analysis");
  }

  return {
    ...hudState,
    fastLoopWarning,
    workflowExtractionWarning,
    contradictionDetectionWarning,
    conversationStateWarning,
  };
}

export async function submitTranscriptChunk(
  meetingId: string,
  rawText: string
): Promise<HudState> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const activeThread = await getActiveThread(meetingId);
  if (!activeThread) {
    throw new Error("No active discovery thread");
  }

  const segment = await createTranscriptSegment(meetingId, activeThread.id, rawText);

  return runAnalysisPipeline(meetingId, details, activeThread, segment.id);
}

/**
 * Sprint 11: creates a transcript segment from a live-audio-transcribed
 * chunk (source_type "live_audio"). When `runAnalysis` is true (analysis
 * running), behaves exactly like `submitTranscriptChunk` - same pipeline,
 * just a different segment source. When false (analysis paused), only the
 * segment is saved; no fast-loop or workflow-extractor call happens, and
 * the caller is expected to trigger `analyzePendingTranscript` later (via
 * "Analyze latest segment now" / resuming analysis).
 */
export async function submitLiveAudioSegment(
  meetingId: string,
  rawText: string,
  transcriptionMetadata: TranscriptionMetadata,
  runAnalysis: boolean
): Promise<{ hudState: HudState; segmentId: string }> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const activeThread = await getActiveThread(meetingId);
  if (!activeThread) {
    throw new Error("No active discovery thread");
  }

  const segment = await createTranscriptSegment(
    meetingId,
    activeThread.id,
    rawText,
    "live_audio",
    transcriptionMetadata
  );

  if (!runAnalysis) {
    const hudState = await getHudState(meetingId);
    if (!hudState) {
      throw new Error("Failed to load HUD state after saving live segment");
    }
    return { hudState, segmentId: segment.id };
  }

  const hudState = await runAnalysisPipeline(meetingId, details, activeThread, segment.id);
  return { hudState, segmentId: segment.id };
}

/**
 * Sprint 11: runs the fast-loop + workflow-extractor pipeline against
 * whatever transcript segments already exist for the active thread,
 * without creating a new one - used by "Analyze latest segment now" /
 * resuming analysis after a pause. Since the fast loop and workflow
 * extractor both already read the full accumulated transcript for the
 * thread/meeting (not just one chunk), a single call anchored on the most
 * recent segment picks up everything that accumulated while paused - no
 * need to loop per pending segment. Documented behavior, not a limitation
 * to fix later: "analyze pending" always means "catch up on everything
 * heard since the last analysis," never a per-segment replay.
 */
export async function analyzePendingTranscript(meetingId: string): Promise<HudState> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    throw new Error("Meeting not found");
  }

  const activeThread = await getActiveThread(meetingId);
  if (!activeThread) {
    throw new Error("No active discovery thread");
  }

  const segments = await getTranscriptSegmentsForThread(activeThread.id);
  const latest = segments[segments.length - 1];
  if (!latest) {
    throw new Error("No transcript segments to analyze yet");
  }

  return runAnalysisPipeline(meetingId, details, activeThread, latest.id);
}

import { NextRequest, NextResponse } from "next/server";
import { submitLiveAudioSegment } from "@/lib/services/transcriptAnalysis";
import { detectMeaningfulSegment } from "@/lib/live/meaningfulSegments";

interface AnalyzeBufferRequestBody {
  text?: unknown;
  chunkCount?: unknown;
  latestChunkText?: unknown;
  secondsPending?: unknown;
  force?: unknown;
  analysisPausedAtCreation?: unknown;
  mimeType?: unknown;
  model?: unknown;
}

/**
 * Sprint 13: turns the client's accumulated live-audio buffer into exactly
 * one transcript segment, but only when meaningful (or the user forced
 * it) - this is the real enforcement gate for meaningfulSegments.ts, not
 * just the client's UI hint, so a client bug can't cause an analysis
 * storm. Not truly idempotent: repeated identical requests would each
 * create their own segment (no stable buffer id/hash in Sprint 13) - the
 * client is expected to guard against that with its own in-flight flag,
 * this route only guards against *non-meaningful* text becoming a segment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  let body: AnalyzeBufferRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const latestChunkText = typeof body.latestChunkText === "string" ? body.latestChunkText : text;
  const secondsPending = typeof body.secondsPending === "number" ? body.secondsPending : 0;
  const force = body.force === true;
  const analysisPausedAtCreation = body.analysisPausedAtCreation === true;
  const chunkCount = typeof body.chunkCount === "number" ? body.chunkCount : 1;

  const detection = detectMeaningfulSegment({
    pendingText: text,
    latestChunkText,
    secondsSincePendingStart: secondsPending,
    // The route is only ever called when the client isn't paused, or the
    // user explicitly forced it - "paused" here would only suppress a
    // non-forced call, which the client shouldn't be making in the first
    // place, but re-checking keeps the server the real gate either way.
    analysisPaused: !force && analysisPausedAtCreation,
    analysisInFlight: false,
    forced: force,
  });

  if (!detection.shouldAnalyze) {
    return NextResponse.json(
      {
        created: false,
        shouldAnalyze: false,
        reason: detection.reason,
        signalTerms: detection.signalTerms,
        tokenEstimate: detection.tokenEstimate,
      },
      { status: 200 }
    );
  }

  try {
    const { hudState, segmentId } = await submitLiveAudioSegment(
      meetingId,
      text,
      {
        source: "live_audio_continuous",
        chunk_count: chunkCount,
        detection_reason: detection.reason,
        signal_terms: detection.signalTerms,
        token_estimate: detection.tokenEstimate,
        analyzed_from_buffer: true,
        analysis_paused_at_creation: analysisPausedAtCreation,
        mime_type: typeof body.mimeType === "string" ? body.mimeType : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
      },
      true
    );

    return NextResponse.json(
      { ...hudState, created: true, segmentId, detection },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze live audio buffer";
    const status =
      message === "Meeting not found" || message === "No active discovery thread" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

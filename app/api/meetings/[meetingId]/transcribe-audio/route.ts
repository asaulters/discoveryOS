import { NextRequest, NextResponse } from "next/server";
import { getMeetingWithDetails } from "@/lib/services/meetings";
import { transcribeAudio } from "@/lib/services/audioTranscription";

/**
 * Sprint 13: pure transcription only - this route no longer creates a
 * transcript_segments row. Continuous-mode live audio buffers transcribed
 * text client-side (see LiveAudioPanel.tsx) and decides, via
 * lib/live/meaningfulSegments.ts, when to call
 * POST /api/meetings/[meetingId]/live-audio/analyze-buffer to turn the
 * buffer into exactly one segment. Splitting the concerns this way keeps
 * every ~10-15s chunk from becoming its own noisy segment (Sprint 11's
 * behavior), while this route keeps doing the one thing it's for: turning
 * an audio blob into text, logged to ai_run_logs exactly as before.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;

  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "A non-empty audio file is required" }, { status: 400 });
  }

  const chunkIndexRaw = formData.get("chunkIndex");
  const chunkIndex = typeof chunkIndexRaw === "string" && chunkIndexRaw !== "" ? Number(chunkIndexRaw) : undefined;
  const durationMsRaw = formData.get("durationMs");
  const durationMs = typeof durationMsRaw === "string" && durationMsRaw !== "" ? Number(durationMsRaw) : undefined;

  try {
    const { text, model } = await transcribeAudio(meetingId, audio, {
      mimeType: audio.type || "audio/webm",
      chunkIndex,
    });

    return NextResponse.json(
      { text, model, chunkIndex: chunkIndex ?? null, durationMs: durationMs ?? null },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to transcribe audio";
    const status = message === "Meeting not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

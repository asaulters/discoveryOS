import { getOpenAiClient } from "@/lib/services/openaiClient";
import { startAiRunLog, completeAiRunLog } from "@/lib/services/aiRuns";
import { runAiCallOrThrow, aiCallSuccessStatus, describeAiCallFailureForLog } from "@/lib/ai/aiCallRunner";

export interface TranscribeAudioResult {
  text: string;
  model: string;
}

/**
 * Sprint 11: wraps a single OpenAI audio transcription call, logged to
 * ai_run_logs like every other AI call in the app (run_type
 * "audio_transcription" - see aiRuns.ts's whitelist and the debug page's
 * RUN_TYPE_LABELS, both updated to include it). This is the ONLY AI call
 * live audio ever makes directly - turning audio into text. Everything
 * downstream of the returned text (fast-loop analysis, workflow
 * extraction) reuses the exact same pipeline manual transcript input
 * already runs; there is no separate reasoning path for live audio.
 */
export async function transcribeAudio(
  meetingId: string,
  file: File,
  metadata: { mimeType: string; chunkIndex?: number }
): Promise<TranscribeAudioResult> {
  const model = process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";

  const runLog = await startAiRunLog(
    "audio_transcription",
    {
      meetingId,
      model,
      mimeType: metadata.mimeType,
      chunkIndex: metadata.chunkIndex ?? null,
      sizeBytes: file.size,
    },
    meetingId
  );

  try {
    const client = await getOpenAiClient();
    const { data: transcription, attempts } = await runAiCallOrThrow({
      kind: "transcription",
      fn: (requestOptions) => client.audio.transcriptions.create({ file, model }, requestOptions),
    });

    const text = transcription.text?.trim() ?? "";
    await completeAiRunLog(runLog.id, aiCallSuccessStatus(attempts), { text });
    return { text, model };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio transcription failed";
    const failureInfo = describeAiCallFailureForLog(err, "transcription");
    await completeAiRunLog(runLog.id, failureInfo?.status ?? "failed", failureInfo?.output ?? null, message);
    throw new Error(message);
  }
}

-- Sprint 13: Live Audio v2 - Continuous Mode + Meaningful Segment Detection.
--
-- No schema change - transcription_metadata is already nullable jsonb
-- (0011_live_audio_transcript_source.sql). This migration only updates the
-- documenting column comment to describe the expanded shape produced by
-- the new buffered/meaningful-detection flow. Segments created via the
-- Sprint 11 one-chunk-per-segment path (now unused by the live UI but not
-- removed) still carry the older, narrower shape - both are valid.

comment on column transcript_segments.transcription_metadata is
  'live_audio segments only: {duration_ms, mime_type, model, chunk_index, analysis_paused_at_creation} (Sprint 11), plus Sprint 13 continuous-mode fields when analyzed_from_buffer is true: {source: "live_audio_continuous", chunk_count, detection_reason, signal_terms, token_estimate}. Null for manual segments.';

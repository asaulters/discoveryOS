-- Sprint 11: Live Audio / Transcription Prototype.
--
-- Adds source attribution to transcript_segments so a live-audio-created
-- segment can be told apart from a manually-pasted one. Plain text column
-- (not a Postgres enum, matching the sprint's own spec) with a check
-- constraint for integrity instead - source_type only ever needs two
-- values and a check constraint is cheaper to extend later than an enum
-- type. transcription_metadata is nullable jsonb, only ever populated for
-- live_audio segments (duration_ms, mime_type, model, chunk_index,
-- analysis_paused_at_creation - see lib/services/transcriptSegments.ts).

alter table transcript_segments
  add column source_type text not null default 'manual',
  add column transcription_metadata jsonb;

alter table transcript_segments
  add constraint transcript_segments_source_type_check
  check (source_type in ('manual', 'live_audio'));

comment on column transcript_segments.source_type is
  'manual (typed/pasted) or live_audio (Sprint 11 browser-mic transcription) - UI attribution only, does not change how the segment is analyzed.';
comment on column transcript_segments.transcription_metadata is
  'live_audio segments only: {duration_ms, mime_type, model, chunk_index, analysis_paused_at_creation}. Null for manual segments.';

-- Sprint 32: Remote Conversation Capture Readiness.
--
-- Two additive pieces, kept in one migration since they're two halves of
-- the same feature:
--
-- 1. remote_capture_readiness - one row per meeting, the *pre-call*
--    setup checklist (which capture approach the facilitator plans to
--    use, whether it was tested before the call). Lives on the Live
--    page, independent of whether the meeting is a formal field test -
--    any meeting could be a remote call. Same "one-per-meeting,
--    facilitator-entered, never AI-populated, cascades on meeting
--    delete" shape as meeting_pilot_notes (0018) and field_tests (0028).
--
-- 2. field_tests gains 6 *post-call* capture-quality scoring columns -
--    conceptually distinct from #1 (after vs. before the call) and tied
--    to the field-test debrief specifically, so these live on the
--    existing field_tests table rather than duplicating a second
--    one-row-per-meeting table.
--
-- Both are purely internal/facilitator-entered - never read by
-- export/share (see meetingExportBuilder.ts), matching every pilot/
-- field-test table so far.

create table remote_capture_readiness (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  capture_setup text not null default 'unknown',
  pre_call_test_completed boolean not null default false,
  remote_audio_captured_clearly boolean not null default false,
  user_voice_dominated boolean not null default false,
  manual_backup_ready boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table remote_capture_readiness
  add constraint remote_capture_readiness_capture_setup_check
  check (capture_setup in (
    'browser_mic_room_audio',
    'blackhole_virtual_audio',
    'two_laptop_external_mic',
    'two_laptop_builtin_mic',
    'same_laptop_speakers',
    'manual_notes_primary',
    'unknown'
  ));

create trigger remote_capture_readiness_set_updated_at
  before update on remote_capture_readiness
  for each row execute function set_updated_at();

-- One row per meeting - upsertRemoteCaptureReadiness relies on this to
-- find the existing row instead of accumulating duplicates.
create unique index remote_capture_readiness_meeting_id_idx on remote_capture_readiness(meeting_id);

comment on table remote_capture_readiness is
  'Sprint 32: lightweight pre-call remote-capture setup checklist, one row per meeting. Facilitator-entered only - never populated by AI, never included in export/share output.';

alter table field_tests
  add column remote_audio_clarity_score integer,
  add column user_voice_balance_score integer,
  add column transcript_usefulness_score integer,
  add column manual_notes_needed text,
  add column hud_distraction_level text,
  add column capture_setup_used text;

alter table field_tests
  add constraint field_tests_remote_audio_clarity_score_check
  check (remote_audio_clarity_score is null or remote_audio_clarity_score between 1 and 5);

alter table field_tests
  add constraint field_tests_user_voice_balance_score_check
  check (user_voice_balance_score is null or user_voice_balance_score between 1 and 5);

alter table field_tests
  add constraint field_tests_transcript_usefulness_score_check
  check (transcript_usefulness_score is null or transcript_usefulness_score between 1 and 5);

alter table field_tests
  add constraint field_tests_manual_notes_needed_check
  check (manual_notes_needed is null or manual_notes_needed in ('low', 'medium', 'high'));

alter table field_tests
  add constraint field_tests_hud_distraction_level_check
  check (hud_distraction_level is null or hud_distraction_level in ('low', 'medium', 'high'));

alter table field_tests
  add constraint field_tests_capture_setup_used_check
  check (capture_setup_used is null or capture_setup_used in (
    'browser_mic_room_audio',
    'blackhole_virtual_audio',
    'two_laptop_external_mic',
    'two_laptop_builtin_mic',
    'same_laptop_speakers',
    'manual_notes_primary',
    'unknown'
  ));

comment on column field_tests.remote_audio_clarity_score is
  'Sprint 32: post-call capture-quality rating, 1-5 - how clearly the remote participant''s audio came through.';
comment on column field_tests.user_voice_balance_score is
  'Sprint 32: post-call capture-quality rating, 1-5 - 1 means the facilitator''s own voice dominated badly, 5 means balanced/remote clearly captured.';
comment on column field_tests.transcript_usefulness_score is
  'Sprint 32: post-call capture-quality rating, 1-5 - how usable the resulting transcript/analysis was.';

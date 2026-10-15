-- Sprint 18: Real Meeting Pilot Checklist + Usage Hardening.
--
-- One row per meeting, created lazily on first save (see
-- lib/services/pilotReadiness.ts's upsertPilotReadiness). Purely
-- facilitator-entered readiness/consent/checklist state for running
-- DiscoveryOS in a real (non-scenario) meeting - never written to by any
-- AI pipeline, never read by export/share (see meetingExportBuilder.ts),
-- and additive only: existing meetings are unaffected until a facilitator
-- opts into pilot mode.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention since 0011_live_audio_transcript_source.sql.

create table meeting_pilot_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  pilot_mode boolean not null default false,
  consent_confirmed boolean not null default false,
  consent_note text,
  recording_mode text,
  known_limitations_acknowledged boolean not null default false,
  pre_meeting_checklist jsonb,
  post_meeting_checklist jsonb,
  pilot_notes text,
  issues_observed text,
  followup_actions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meeting_pilot_notes
  add constraint meeting_pilot_notes_recording_mode_check
  check (recording_mode is null or recording_mode in (
    'manual_transcript', 'browser_mic', 'mixed', 'none'
  ));

create trigger meeting_pilot_notes_set_updated_at
  before update on meeting_pilot_notes
  for each row execute function set_updated_at();

-- One readiness row per meeting - upsertPilotReadiness relies on this to
-- find the existing row instead of accumulating duplicates.
create unique index meeting_pilot_notes_meeting_id_idx on meeting_pilot_notes(meeting_id);

comment on table meeting_pilot_notes is
  'Sprint 18: lightweight real-meeting pilot readiness/consent/checklist state, one row per meeting. Facilitator-entered only - never populated by AI, never included in export/share output by default.';

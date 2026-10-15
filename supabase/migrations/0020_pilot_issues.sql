-- Sprint 20: Real Pilot Issue Resolution Tracking.
--
-- Lightweight open/resolved/dismissed tracking for real pilot feedback,
-- separate from meeting_pilot_notes.issues_observed (Sprint 18's raw
-- free-text field, which this table never replaces or deletes from).
-- A pilot issue is created manually from the Review page - never
-- auto-created from issues_observed text, no AI extraction. Not a
-- ticketing system: no assignments, due dates, comments, or workflows.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention since 0011_live_audio_transcript_
-- source.sql. Category values mirror lib/pilotIssueCategories.ts
-- (Sprint 19) exactly, so a tracked issue's category and an
-- issues_observed chip mean the same thing.

create table pilot_issues (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  source_pilot_note_id uuid references meeting_pilot_notes(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'other',
  severity text not null default 'medium',
  status text not null default 'open',
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table pilot_issues
  add constraint pilot_issues_category_check
  check (category in (
    'live_capture', 'suggested_directions', 'still_to_explore',
    'process_extraction', 'evidence_quality', 'review_export',
    'ui_confusion', 'performance', 'other'
  ));

alter table pilot_issues
  add constraint pilot_issues_severity_check
  check (severity in ('low', 'medium', 'high', 'critical'));

alter table pilot_issues
  add constraint pilot_issues_status_check
  check (status in ('open', 'resolved', 'dismissed'));

create trigger pilot_issues_set_updated_at
  before update on pilot_issues
  for each row execute function set_updated_at();

create index pilot_issues_meeting_id_idx on pilot_issues(meeting_id);
create index pilot_issues_status_idx on pilot_issues(status);
create index pilot_issues_category_idx on pilot_issues(category);

comment on table pilot_issues is
  'Sprint 20: lightweight open/resolved/dismissed tracking for real pilot feedback, one row per manually-created issue. Never auto-created from issues_observed, never AI-generated. Internal only - never included in export/share output.';

-- Sprint 28: Real Applied AI Field Test Package.
--
-- One row per meeting, created lazily on first save (see
-- lib/services/fieldTests.ts's upsertFieldTestForMeeting) - same
-- "one-per-meeting, facilitator-entered, never AI-populated" shape as
-- meeting_pilot_notes (0018_pilot_readiness.sql). Purely internal
-- field-test planning/debrief/scoring state - never read by export/share
-- (see meetingExportBuilder.ts), additive only, and orthogonal to
-- meeting_pilot_notes: a field test can exist on any meeting regardless
-- of pilot_mode, and vice versa.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention since 0011_live_audio_transcript_
-- source.sql.

create table field_tests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  status text not null default 'planned',
  test_context text,
  selected_scenario_reference text,
  facilitator_goal text,
  participant_disclosure_used boolean not null default false,
  live_capture_used boolean not null default false,
  manual_transcript_used boolean not null default false,
  observer_notes text,
  facilitator_notes text,
  debrief_notes text,
  helped_ask_better_questions integer,
  reduced_missed_followups integer,
  improved_workflow_understanding integer,
  stayed_non_distracting integer,
  evidence_trustworthy integer,
  applied_ai_judgment_useful integer,
  overall_usefulness integer,
  success_decision text,
  next_iteration_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table field_tests
  add constraint field_tests_status_check
  check (status in ('planned', 'completed', 'abandoned'));

alter table field_tests
  add constraint field_tests_success_decision_check
  check (success_decision is null or success_decision in (
    'strong_signal', 'mixed_signal', 'weak_signal', 'not_enough_data'
  ));

alter table field_tests
  add constraint field_tests_helped_ask_better_questions_check
  check (helped_ask_better_questions is null or helped_ask_better_questions between 1 and 5);

alter table field_tests
  add constraint field_tests_reduced_missed_followups_check
  check (reduced_missed_followups is null or reduced_missed_followups between 1 and 5);

alter table field_tests
  add constraint field_tests_improved_workflow_understanding_check
  check (improved_workflow_understanding is null or improved_workflow_understanding between 1 and 5);

alter table field_tests
  add constraint field_tests_stayed_non_distracting_check
  check (stayed_non_distracting is null or stayed_non_distracting between 1 and 5);

alter table field_tests
  add constraint field_tests_evidence_trustworthy_check
  check (evidence_trustworthy is null or evidence_trustworthy between 1 and 5);

alter table field_tests
  add constraint field_tests_applied_ai_judgment_useful_check
  check (applied_ai_judgment_useful is null or applied_ai_judgment_useful between 1 and 5);

alter table field_tests
  add constraint field_tests_overall_usefulness_check
  check (overall_usefulness is null or overall_usefulness between 1 and 5);

create trigger field_tests_set_updated_at
  before update on field_tests
  for each row execute function set_updated_at();

-- One field-test row per meeting - upsertFieldTestForMeeting relies on
-- this to find the existing row instead of accumulating duplicates.
create unique index field_tests_meeting_id_idx on field_tests(meeting_id);

comment on table field_tests is
  'Sprint 28: lightweight real applied-AI field-test planning/debrief/scoring state, one row per meeting. Facilitator-entered only - never populated by AI, never included in export/share output.';

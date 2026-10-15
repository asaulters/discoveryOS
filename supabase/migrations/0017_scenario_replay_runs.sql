-- Sprint 17: Automated Scenario Replay.
--
-- One row per replay attempt: creates a fresh meeting from a scenario
-- fixture, drives it through the real transcriptAnalysis pipeline, then
-- runs Sprint 16's regression checker against the result. Kept as its
-- own table (not columns bolted onto regression_runs) since a replay
-- attempt is a distinct concept from the regression run it eventually
-- produces - see lib/services/scenarioReplayRunner.ts.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention since 0011_live_audio_transcript_source.sql.

create table scenario_replay_runs (
  id uuid primary key default gen_random_uuid(),
  scenario_id text not null,
  meeting_id uuid references meetings(id) on delete set null,
  regression_run_id uuid references regression_runs(id) on delete set null,
  status text not null default 'running',
  chunk_count integer not null default 0,
  chunks_submitted integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table scenario_replay_runs
  add constraint scenario_replay_runs_status_check
  check (status in ('running', 'completed', 'failed'));

create trigger scenario_replay_runs_set_updated_at
  before update on scenario_replay_runs
  for each row execute function set_updated_at();

create index scenario_replay_runs_meeting_id_idx on scenario_replay_runs(meeting_id);
create index scenario_replay_runs_created_at_idx on scenario_replay_runs(created_at desc);

comment on table scenario_replay_runs is
  'Sprint 17: one row per automated scenario-replay attempt - creates a fresh meeting, drives it through the real transcript pipeline, then runs Sprint 16 regression checks. Never a source of workflow/process data itself.';

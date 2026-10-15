-- Sprint 16: Evaluation Regression Runner.
--
-- Deterministic, repeatable QA checks comparing a scenario-created
-- meeting's current structured state against that scenario's
-- expectedOutputs (lib/scenarios/*.ts) - no LLM judge, no automated
-- transcript replay. See lib/services/regressionRunner.ts.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention for newer tables (see
-- 0011_live_audio_transcript_source.sql, 0012_contradiction_candidates.sql,
-- 0014_conversation_events.sql).

create table regression_runs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  scenario_id text not null,
  status text not null default 'completed',
  overall_result text not null default 'warn',
  summary text,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table regression_runs
  add constraint regression_runs_status_check
  check (status in ('completed', 'failed'));

alter table regression_runs
  add constraint regression_runs_overall_result_check
  check (overall_result in ('pass', 'warn', 'fail'));

create trigger regression_runs_set_updated_at
  before update on regression_runs
  for each row execute function set_updated_at();

create index regression_runs_meeting_id_idx on regression_runs(meeting_id);
create index regression_runs_created_at_idx on regression_runs(created_at desc);

create table regression_checks (
  id uuid primary key default gen_random_uuid(),
  regression_run_id uuid not null references regression_runs(id) on delete cascade,
  category text not null,
  label text not null,
  expected text,
  actual text,
  result text not null default 'warn',
  notes text,
  created_at timestamptz not null default now()
);

alter table regression_checks
  add constraint regression_checks_result_check
  check (result in ('pass', 'warn', 'fail'));

create index regression_checks_run_id_idx on regression_checks(regression_run_id);

comment on table regression_runs is
  'Sprint 16: one row per regression-runner execution against a scenario-created meeting - deterministic checks only, no LLM judge, no automated replay.';
comment on table regression_checks is
  'Sprint 16: individual pass/warn/fail checks belonging to a regression_runs row.';

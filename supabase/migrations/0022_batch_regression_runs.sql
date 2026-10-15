-- Sprint 22: Batch Regression Runs.
--
-- Runs multiple scenario fixtures sequentially through the exact same
-- pipeline Sprint 17's replayScenario/Sprint 16's runRegression already
-- use - this is orchestration of existing, real functions, not a new
-- reasoning path. batch_regression_runs is the parent (one row per
-- "run these N scenarios" click); batch_regression_run_items is one row
-- per scenario within that batch, linking out to the real
-- scenario_replay_runs/meetings/regression_runs rows it produced.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's convention since 0011_live_audio_transcript_
-- source.sql.

create table batch_regression_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  scenario_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  total_checks integer not null default 0,
  total_pass integer not null default 0,
  total_warn integer not null default 0,
  total_fail integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table batch_regression_runs
  add constraint batch_regression_runs_status_check
  check (status in ('running', 'completed', 'failed', 'partial'));

create trigger batch_regression_runs_set_updated_at
  before update on batch_regression_runs
  for each row execute function set_updated_at();

create index batch_regression_runs_created_at_idx on batch_regression_runs(created_at desc);

comment on table batch_regression_runs is
  'Sprint 22: one row per "run these scenarios" batch click - aggregates results from real, sequential scenario replays (see batch_regression_run_items). Never a source of workflow/process data itself.';

create table batch_regression_run_items (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_regression_runs(id) on delete cascade,
  scenario_id text not null,
  meeting_id uuid references meetings(id) on delete set null,
  replay_run_id uuid references scenario_replay_runs(id) on delete set null,
  regression_run_id uuid references regression_runs(id) on delete set null,
  status text not null default 'pending',
  checks_total integer not null default 0,
  checks_pass integer not null default 0,
  checks_warn integer not null default 0,
  checks_fail integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table batch_regression_run_items
  add constraint batch_regression_run_items_status_check
  check (status in ('pending', 'running', 'completed', 'failed'));

create trigger batch_regression_run_items_set_updated_at
  before update on batch_regression_run_items
  for each row execute function set_updated_at();

create index batch_regression_run_items_batch_run_id_idx on batch_regression_run_items(batch_run_id);

comment on table batch_regression_run_items is
  'Sprint 22: one row per scenario within a batch_regression_runs batch - links to the real scenario_replay_runs/meetings/regression_runs rows the replay produced, set null on delete so a batch item outlives a deleted meeting.';

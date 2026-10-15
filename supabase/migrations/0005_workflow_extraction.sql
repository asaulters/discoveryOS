-- Sprint 4: Workflow Extraction v1.
--
-- Adds the structured workflow model the workflow extractor writes to,
-- separate from the fast loop's directions/threads. One primary workflow
-- per meeting (enforced by a unique meeting_id), with steps, components,
-- and gaps reconciled by normalized key on every extraction run - nothing
-- is ever deleted, matching the rest of the app's reconcile pattern
-- (see reconcileHypotheses, reconcileInitialQueue).

create type workflow_component_type as enum (
  'actor',
  'system',
  'data',
  'decision_rule',
  'approval',
  'handoff',
  'exception',
  'failure_detection',
  'failure_recovery',
  'output'
);

-- ---------------------------------------------------------------------------
-- workflows
-- ---------------------------------------------------------------------------

create table workflows (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  name text not null,
  confidence_level confidence_level not null default 'unclear',
  known_summary text not null default '',
  unknown_summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id)
);

create trigger workflows_set_updated_at
  before update on workflows
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_steps
-- ---------------------------------------------------------------------------

create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  title text not null,
  normalized_title text not null,
  description text,
  confidence_level confidence_level not null default 'unclear',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, normalized_title)
);

create trigger workflow_steps_set_updated_at
  before update on workflow_steps
  for each row execute function set_updated_at();

create index workflow_steps_workflow_id_idx on workflow_steps(workflow_id);

-- ---------------------------------------------------------------------------
-- workflow_components
-- ---------------------------------------------------------------------------

create table workflow_components (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  component_type workflow_component_type not null,
  label text not null,
  normalized_label text not null,
  description text,
  confidence_level confidence_level not null default 'unclear',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, component_type, normalized_label)
);

create trigger workflow_components_set_updated_at
  before update on workflow_components
  for each row execute function set_updated_at();

create index workflow_components_workflow_id_idx on workflow_components(workflow_id);

-- ---------------------------------------------------------------------------
-- workflow_gaps
-- ---------------------------------------------------------------------------

create table workflow_gaps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  label text not null,
  normalized_label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, normalized_label)
);

create trigger workflow_gaps_set_updated_at
  before update on workflow_gaps
  for each row execute function set_updated_at();

create index workflow_gaps_workflow_id_idx on workflow_gaps(workflow_id);

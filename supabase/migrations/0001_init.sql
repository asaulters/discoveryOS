-- DiscoveryOS Sprint 1 schema
-- Manual transcript-first live discovery HUD prototype.
-- No numeric confidence: confidence is always ordinal (unclear/emerging/likely/confirmed).
-- No queue_items table: queueing lives on discovery_threads (in_queue, sort_order).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type meeting_status as enum (
  'prepared',
  'live',
  'paused',
  'completed',
  'archived'
);

create type confidence_level as enum (
  'unclear',
  'emerging',
  'likely',
  'confirmed'
);

create type thread_status as enum (
  'active',
  'open',
  'deferred',
  'covered',
  'contradicted',
  'stale',
  'dismissed'
);

create type thread_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------

create table meetings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  meeting_type text not null,
  discovery_strategy text,
  goal text,
  current_understanding text,
  tentative_build_direction text,
  risks_unknowns jsonb not null default '[]'::jsonb,
  status meeting_status not null default 'prepared',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meetings_set_updated_at
  before update on meetings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- assumptions
-- ---------------------------------------------------------------------------

create table assumptions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  confidence_level confidence_level not null default 'unclear',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assumptions_set_updated_at
  before update on assumptions
  for each row execute function set_updated_at();

create index assumptions_meeting_id_idx on assumptions(meeting_id);

-- ---------------------------------------------------------------------------
-- meeting_context_items (optional pasted context, one meeting -> many items)
-- ---------------------------------------------------------------------------

create table meeting_context_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  content text not null,
  source text,
  created_at timestamptz not null default now()
);

create index meeting_context_items_meeting_id_idx on meeting_context_items(meeting_id);

-- ---------------------------------------------------------------------------
-- discovery_threads
-- ---------------------------------------------------------------------------

create table discovery_threads (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  title text not null,
  status thread_status not null default 'open',
  priority thread_priority not null default 'medium',
  in_queue boolean not null default false,
  sort_order integer not null default 0,
  locked_until_release boolean not null default false,
  confidence_level confidence_level not null default 'unclear',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger discovery_threads_set_updated_at
  before update on discovery_threads
  for each row execute function set_updated_at();

create index discovery_threads_meeting_id_idx on discovery_threads(meeting_id);
create index discovery_threads_meeting_queue_idx
  on discovery_threads(meeting_id, in_queue, sort_order);

-- At most one active thread per meeting.
create unique index discovery_threads_one_active_per_meeting
  on discovery_threads(meeting_id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- question_directions (suggested directions for a discovery thread)
-- ---------------------------------------------------------------------------

create table question_directions (
  id uuid primary key default gen_random_uuid(),
  discovery_thread_id uuid not null references discovery_threads(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index question_directions_thread_id_idx on question_directions(discovery_thread_id);

-- ---------------------------------------------------------------------------
-- alerts (lightweight; no alert-generation logic in Sprint 1)
-- ---------------------------------------------------------------------------

create table alerts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  message text not null,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);

create index alerts_meeting_id_idx on alerts(meeting_id);

-- ---------------------------------------------------------------------------
-- user_actions (manual action audit log)
-- ---------------------------------------------------------------------------

create table user_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index user_actions_meeting_id_idx on user_actions(meeting_id);

-- ---------------------------------------------------------------------------
-- ai_run_logs (structure only; no AI calls happen in Sprint 1)
-- ---------------------------------------------------------------------------

create table ai_run_logs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade,
  run_type text not null,
  status text not null default 'pending',
  input jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_run_logs_meeting_id_idx on ai_run_logs(meeting_id);

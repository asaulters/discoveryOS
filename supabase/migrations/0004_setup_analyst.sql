-- Sprint 3: Setup Analyst + Pre-Meeting Brief v1.
--
-- Replaces free-text meeting_type/discovery_strategy with canonical enums,
-- and adds the tables the Setup Analyst writes to: hypotheses (distinct
-- from user-entered assumptions) and pre_meeting_briefs (one row per
-- generation - regenerate never deletes prior rows).

create type meeting_type as enum (
  'automation_discovery',
  'product_discovery',
  'technical_feasibility',
  'requirements_gathering',
  'business_case',
  'ux_research'
);

create type discovery_strategy as enum (
  'broad_exploration',
  'deep_validation',
  'requirements_gathering',
  'technical_feasibility',
  'business_case'
);

-- Best-effort mapping of existing free-text values onto the new canonical
-- enums. This project has only ever held prototype/dev data, so an exact
-- migration isn't required - anything that doesn't clearly match a specific
-- category falls back to the closest general bucket.
alter table meetings
  alter column meeting_type type meeting_type
  using (
    case
      when lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%automation%'
        then 'automation_discovery'
      when lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%technical%'
        or lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%feasib%'
        then 'technical_feasibility'
      when lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%requirement%'
        then 'requirements_gathering'
      when lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%business%'
        then 'business_case'
      when lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%ux%'
        or lower(regexp_replace(meeting_type, '[^a-zA-Z0-9]', '', 'g')) like '%research%'
        then 'ux_research'
      else 'product_discovery'
    end
  )::meeting_type;

alter table meetings
  alter column discovery_strategy type discovery_strategy
  using (
    case
      when discovery_strategy is null then null
      when lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%broad%'
        then 'broad_exploration'
      when lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%deep%'
        or lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%valid%'
        then 'deep_validation'
      when lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%requirement%'
        then 'requirements_gathering'
      when lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%technical%'
        or lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%feasib%'
        then 'technical_feasibility'
      when lower(regexp_replace(discovery_strategy, '[^a-zA-Z0-9]', '', 'g')) like '%business%'
        then 'business_case'
      else 'broad_exploration'
    end
  )::discovery_strategy;

-- ---------------------------------------------------------------------------
-- hypotheses (Setup Analyst's tentative explanations - distinct from the
-- facilitator's own recorded assumptions)
-- ---------------------------------------------------------------------------

create table hypotheses (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  statement text not null,
  confidence_level confidence_level not null default 'unclear',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger hypotheses_set_updated_at
  before update on hypotheses
  for each row execute function set_updated_at();

create index hypotheses_meeting_id_idx on hypotheses(meeting_id);

-- ---------------------------------------------------------------------------
-- pre_meeting_briefs (one row per Setup Analyst generation; regenerate
-- inserts a new row rather than overwriting, so history is never lost)
-- ---------------------------------------------------------------------------

create table pre_meeting_briefs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  brief_summary text not null,
  suggested_opening text not null,
  recommended_focus text not null,
  must_learn jsonb not null default '[]'::jsonb,
  risk_focus jsonb not null default '[]'::jsonb,
  build_direction_warning text,
  created_at timestamptz not null default now()
);

create index pre_meeting_briefs_meeting_id_idx on pre_meeting_briefs(meeting_id);
create index pre_meeting_briefs_meeting_latest_idx on pre_meeting_briefs(meeting_id, created_at desc);

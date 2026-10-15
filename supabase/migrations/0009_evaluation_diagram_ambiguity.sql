-- Sprint 9: Evaluation Harness + Workflow Diagram View + Ambiguity Flags Lite.
--
-- The Workflow Diagram view (Part B) needs no new schema - it's a read-only
-- rendering of the existing workflows/workflow_steps/workflow_components/
-- workflow_gaps tables. This migration covers Part A (evaluation
-- scorecards) and Part C (lightweight ambiguity capture).

-- ---------------------------------------------------------------------------
-- Part A: evaluation_runs + evaluation_items
--
-- One row per manual scorecard save - like post_meeting_reviews, never
-- updated in place, so evaluation history is preserved (see
-- lib/services/evaluations.ts, which only ever inserts).
-- ---------------------------------------------------------------------------

create table evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  scenario_name text,
  evaluator_type text not null default 'manual',
  overall_score numeric,
  question_direction_score numeric,
  workflow_extraction_score numeric,
  evidence_quality_score numeric,
  gap_quality_score numeric,
  review_quality_score numeric,
  hallucination_risk_score numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger evaluation_runs_set_updated_at
  before update on evaluation_runs
  for each row execute function set_updated_at();

create index evaluation_runs_meeting_id_idx on evaluation_runs(meeting_id);
create index evaluation_runs_meeting_created_idx on evaluation_runs(meeting_id, created_at desc);

create table evaluation_items (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null references evaluation_runs(id) on delete cascade,
  category text not null,
  label text not null,
  score numeric,
  passed boolean,
  notes text,
  created_at timestamptz not null default now()
);

create index evaluation_items_run_id_idx on evaluation_items(evaluation_run_id);

-- ---------------------------------------------------------------------------
-- Part C: ambiguity_flags
--
-- Lightweight, conservative capture of fuzzy language, unclear ownership,
-- informal terms, or missing criteria - explicitly NOT contradiction
-- detection (see the workflow extractor prompt). Reconciled by normalized
-- label like workflow_gaps: nothing is ever deleted, and a resolved/
-- dismissed flag's text is never rewritten by a later extraction run.
-- ---------------------------------------------------------------------------

create type ambiguity_type as enum (
  'unclear_owner',
  'unclear_rule',
  'informal_term',
  'inconsistent_process',
  'missing_criteria',
  'ambiguous_system',
  'exception_case',
  'other'
);

create type ambiguity_status as enum ('open', 'resolved', 'dismissed');

create table ambiguity_flags (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  label text not null,
  normalized_label text not null,
  description text,
  ambiguity_type ambiguity_type not null,
  source_transcript_segment_id uuid references transcript_segments(id) on delete set null,
  source_quote text,
  priority thread_priority not null default 'medium',
  status ambiguity_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, normalized_label)
);

create trigger ambiguity_flags_set_updated_at
  before update on ambiguity_flags
  for each row execute function set_updated_at();

create index ambiguity_flags_meeting_id_idx on ambiguity_flags(meeting_id);

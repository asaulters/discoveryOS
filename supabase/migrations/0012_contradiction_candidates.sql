-- Sprint 12: Contradiction Detection v1.
--
-- Adds a second, separate "clarification needs" model alongside
-- ambiguity_flags (Sprint 9). The distinction matters and is deliberate:
-- ambiguity_flags = something was said, but vaguely/informally/without a
-- clear owner. contradiction_candidates = two separately-evidenced claims
-- appear to be in tension with each other. Neither table replaces the
-- other; ambiguity_flags is untouched by this migration.
--
-- Framing throughout is soft and evidence-linked, never accusatory: this is
-- "needs clarification", never "the stakeholder contradicted themselves".

create type contradiction_type as enum (
  'ownership_conflict',
  'rule_conflict',
  'approval_conflict',
  'system_conflict',
  'timing_conflict',
  'exception_conflict',
  'build_assumption_conflict',
  'terminology_conflict',
  'status_conflict',
  'other'
);

create type contradiction_severity as enum ('low', 'medium', 'high', 'critical');

create type contradiction_status as enum ('open', 'resolved', 'dismissed');

create table contradiction_candidates (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  label text not null,
  description text not null,
  contradiction_type contradiction_type not null,
  severity contradiction_severity not null default 'medium',
  status contradiction_status not null default 'open',
  claim_a text not null,
  claim_b text not null,
  source_transcript_segment_id_a uuid references transcript_segments(id) on delete set null,
  source_transcript_segment_id_b uuid references transcript_segments(id) on delete set null,
  source_quote_a text,
  source_quote_b text,
  suggested_clarification_question text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contradiction_candidates_set_updated_at
  before update on contradiction_candidates
  for each row execute function set_updated_at();

create index contradiction_candidates_meeting_id_idx on contradiction_candidates(meeting_id);
create index contradiction_candidates_meeting_status_idx on contradiction_candidates(meeting_id, status);

-- ---------------------------------------------------------------------------
-- Part H: evaluation harness gets a "Clarification / contradiction detection
-- quality" category alongside the existing six (see lib/evaluationRubric.ts).
-- Nullable/defaulted like every other *_score column - existing rows and the
-- existing six columns are completely unaffected.
-- ---------------------------------------------------------------------------

alter table evaluation_runs add column contradiction_quality_score numeric;

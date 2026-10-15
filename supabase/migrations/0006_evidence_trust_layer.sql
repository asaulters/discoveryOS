-- Sprint 5: Evidence + Trust Layer v1.
--
-- Adds evidence metadata to the Sprint 4 workflow model so every step,
-- component, and gap can point back at the transcript segment and quote
-- that actually supports it (or be honestly labeled as inferred/unknown
-- when it doesn't). Run after 0005_workflow_extraction.sql.

create type evidence_type as enum ('known', 'inferred', 'unknown');

alter table workflow_steps
  add column source_transcript_segment_id uuid references transcript_segments(id) on delete set null,
  add column source_quote text,
  add column evidence_type evidence_type not null default 'unknown',
  add column confidence_reason text not null default '';

alter table workflow_components
  add column source_transcript_segment_id uuid references transcript_segments(id) on delete set null,
  add column source_quote text,
  add column evidence_type evidence_type not null default 'unknown',
  add column confidence_reason text not null default '';

alter table workflow_gaps
  add column source_transcript_segment_id uuid references transcript_segments(id) on delete set null,
  add column source_quote text,
  add column evidence_type evidence_type not null default 'unknown',
  add column confidence_reason text not null default '';

create index workflow_steps_source_segment_idx on workflow_steps(source_transcript_segment_id);
create index workflow_components_source_segment_idx on workflow_components(source_transcript_segment_id);
create index workflow_gaps_source_segment_idx on workflow_gaps(source_transcript_segment_id);

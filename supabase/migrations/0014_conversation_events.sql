-- Sprint 15: Conversation State & Speaker Role Hardening.
--
-- conversation_events is a lightweight log of what the new
-- conversationStateAnalyzerService noticed per transcript segment -
-- facilitator questions/hypotheses/focus shifts, stakeholder facts/
-- uncertainty/exceptions/corrections, topic signals, and glossed-over
-- topics. This table is additive context only: it is never the source
-- of workflow_steps/workflow_components (the extractor remains the only
-- writer for those), and it never blocks the existing pipeline - see
-- lib/ai/conversationStateAnalyzerService.ts.
--
-- Text + check-constraint columns rather than Postgres enum types,
-- matching this repo's existing convention (see
-- 0011_live_audio_transcript_source.sql) since these lists are small and
-- may grow.

create table conversation_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  transcript_segment_id uuid references transcript_segments(id) on delete set null,
  event_type text not null,
  source_role text not null,
  label text not null,
  normalized_label text not null,
  description text,
  evidence_excerpt text,
  confidence_level text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table conversation_events
  add constraint conversation_events_event_type_check
  check (event_type in (
    'facilitator_question',
    'facilitator_hypothesis',
    'facilitator_focus_shift',
    'stakeholder_fact',
    'stakeholder_uncertainty',
    'stakeholder_exception',
    'stakeholder_correction',
    'topic_signal',
    'glossed_over_topic'
  ));

alter table conversation_events
  add constraint conversation_events_source_role_check
  check (source_role in ('facilitator', 'stakeholder', 'mixed', 'unknown'));

alter table conversation_events
  add constraint conversation_events_confidence_level_check
  check (confidence_level in ('low', 'medium', 'high'));

create index conversation_events_meeting_id_idx on conversation_events(meeting_id);
create index conversation_events_transcript_segment_id_idx on conversation_events(transcript_segment_id);

comment on table conversation_events is
  'Sprint 15: per-segment conversation-state signals (speaker-role classification, topic signals, facilitator hypotheses) - advisory context only, never a source for workflow_steps/workflow_components.';

-- Sprint 15 Part I: eighth scored evaluation category, same pattern as
-- 0012_contradiction_candidates.sql adding contradiction_quality_score
-- alongside its own new table.
alter table evaluation_runs add column conversation_state_score numeric;

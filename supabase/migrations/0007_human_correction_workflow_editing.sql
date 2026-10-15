-- Sprint 6: Human Correction + Workflow Editing v1.
--
-- Lets a facilitator correct AI-generated workflow steps/components/gaps
-- and protects those corrections from being silently overwritten by later
-- workflow_extractor runs (see the reconcile* functions in
-- lib/services/workflows.ts). Run after 0006_evidence_trust_layer.sql.

create type workflow_source_origin as enum ('ai', 'human', 'ai_human_edited');

-- Gap-specific lifecycle state, separate from human_verified (which applies
-- uniformly to steps/components/gaps and means "confirmed accurate").
-- gap_status tracks whether an open unknown has since been resolved
-- (answered) or explicitly set aside (dismissed) by the facilitator.
create type workflow_gap_status as enum ('open', 'answered', 'dismissed');

alter table workflow_steps
  add column source_origin workflow_source_origin not null default 'ai',
  add column human_verified boolean not null default false,
  add column human_note text,
  add column locked_by_user boolean not null default false,
  add column last_edited_by_user_at timestamptz;

alter table workflow_components
  add column source_origin workflow_source_origin not null default 'ai',
  add column human_verified boolean not null default false,
  add column human_note text,
  add column locked_by_user boolean not null default false,
  add column last_edited_by_user_at timestamptz;

alter table workflow_gaps
  add column source_origin workflow_source_origin not null default 'ai',
  add column human_verified boolean not null default false,
  add column human_note text,
  add column locked_by_user boolean not null default false,
  add column last_edited_by_user_at timestamptz,
  add column gap_status workflow_gap_status not null default 'open';

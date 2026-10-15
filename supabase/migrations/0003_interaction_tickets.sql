-- Sprint 2 Interaction Tickets v1: direction lifecycle + thread focus/cover.

create type direction_status as enum (
  'active',
  'used',
  'dismissed',
  'deferred',
  'stale'
);

alter table question_directions
  add column status direction_status not null default 'active',
  add column reason text;

create index question_directions_status_idx
  on question_directions(discovery_thread_id, status);

-- Shown in the queue alongside title/priority/understanding when a
-- direction is deferred into a thread (or a thread is seeded directly).
alter table discovery_threads
  add column why_it_matters text;

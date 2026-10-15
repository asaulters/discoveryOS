-- Sprint 2 vertical slice: manual transcript input -> fast-loop analysis.

create table transcript_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  discovery_thread_id uuid references discovery_threads(id) on delete set null,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create index transcript_segments_meeting_id_idx on transcript_segments(meeting_id);
create index transcript_segments_thread_id_idx on transcript_segments(discovery_thread_id);

-- Each question direction now carries the 1-2 context-specific questions
-- the fast loop generated alongside it.
alter table question_directions
  add column questions jsonb not null default '[]'::jsonb;

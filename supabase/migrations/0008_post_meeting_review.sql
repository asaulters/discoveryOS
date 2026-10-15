-- Sprint 7: Post-Meeting Review Lite.
--
-- One row per generation - regenerating never overwrites or deletes a prior
-- review, so review history is preserved (see generatePostMeetingReview in
-- lib/services/postMeetingReviewService.ts, which always inserts). The page
-- shows the most recent row by generated_at.

create table post_meeting_reviews (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  summary text not null default '',
  key_learnings jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  workflow_summary text not null default '',
  known_facts jsonb not null default '[]'::jsonb,
  inferences jsonb not null default '[]'::jsonb,
  assumption_updates jsonb not null default '[]'::jsonb,
  build_direction_assessment jsonb not null default '{}'::jsonb,
  recommended_followups jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger post_meeting_reviews_set_updated_at
  before update on post_meeting_reviews
  for each row execute function set_updated_at();

create index post_meeting_reviews_meeting_id_idx on post_meeting_reviews(meeting_id);
create index post_meeting_reviews_meeting_generated_idx
  on post_meeting_reviews(meeting_id, generated_at desc);

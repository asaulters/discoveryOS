-- Dev-only cleanup for scratch/test meetings created while manually
-- exercising the API (curl, prompt-tuning runs, etc). NOT a migration -
-- run this by hand in the Supabase SQL editor or via `psql`, only against
-- a dev project. Never run this against a production database.
--
-- All child tables (assumptions, meeting_context_items, discovery_threads,
-- question_directions, transcript_segments, alerts, user_actions,
-- ai_run_logs, hypotheses, pre_meeting_briefs, workflows and its own
-- children workflow_steps/workflow_components/workflow_gaps) reference
-- meetings/discovery_threads/workflows with ON DELETE CASCADE, so deleting
-- the meeting row cascades everything for it automatically.
--
-- Usage:
--   1. Adjust the name patterns below to match whatever you've been
--      naming your scratch meetings.
--   2. Run the SELECT first and read the list - this is a preview, not a
--      dry run flag, so nothing is deleted until you run the DELETE.
--   3. Only after confirming the list is correct, run the DELETE statement.

-- 1) Preview what would be deleted.
select id, name, meeting_type, status, created_at
from meetings
where
  name ilike '%test%'
  or name ilike '%scratch%'
  or name ilike '%tuning%'
  or name ilike '%diagnose%'
order by created_at desc;

-- 2) Uncomment and run once the preview above looks right.
-- delete from meetings
-- where
--   name ilike '%test%'
--   or name ilike '%scratch%'
--   or name ilike '%tuning%'
--   or name ilike '%diagnose%';

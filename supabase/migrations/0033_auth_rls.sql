-- Sprint 33: email/password auth and owner/viewer access.
-- Profiles are provisioned by Adam in the dashboard, never by sign-up.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'viewer')),
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER avoids recursive profiles policies. The fixed search path
-- and auth.uid() prevent callers from looking up another user's role.
create function public.current_user_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.current_user_role()) = 'owner');

-- Table list generated from CREATE TABLE statements in 0001 through 0032.

alter table public.meetings enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.meetings to anon;
grant select, insert, update, delete on public.meetings to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.meetings from anon;
revoke truncate, references, trigger on public.meetings from authenticated;
create policy meetings_read on public.meetings for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy meetings_insert on public.meetings for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy meetings_update on public.meetings for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy meetings_delete on public.meetings for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.assumptions enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.assumptions to anon;
grant select, insert, update, delete on public.assumptions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.assumptions from anon;
revoke truncate, references, trigger on public.assumptions from authenticated;
create policy assumptions_read on public.assumptions for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy assumptions_insert on public.assumptions for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy assumptions_update on public.assumptions for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy assumptions_delete on public.assumptions for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.meeting_context_items enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.meeting_context_items to anon;
grant select, insert, update, delete on public.meeting_context_items to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.meeting_context_items from anon;
revoke truncate, references, trigger on public.meeting_context_items from authenticated;
create policy meeting_context_items_read on public.meeting_context_items for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy meeting_context_items_insert on public.meeting_context_items for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy meeting_context_items_update on public.meeting_context_items for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy meeting_context_items_delete on public.meeting_context_items for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.discovery_threads enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.discovery_threads to anon;
grant select, insert, update, delete on public.discovery_threads to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.discovery_threads from anon;
revoke truncate, references, trigger on public.discovery_threads from authenticated;
create policy discovery_threads_read on public.discovery_threads for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy discovery_threads_insert on public.discovery_threads for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy discovery_threads_update on public.discovery_threads for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy discovery_threads_delete on public.discovery_threads for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.question_directions enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.question_directions to anon;
grant select, insert, update, delete on public.question_directions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.question_directions from anon;
revoke truncate, references, trigger on public.question_directions from authenticated;
create policy question_directions_read on public.question_directions for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy question_directions_insert on public.question_directions for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy question_directions_update on public.question_directions for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy question_directions_delete on public.question_directions for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.alerts enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.alerts to anon;
grant select, insert, update, delete on public.alerts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.alerts from anon;
revoke truncate, references, trigger on public.alerts from authenticated;
create policy alerts_read on public.alerts for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy alerts_insert on public.alerts for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy alerts_update on public.alerts for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy alerts_delete on public.alerts for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.user_actions enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.user_actions to anon;
grant select, insert, update, delete on public.user_actions to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.user_actions from anon;
revoke truncate, references, trigger on public.user_actions from authenticated;
create policy user_actions_read on public.user_actions for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy user_actions_insert on public.user_actions for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy user_actions_update on public.user_actions for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy user_actions_delete on public.user_actions for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.ai_run_logs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.ai_run_logs to anon;
grant select, insert, update, delete on public.ai_run_logs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ai_run_logs from anon;
revoke truncate, references, trigger on public.ai_run_logs from authenticated;
create policy ai_run_logs_read on public.ai_run_logs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy ai_run_logs_insert on public.ai_run_logs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy ai_run_logs_update on public.ai_run_logs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy ai_run_logs_delete on public.ai_run_logs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.transcript_segments enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.transcript_segments to anon;
grant select, insert, update, delete on public.transcript_segments to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.transcript_segments from anon;
revoke truncate, references, trigger on public.transcript_segments from authenticated;
create policy transcript_segments_read on public.transcript_segments for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy transcript_segments_insert on public.transcript_segments for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy transcript_segments_update on public.transcript_segments for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy transcript_segments_delete on public.transcript_segments for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.hypotheses enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.hypotheses to anon;
grant select, insert, update, delete on public.hypotheses to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.hypotheses from anon;
revoke truncate, references, trigger on public.hypotheses from authenticated;
create policy hypotheses_read on public.hypotheses for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy hypotheses_insert on public.hypotheses for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy hypotheses_update on public.hypotheses for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy hypotheses_delete on public.hypotheses for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.pre_meeting_briefs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.pre_meeting_briefs to anon;
grant select, insert, update, delete on public.pre_meeting_briefs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.pre_meeting_briefs from anon;
revoke truncate, references, trigger on public.pre_meeting_briefs from authenticated;
create policy pre_meeting_briefs_read on public.pre_meeting_briefs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy pre_meeting_briefs_insert on public.pre_meeting_briefs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy pre_meeting_briefs_update on public.pre_meeting_briefs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy pre_meeting_briefs_delete on public.pre_meeting_briefs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.workflows enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.workflows to anon;
grant select, insert, update, delete on public.workflows to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workflows from anon;
revoke truncate, references, trigger on public.workflows from authenticated;
create policy workflows_read on public.workflows for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy workflows_insert on public.workflows for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy workflows_update on public.workflows for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy workflows_delete on public.workflows for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.workflow_steps enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.workflow_steps to anon;
grant select, insert, update, delete on public.workflow_steps to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workflow_steps from anon;
revoke truncate, references, trigger on public.workflow_steps from authenticated;
create policy workflow_steps_read on public.workflow_steps for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy workflow_steps_insert on public.workflow_steps for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_steps_update on public.workflow_steps for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_steps_delete on public.workflow_steps for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.workflow_components enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.workflow_components to anon;
grant select, insert, update, delete on public.workflow_components to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workflow_components from anon;
revoke truncate, references, trigger on public.workflow_components from authenticated;
create policy workflow_components_read on public.workflow_components for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy workflow_components_insert on public.workflow_components for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_components_update on public.workflow_components for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_components_delete on public.workflow_components for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.workflow_gaps enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.workflow_gaps to anon;
grant select, insert, update, delete on public.workflow_gaps to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workflow_gaps from anon;
revoke truncate, references, trigger on public.workflow_gaps from authenticated;
create policy workflow_gaps_read on public.workflow_gaps for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy workflow_gaps_insert on public.workflow_gaps for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_gaps_update on public.workflow_gaps for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy workflow_gaps_delete on public.workflow_gaps for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.post_meeting_reviews enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.post_meeting_reviews to anon;
grant select, insert, update, delete on public.post_meeting_reviews to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.post_meeting_reviews from anon;
revoke truncate, references, trigger on public.post_meeting_reviews from authenticated;
create policy post_meeting_reviews_read on public.post_meeting_reviews for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy post_meeting_reviews_insert on public.post_meeting_reviews for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy post_meeting_reviews_update on public.post_meeting_reviews for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy post_meeting_reviews_delete on public.post_meeting_reviews for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.evaluation_runs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.evaluation_runs to anon;
grant select, insert, update, delete on public.evaluation_runs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.evaluation_runs from anon;
revoke truncate, references, trigger on public.evaluation_runs from authenticated;
create policy evaluation_runs_read on public.evaluation_runs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy evaluation_runs_insert on public.evaluation_runs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy evaluation_runs_update on public.evaluation_runs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy evaluation_runs_delete on public.evaluation_runs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.evaluation_items enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.evaluation_items to anon;
grant select, insert, update, delete on public.evaluation_items to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.evaluation_items from anon;
revoke truncate, references, trigger on public.evaluation_items from authenticated;
create policy evaluation_items_read on public.evaluation_items for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy evaluation_items_insert on public.evaluation_items for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy evaluation_items_update on public.evaluation_items for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy evaluation_items_delete on public.evaluation_items for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.ambiguity_flags enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.ambiguity_flags to anon;
grant select, insert, update, delete on public.ambiguity_flags to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.ambiguity_flags from anon;
revoke truncate, references, trigger on public.ambiguity_flags from authenticated;
create policy ambiguity_flags_read on public.ambiguity_flags for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy ambiguity_flags_insert on public.ambiguity_flags for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy ambiguity_flags_update on public.ambiguity_flags for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy ambiguity_flags_delete on public.ambiguity_flags for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.contradiction_candidates enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.contradiction_candidates to anon;
grant select, insert, update, delete on public.contradiction_candidates to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.contradiction_candidates from anon;
revoke truncate, references, trigger on public.contradiction_candidates from authenticated;
create policy contradiction_candidates_read on public.contradiction_candidates for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy contradiction_candidates_insert on public.contradiction_candidates for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy contradiction_candidates_update on public.contradiction_candidates for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy contradiction_candidates_delete on public.contradiction_candidates for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.conversation_events enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.conversation_events to anon;
grant select, insert, update, delete on public.conversation_events to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.conversation_events from anon;
revoke truncate, references, trigger on public.conversation_events from authenticated;
create policy conversation_events_read on public.conversation_events for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy conversation_events_insert on public.conversation_events for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy conversation_events_update on public.conversation_events for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy conversation_events_delete on public.conversation_events for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.regression_runs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.regression_runs to anon;
grant select, insert, update, delete on public.regression_runs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.regression_runs from anon;
revoke truncate, references, trigger on public.regression_runs from authenticated;
create policy regression_runs_read on public.regression_runs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy regression_runs_insert on public.regression_runs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy regression_runs_update on public.regression_runs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy regression_runs_delete on public.regression_runs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.regression_checks enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.regression_checks to anon;
grant select, insert, update, delete on public.regression_checks to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.regression_checks from anon;
revoke truncate, references, trigger on public.regression_checks from authenticated;
create policy regression_checks_read on public.regression_checks for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy regression_checks_insert on public.regression_checks for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy regression_checks_update on public.regression_checks for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy regression_checks_delete on public.regression_checks for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.scenario_replay_runs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.scenario_replay_runs to anon;
grant select, insert, update, delete on public.scenario_replay_runs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.scenario_replay_runs from anon;
revoke truncate, references, trigger on public.scenario_replay_runs from authenticated;
create policy scenario_replay_runs_read on public.scenario_replay_runs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy scenario_replay_runs_insert on public.scenario_replay_runs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy scenario_replay_runs_update on public.scenario_replay_runs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy scenario_replay_runs_delete on public.scenario_replay_runs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.meeting_pilot_notes enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.meeting_pilot_notes to anon;
grant select, insert, update, delete on public.meeting_pilot_notes to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.meeting_pilot_notes from anon;
revoke truncate, references, trigger on public.meeting_pilot_notes from authenticated;
create policy meeting_pilot_notes_read on public.meeting_pilot_notes for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy meeting_pilot_notes_insert on public.meeting_pilot_notes for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy meeting_pilot_notes_update on public.meeting_pilot_notes for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy meeting_pilot_notes_delete on public.meeting_pilot_notes for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.pilot_issues enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.pilot_issues to anon;
grant select, insert, update, delete on public.pilot_issues to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.pilot_issues from anon;
revoke truncate, references, trigger on public.pilot_issues from authenticated;
create policy pilot_issues_read on public.pilot_issues for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy pilot_issues_insert on public.pilot_issues for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy pilot_issues_update on public.pilot_issues for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy pilot_issues_delete on public.pilot_issues for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.batch_regression_runs enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.batch_regression_runs to anon;
grant select, insert, update, delete on public.batch_regression_runs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.batch_regression_runs from anon;
revoke truncate, references, trigger on public.batch_regression_runs from authenticated;
create policy batch_regression_runs_read on public.batch_regression_runs for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy batch_regression_runs_insert on public.batch_regression_runs for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy batch_regression_runs_update on public.batch_regression_runs for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy batch_regression_runs_delete on public.batch_regression_runs for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.batch_regression_run_items enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.batch_regression_run_items to anon;
grant select, insert, update, delete on public.batch_regression_run_items to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.batch_regression_run_items from anon;
revoke truncate, references, trigger on public.batch_regression_run_items from authenticated;
create policy batch_regression_run_items_read on public.batch_regression_run_items for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy batch_regression_run_items_insert on public.batch_regression_run_items for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy batch_regression_run_items_update on public.batch_regression_run_items for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy batch_regression_run_items_delete on public.batch_regression_run_items for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.field_tests enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.field_tests to anon;
grant select, insert, update, delete on public.field_tests to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.field_tests from anon;
revoke truncate, references, trigger on public.field_tests from authenticated;
create policy field_tests_read on public.field_tests for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy field_tests_insert on public.field_tests for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy field_tests_update on public.field_tests for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy field_tests_delete on public.field_tests for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.remote_capture_readiness enable row level security;
-- Keep SELECT for anon so an unauthenticated REST read returns [] via RLS.
grant select on public.remote_capture_readiness to anon;
grant select, insert, update, delete on public.remote_capture_readiness to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.remote_capture_readiness from anon;
revoke truncate, references, trigger on public.remote_capture_readiness from authenticated;
create policy remote_capture_readiness_read on public.remote_capture_readiness for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy remote_capture_readiness_insert on public.remote_capture_readiness for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy remote_capture_readiness_update on public.remote_capture_readiness for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy remote_capture_readiness_delete on public.remote_capture_readiness for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

commit;

-- Optional work-package notes and task checklists; existing task notes stay intact.
begin;
alter table public.work_packages add column notes text;

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  notes text,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index task_subtasks_task_idx on public.task_subtasks(task_id, created_at, id);
create trigger task_subtasks_set_updated_at before update on public.task_subtasks
  for each row execute function public.set_updated_at();
create trigger task_subtasks_prevent_delete before delete on public.task_subtasks
  for each row execute function public.tracker_prevent_delete();

alter table public.task_subtasks enable row level security;
revoke all on public.task_subtasks from anon;
revoke all on public.task_subtasks from authenticated;
grant select, insert, update, delete on public.task_subtasks to authenticated;
create policy task_subtasks_read on public.task_subtasks for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy task_subtasks_insert on public.task_subtasks for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy task_subtasks_update on public.task_subtasks for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy task_subtasks_delete on public.task_subtasks for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

-- Checklist changes are recorded against their parent task in project activity.
create function public.tracker_record_subtask_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  event_project_id uuid;
  event_action text;
begin
  select w.project_id into event_project_id from public.tasks t
    join public.work_packages w on w.id = t.work_package_id where t.id = new.task_id;
  if tg_op = 'INSERT' then event_action := 'subtask_added';
  elsif to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return new;
  elsif old.archived_at is distinct from new.archived_at then
    event_action := case when new.archived_at is null then 'subtask_restored' else 'subtask_archived' end;
  elsif old.is_done is distinct from new.is_done then
    event_action := case when new.is_done then 'subtask_completed' else 'subtask_reopened' end;
  else event_action := 'subtask_edited'; end if;
  insert into public.project_events(project_id, entity_type, entity_id, action, from_value, to_value)
    values (event_project_id, 'task', new.task_id, event_action,
      case when tg_op = 'UPDATE' then jsonb_build_object('subtask', to_jsonb(old)) else null end,
      jsonb_build_object('subtask', to_jsonb(new)));
  return new;
end;
$$;
create trigger task_subtasks_record_event after insert or update on public.task_subtasks
  for each row execute function public.tracker_record_subtask_event();
commit;

-- Sprint 34: work packages, tasks and nullable future provenance.
begin;

create table public.work_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  sort_order integer not null default 0,
  target_date date,
  acceptance_criteria text,
  source_type text,
  source_meeting_id uuid references public.meetings(id) on delete set null,
  source_item_id uuid,
  evidence_quote text,
  certainty text check (certainty in ('known', 'inferred', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.work_packages(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  blocked_reason text,
  due_date date,
  size text check (size in ('s', 'm', 'l')),
  notes text,
  sort_order integer not null default 0,
  source_type text,
  source_meeting_id uuid references public.meetings(id) on delete set null,
  source_item_id uuid,
  evidence_quote text,
  certainty text check (certainty in ('known', 'inferred', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  check (status <> 'blocked' or nullif(btrim(blocked_reason), '') is not null),
  check ((status = 'done') = (completed_at is not null))
);

create index work_packages_project_order_idx on public.work_packages(project_id, sort_order, created_at);
create index tasks_work_package_order_idx on public.tasks(work_package_id, sort_order, created_at);
create index tasks_due_date_idx on public.tasks(due_date) where archived_at is null;
create index tasks_completed_at_idx on public.tasks(completed_at) where archived_at is null;

create function public.tracker_task_completion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' then
      new.completed_at = now();
    elsif old.status is distinct from 'done' then
      new.completed_at = now();
    else
      new.completed_at = old.completed_at;
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;
create trigger tasks_completion before insert or update on public.tasks
  for each row execute function public.tracker_task_completion();

create trigger work_packages_set_updated_at before update on public.work_packages
  for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger work_packages_prevent_delete before delete on public.work_packages
  for each row execute function public.tracker_prevent_delete();
create trigger tasks_prevent_delete before delete on public.tasks
  for each row execute function public.tracker_prevent_delete();

alter table public.work_packages enable row level security;
revoke all on public.work_packages from anon;
revoke all on public.work_packages from authenticated;
grant select, insert, update, delete on public.work_packages to authenticated;
create policy work_packages_read on public.work_packages for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy work_packages_insert on public.work_packages for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy work_packages_update on public.work_packages for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy work_packages_delete on public.work_packages for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

alter table public.tasks enable row level security;
revoke all on public.tasks from anon;
revoke all on public.tasks from authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
create policy tasks_read on public.tasks for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy tasks_update on public.tasks for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

commit;

-- Sprint 34: append-only events. Invoker triggers run inside the mutation's
-- transaction and use the same owner RLS as the originating write.
begin;

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  entity_type text not null check (entity_type in ('project', 'work_package', 'task')),
  entity_id uuid not null,
  action text not null,
  from_value jsonb,
  to_value jsonb,
  created_at timestamptz not null default now()
);
create index project_events_project_created_idx on public.project_events(project_id, created_at desc);

alter table public.project_events enable row level security;
revoke all on public.project_events from anon;
revoke all on public.project_events from authenticated;
grant select, insert on public.project_events to authenticated;
create policy project_events_read on public.project_events for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy project_events_insert on public.project_events for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');

create function public.tracker_record_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  event_project_id uuid;
  kind text;
  field text;
  before_row jsonb;
  after_row jsonb := to_jsonb(new);
  event_action text;
begin
  if tg_table_name = 'projects' then
    event_project_id := new.id;
    kind := 'project';
  elsif tg_table_name = 'work_packages' then
    event_project_id := new.project_id;
    kind := 'work_package';
  else
    select project_id into event_project_id from public.work_packages where id = new.work_package_id;
    kind := 'task';
  end if;
  if tg_op = 'INSERT' then
    insert into public.project_events (project_id, entity_type, entity_id, action, to_value)
      values (event_project_id, kind, new.id, 'created', after_row);
  else
    before_row := to_jsonb(old);
    for field in select jsonb_object_keys(after_row - 'updated_at') loop
      if before_row -> field is distinct from after_row -> field then
        event_action := case
          when field = 'archived_at' and new.archived_at is not null then 'archived'
          when field = 'archived_at' then 'restored'
          when field in ('status', 'stage') then 'status_changed'
          else 'edited'
        end;
        insert into public.project_events (project_id, entity_type, entity_id, action, from_value, to_value)
          values (event_project_id, kind, new.id, event_action,
            jsonb_build_object(field, before_row -> field), jsonb_build_object(field, after_row -> field));
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger projects_record_event after insert or update on public.projects
  for each row execute function public.tracker_record_event();
create trigger work_packages_record_event after insert or update on public.work_packages
  for each row execute function public.tracker_record_event();
create trigger tasks_record_event after insert or update on public.tasks
  for each row execute function public.tracker_record_event();

commit;

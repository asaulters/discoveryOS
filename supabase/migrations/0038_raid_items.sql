-- Sprint 35: RAID and the same archive, event and role boundaries as the tracker.
begin;
create table public.raid_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  kind text not null check (kind in ('risk', 'assumption', 'issue', 'decision')),
  title text not null check (length(btrim(title)) > 0),
  detail text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  owner text,
  recommendation_type text,
  confidence text,
  source_type text,
  source_meeting_id uuid references public.meetings(id) on delete set null,
  source_item_id uuid,
  source_item_key text,
  evidence_quote text,
  certainty text check (certainty in ('known', 'inferred', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  archived_at timestamptz
);
create index raid_items_project_idx on public.raid_items(project_id, created_at);
create unique index raid_items_source_unique on public.raid_items
  (source_type, source_item_id, coalesce(source_item_key, ''))
  where source_item_id is not null and archived_at is null;

alter table public.raid_items enable row level security;
revoke all on public.raid_items from anon;
revoke all on public.raid_items from authenticated;
grant select, insert, update, delete on public.raid_items to authenticated;
create policy raid_items_read on public.raid_items for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy raid_items_insert on public.raid_items for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy raid_items_update on public.raid_items for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy raid_items_delete on public.raid_items for delete to authenticated
  using ((select public.current_user_role()) = 'owner');
create trigger raid_items_set_updated_at before update on public.raid_items
  for each row execute function public.set_updated_at();
create trigger raid_items_prevent_delete before delete on public.raid_items
  for each row execute function public.tracker_prevent_delete();

create function public.raid_item_resolution()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'resolved' then
    if tg_op = 'INSERT' then new.resolved_at = now();
    elsif old.status is distinct from 'resolved' then new.resolved_at = now();
    else new.resolved_at = old.resolved_at; end if;
  else new.resolved_at = null; end if;
  return new;
end;
$$;
create trigger raid_items_resolution before insert or update on public.raid_items
  for each row execute function public.raid_item_resolution();

alter table public.project_events drop constraint project_events_entity_type_check;
alter table public.project_events add constraint project_events_entity_type_check
  check (entity_type in ('project', 'work_package', 'task', 'raid_item'));
create or replace function public.tracker_record_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  event_project_id uuid;
  kind text;
  field text;
  before_row jsonb;
  after_row jsonb := to_jsonb(new);
  event_action text;
begin
  if tg_table_name = 'projects' then event_project_id := new.id; kind := 'project';
  elsif tg_table_name = 'work_packages' then event_project_id := new.project_id; kind := 'work_package';
  elsif tg_table_name = 'raid_items' then event_project_id := new.project_id; kind := 'raid_item';
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
          else 'edited' end;
        insert into public.project_events (project_id, entity_type, entity_id, action, from_value, to_value)
          values (event_project_id, kind, new.id, event_action,
            jsonb_build_object(field, before_row -> field), jsonb_build_object(field, after_row -> field));
      end if;
    end loop;
  end if;
  return new;
end;
$$;
create trigger raid_items_record_event after insert or update on public.raid_items
  for each row execute function public.tracker_record_event();
commit;

-- Daily CSV updates: stable project keys, immutable upload history and atomic patches.
begin;
create table public.project_csv_keys (
  project_id uuid not null references public.projects(id) on delete restrict,
  key text not null check (key ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'),
  kind text not null check (kind in ('project', 'work_package', 'task', 'subtask')),
  record_id uuid not null,
  primary key (project_id, key),
  unique (project_id, kind, record_id)
);
create table public.project_csv_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  request_id uuid not null,
  content_hash text not null,
  report_date date not null,
  summary text not null default '',
  source_csv text not null check (octet_length(source_csv) <= 2097152),
  changes jsonb not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, request_id),
  unique (project_id, content_hash)
);
create index project_csv_updates_history_idx on public.project_csv_updates(project_id, created_at desc);
alter table public.project_csv_keys enable row level security;
alter table public.project_csv_updates enable row level security;
revoke all on public.project_csv_keys, public.project_csv_updates from anon, authenticated;
grant select, insert, update, delete on public.project_csv_keys to authenticated;
grant select, insert on public.project_csv_updates to authenticated;
create policy project_csv_keys_read on public.project_csv_keys for select to authenticated using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy project_csv_keys_insert on public.project_csv_keys for insert to authenticated with check ((select public.current_user_role()) = 'owner');
create policy project_csv_keys_update on public.project_csv_keys for update to authenticated using ((select public.current_user_role()) = 'owner') with check ((select public.current_user_role()) = 'owner');
create policy project_csv_keys_delete on public.project_csv_keys for delete to authenticated using ((select public.current_user_role()) = 'owner');
create policy project_csv_updates_read on public.project_csv_updates for select to authenticated using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy project_csv_updates_insert on public.project_csv_updates for insert to authenticated with check ((select public.current_user_role()) = 'owner' and created_by = (select auth.uid()));
create trigger project_csv_updates_immutable before update or delete on public.project_csv_updates
  for each row execute function public.tracker_prevent_delete();

create function public.project_csv_snapshot(p_project_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if public.current_user_role() is null or public.current_user_role() not in ('owner', 'viewer') then
    raise exception 'Project access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'projects', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.projects p where p.id = p_project_id), '[]'::jsonb),
    'workPackages', coalesce((select jsonb_agg(to_jsonb(w) order by w.id) from public.work_packages w where w.project_id = p_project_id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.tasks t join public.work_packages w on w.id = t.work_package_id where w.project_id = p_project_id), '[]'::jsonb),
    'subtasks', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.task_subtasks s join public.tasks t on t.id = s.task_id join public.work_packages w on w.id = t.work_package_id where w.project_id = p_project_id), '[]'::jsonb),
    'keys', coalesce((select jsonb_agg(to_jsonb(k) order by k.key) from public.project_csv_keys k where k.project_id = p_project_id), '[]'::jsonb)
  );
end;
$$;
create function public.get_project_csv_state(p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('snapshot', s, 'revision', md5(s::text)) from (select public.project_csv_snapshot(p_project_id) as s) state;
$$;

create function public.apply_project_csv_update(p_project_id uuid, p_request_id uuid, p_revision text,
  p_report_date date, p_summary text, p_csv text, p_operations jsonb, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  before_state jsonb;
  after_state jsonb;
  entry jsonb;
  d jsonb;
  existing jsonb;
  kind text;
  item_id uuid;
  parent_id uuid;
  item_key text;
  is_new boolean;
  expected_parent uuid;
  saved_key public.project_csv_keys%rowtype;
  prior public.project_csv_updates%rowtype;
  run_id uuid;
  payload_hash text := md5(jsonb_build_array(p_csv, p_report_date, p_summary)::text);
begin
  if public.current_user_role() is distinct from 'owner' then raise exception 'Owner role required' using errcode = '42501'; end if;
  if p_request_id is null or p_revision is null or p_report_date is null or p_csv is null or octet_length(p_csv) > 2097152 or length(coalesce(p_summary, '')) > 20000 then
    raise exception 'Invalid CSV update request' using errcode = '22023';
  end if;
  if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) not between 1 and 2000 then
    raise exception 'Update supports 1 to 2000 rows' using errcode = '22023';
  end if;
  perform 1 from public.projects where id = p_project_id and archived_at is null for no key update;
  if not found then raise exception 'Project not found or archived' using errcode = '22023'; end if;
  select * into prior from public.project_csv_updates where project_id = p_project_id and request_id = p_request_id;
  if found then
    if prior.content_hash <> payload_hash then raise exception 'Request ID reused for different CSV content' using errcode = '23505'; end if;
    return jsonb_build_object('id', prior.id, 'already_applied', true);
  end if;
  select * into prior from public.project_csv_updates where project_id = p_project_id and content_hash = payload_hash;
  if found then return jsonb_build_object('id', prior.id, 'already_applied', true); end if;
  perform 1 from public.work_packages where project_id = p_project_id order by id for no key update;
  perform 1 from public.tasks t where t.work_package_id in (select id from public.work_packages where project_id = p_project_id) order by t.id for no key update;
  perform 1 from public.task_subtasks s where s.task_id in (select t.id from public.tasks t join public.work_packages w on w.id = t.work_package_id where w.project_id = p_project_id) order by s.id for no key update;
  perform 1 from public.project_csv_keys where project_id = p_project_id order by key for update;
  before_state := public.project_csv_snapshot(p_project_id);
  if md5(before_state::text) <> p_revision then raise exception 'Project changed since preview. Preview this CSV again before applying.' using errcode = '40001'; end if;
  if (select count(*) from jsonb_array_elements(p_operations) r where r ->> 'kind' = 'project') <> 1
     or exists (select 1 from jsonb_array_elements(p_operations) r group by r ->> 'key' having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(p_operations) r group by r ->> 'id' having count(*) > 1) then
    raise exception 'Invalid or duplicate project update identities' using errcode = '22023';
  end if;
  for entry in select r.value from jsonb_array_elements(p_operations) with ordinality r(value,n)
    order by case r.value ->> 'kind' when 'project' then 0 when 'work_package' then 1 when 'task' then 2 when 'subtask' then 3 else 4 end, r.n loop
    kind := entry ->> 'kind'; item_id := (entry ->> 'id')::uuid;
    parent_id := (entry ->> 'parent_id')::uuid; item_key := entry ->> 'key';
    is_new := (entry ->> 'is_new')::boolean; d := entry -> 'data';
    if item_id is null or is_new is null or item_key is null or item_key !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' or jsonb_typeof(d) is distinct from 'object' then
      raise exception 'Invalid update row' using errcode = '22023';
    end if;
    select * into saved_key from public.project_csv_keys where project_id = p_project_id and key = item_key;
    if found and (saved_key.kind <> kind or saved_key.record_id <> item_id or is_new) then
      raise exception 'CSV key conflicts with a saved record' using errcode = '23505';
    end if;
    if kind = 'project' then
      if item_id <> p_project_id or is_new or parent_id is not null then raise exception 'CSV targets another project' using errcode = '22023'; end if;
    elsif kind = 'work_package' then
      if parent_id is distinct from p_project_id then raise exception 'Work package belongs to another project' using errcode = '22023'; end if;
    elsif kind = 'task' then
      perform 1 from public.work_packages where id = parent_id and project_id = p_project_id and archived_at is null;
      if not found then raise exception 'Task parent is outside this project or archived' using errcode = '22023'; end if;
    elsif kind = 'subtask' then
      perform 1 from public.tasks t join public.work_packages w on w.id = t.work_package_id
        where t.id = parent_id and w.project_id = p_project_id and t.archived_at is null and w.archived_at is null;
      if not found then raise exception 'Subtask parent is outside this project or archived' using errcode = '22023'; end if;
    else raise exception 'Unknown update row type' using errcode = '22023'; end if;
    if kind = 'project' then
      if exists (select 1 from jsonb_object_keys(d) f where f not in ('name', 'notes', 'requesting_team', 'sponsor', 'goal', 'stage', 'health', 'target_date', 'definition_of_done')) then raise exception 'Unsupported project field' using errcode = '22023'; end if;
      select to_jsonb(r) into existing from public.projects r where r.id = item_id;
      if is_new then
        if existing is not null then raise exception 'New record ID already exists' using errcode = '23505'; end if;
        raise exception 'Cannot create a project from its update page' using errcode = '22023';
      else
        if existing is null or existing ->> 'archived_at' is not null then raise exception 'Record missing or archived' using errcode = '22023'; end if;
        if exists (select 1 from jsonb_each(d) f where existing -> f.key is distinct from f.value) then
          d := existing || d;
          update public.projects set name = d ->> 'name', notes = d ->> 'notes', requesting_team = d ->> 'requesting_team', sponsor = d ->> 'sponsor', goal = d ->> 'goal', stage = d ->> 'stage', health = d ->> 'health', target_date = (d ->> 'target_date')::date, definition_of_done = d ->> 'definition_of_done' where id = item_id;
        end if;
      end if;
    elsif kind = 'work_package' then
      if exists (select 1 from jsonb_object_keys(d) f where f not in ('name', 'notes', 'status', 'target_date', 'sort_order', 'acceptance_criteria')) then raise exception 'Unsupported work_package field' using errcode = '22023'; end if;
      select to_jsonb(r) into existing from public.work_packages r where r.id = item_id;
      if is_new then
        if existing is not null then raise exception 'New record ID already exists' using errcode = '23505'; end if;
        insert into public.work_packages(id, project_id, name, notes, status, target_date, sort_order, acceptance_criteria) values (item_id, parent_id, d ->> 'name', d ->> 'notes', coalesce(d ->> 'status', 'todo'), (d ->> 'target_date')::date, coalesce((d ->> 'sort_order')::integer, 0), d ->> 'acceptance_criteria');
      else
        if existing is null or existing ->> 'archived_at' is not null then raise exception 'Record missing or archived' using errcode = '22023'; end if;
        if (existing ->> 'project_id')::uuid is distinct from parent_id then raise exception 'CSV cannot reparent records' using errcode = '22023'; end if;
        if exists (select 1 from jsonb_each(d) f where existing -> f.key is distinct from f.value) then
          d := existing || d;
          update public.work_packages set name = d ->> 'name', notes = d ->> 'notes', status = d ->> 'status', target_date = (d ->> 'target_date')::date, sort_order = (d ->> 'sort_order')::integer, acceptance_criteria = d ->> 'acceptance_criteria' where id = item_id;
        end if;
      end if;
    elsif kind = 'task' then
      if exists (select 1 from jsonb_object_keys(d) f where f not in ('title', 'notes', 'status', 'due_date', 'blocked_reason', 'size', 'sort_order')) then raise exception 'Unsupported task field' using errcode = '22023'; end if;
      select to_jsonb(r) into existing from public.tasks r where r.id = item_id;
      if is_new then
        if existing is not null then raise exception 'New record ID already exists' using errcode = '23505'; end if;
        insert into public.tasks(id, work_package_id, title, notes, status, due_date, blocked_reason, size, sort_order) values (item_id, parent_id, d ->> 'title', d ->> 'notes', coalesce(d ->> 'status', 'todo'), (d ->> 'due_date')::date, d ->> 'blocked_reason', d ->> 'size', coalesce((d ->> 'sort_order')::integer, 0));
      else
        if existing is null or existing ->> 'archived_at' is not null then raise exception 'Record missing or archived' using errcode = '22023'; end if;
        if (existing ->> 'work_package_id')::uuid is distinct from parent_id then raise exception 'CSV cannot reparent records' using errcode = '22023'; end if;
        if exists (select 1 from jsonb_each(d) f where existing -> f.key is distinct from f.value) then
          d := existing || d;
          update public.tasks set title = d ->> 'title', notes = d ->> 'notes', status = d ->> 'status', due_date = (d ->> 'due_date')::date, blocked_reason = d ->> 'blocked_reason', size = d ->> 'size', sort_order = (d ->> 'sort_order')::integer where id = item_id;
        end if;
      end if;
    elsif kind = 'subtask' then
      if exists (select 1 from jsonb_object_keys(d) f where f not in ('title', 'notes', 'is_done', 'sort_order')) then raise exception 'Unsupported subtask field' using errcode = '22023'; end if;
      select to_jsonb(r) into existing from public.task_subtasks r where r.id = item_id;
      if is_new then
        if existing is not null then raise exception 'New record ID already exists' using errcode = '23505'; end if;
        insert into public.task_subtasks(id, task_id, title, notes, is_done, sort_order) values (item_id, parent_id, d ->> 'title', d ->> 'notes', coalesce((d ->> 'is_done')::boolean, false), coalesce((d ->> 'sort_order')::integer, 0));
        if d ? 'sort_order' then update public.task_subtasks set sort_order = (d ->> 'sort_order')::integer where id = item_id; end if;
      else
        if existing is null or existing ->> 'archived_at' is not null then raise exception 'Record missing or archived' using errcode = '22023'; end if;
        if (existing ->> 'task_id')::uuid is distinct from parent_id then raise exception 'CSV cannot reparent records' using errcode = '22023'; end if;
        if exists (select 1 from jsonb_each(d) f where existing -> f.key is distinct from f.value) then
          d := existing || d;
          update public.task_subtasks set title = d ->> 'title', notes = d ->> 'notes', is_done = (d ->> 'is_done')::boolean, sort_order = (d ->> 'sort_order')::integer where id = item_id;
        end if;
      end if;
    end if;
    insert into public.project_csv_keys(project_id, key, kind, record_id) values (p_project_id, item_key, kind, item_id) on conflict (project_id, key) do nothing;
  end loop;
  after_state := public.project_csv_snapshot(p_project_id);
  insert into public.project_csv_updates(project_id, request_id, content_hash, report_date, summary, source_csv, changes, before_state, after_state, created_by)
    values (p_project_id, p_request_id, payload_hash, p_report_date, coalesce(p_summary, ''), p_csv, p_changes, before_state, after_state, auth.uid()) returning id into run_id;
  insert into public.project_events(project_id, entity_type, entity_id, action, to_value)
    values (p_project_id, 'project', p_project_id, 'csv_updated', jsonb_build_object('update_id', run_id, 'report_date', p_report_date, 'summary', p_summary));
  return jsonb_build_object('id', run_id, 'already_applied', false);
end;
$$;
revoke all on function public.project_csv_snapshot(uuid), public.get_project_csv_state(uuid), public.apply_project_csv_update(uuid, uuid, text, date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.project_csv_snapshot(uuid), public.get_project_csv_state(uuid), public.apply_project_csv_update(uuid, uuid, text, date, text, text, jsonb, jsonb) to authenticated;
commit;

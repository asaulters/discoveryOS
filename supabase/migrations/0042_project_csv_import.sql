-- One owner-only, invoker transaction for a complete project hierarchy.
begin;
alter table public.projects add column import_request_id uuid unique;
alter table public.projects add column import_payload_hash text;
create function public.import_project_csv(p_request_id uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  entry jsonb;
  d jsonb;
  item_key text;
  parent_key text;
  item_type text;
  expected_parent text;
  ids jsonb := '{}';
  parent_id uuid;
  inserted_id uuid;
  project_id uuid;
  prior public.projects%rowtype;
  payload_hash text := md5(p_rows::text);
  counts jsonb;
begin
  if public.current_user_role() is distinct from 'owner' then raise exception 'Owner role required' using errcode = '42501'; end if;
  if p_request_id is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid import request' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 2000 then raise exception 'Import supports 1 to 2000 rows' using errcode = '22023'; end if;
  if (select count(*) from jsonb_array_elements(p_rows) r where r ->> 'type' = 'project') <> 1 then raise exception 'Import exactly one project' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r group by r ->> 'key' having count(*) > 1) then raise exception 'Duplicate import key' using errcode = '22023'; end if;
  select jsonb_build_object('project', count(*) filter (where r ->> 'type' = 'project'),
    'work_package', count(*) filter (where r ->> 'type' = 'work_package'),
    'task', count(*) filter (where r ->> 'type' = 'task'),
    'subtask', count(*) filter (where r ->> 'type' = 'subtask')) into counts from jsonb_array_elements(p_rows) r;
  -- A retry after a lost response returns the original project, never a duplicate.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into prior from public.projects where import_request_id = p_request_id;
  if found then
    if prior.import_payload_hash is distinct from payload_hash then raise exception 'Import request already used for different content; choose the CSV again' using errcode = '23505'; end if;
    return jsonb_build_object('project_id', prior.id, 'already_imported', true, 'counts', counts);
  end if;
  for entry in select r.value from jsonb_array_elements(p_rows) with ordinality r(value, n)
    order by case r.value ->> 'type' when 'project' then 0 when 'work_package' then 1 when 'task' then 2 when 'subtask' then 3 else 4 end, r.n loop
    item_type := entry ->> 'type'; item_key := entry ->> 'key'; parent_key := nullif(entry ->> 'parent_key', ''); d := entry -> 'data';
    if item_key is null or item_key !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$' or jsonb_typeof(d) is distinct from 'object' then raise exception 'Invalid import row' using errcode = '22023'; end if;
    if item_type = 'project' then
      if parent_key is not null then raise exception 'Project cannot have a parent' using errcode = '22023'; end if;
      insert into public.projects(name, notes, requesting_team, sponsor, goal, stage, health, target_date, definition_of_done, import_request_id, import_payload_hash)
        values (d ->> 'name', d ->> 'notes', d ->> 'requesting_team', d ->> 'sponsor', d ->> 'goal', coalesce(d ->> 'stage', 'intake'),
          coalesce(d ->> 'health', 'on_track'), (d ->> 'target_date')::date, d ->> 'definition_of_done', p_request_id, payload_hash) returning id into inserted_id;
      project_id := inserted_id;
    else
      expected_parent := case item_type when 'work_package' then 'project' when 'task' then 'work_package' when 'subtask' then 'task' else null end;
      if expected_parent is null or (ids -> parent_key ->> 'type') is distinct from expected_parent then raise exception 'Missing or invalid parent for %', item_key using errcode = '22023'; end if;
      parent_id := (ids -> parent_key ->> 'id')::uuid;
      if item_type = 'work_package' then
        insert into public.work_packages(project_id, name, notes, status, target_date, acceptance_criteria, sort_order)
          values (parent_id, d ->> 'name', d ->> 'notes', coalesce(d ->> 'status', 'todo'), (d ->> 'target_date')::date,
            d ->> 'acceptance_criteria', coalesce((d ->> 'sort_order')::integer, 0)) returning id into inserted_id;
      elsif item_type = 'task' then
        insert into public.tasks(work_package_id, title, notes, status, due_date, blocked_reason, size, sort_order)
          values (parent_id, d ->> 'title', d ->> 'notes', coalesce(d ->> 'status', 'todo'), (d ->> 'due_date')::date,
            d ->> 'blocked_reason', d ->> 'size', coalesce((d ->> 'sort_order')::integer, 0)) returning id into inserted_id;
      else
        insert into public.task_subtasks(task_id, title, notes, is_done)
          values (parent_id, d ->> 'title', d ->> 'notes', coalesce((d ->> 'is_done')::boolean, false)) returning id into inserted_id;
      end if;
    end if;
    ids := ids || jsonb_build_object(item_key, jsonb_build_object('id', inserted_id, 'type', item_type));
  end loop;
  return jsonb_build_object('project_id', project_id, 'already_imported', false, 'counts', counts);
end;
$$;
revoke all on function public.import_project_csv(uuid, jsonb) from public, anon;
grant execute on function public.import_project_csv(uuid, jsonb) to authenticated;
commit;

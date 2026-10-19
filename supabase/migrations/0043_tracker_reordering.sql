-- Saved sibling ordering for work packages, tasks and checklist subtasks.
begin;
alter table public.task_subtasks add column sort_order integer not null default 0;
with ranked as (
  select id, row_number() over (partition by task_id order by created_at, id) - 1 as position
  from public.task_subtasks
)
update public.task_subtasks s set sort_order = r.position from ranked r where r.id = s.id;
create index task_subtasks_order_idx on public.task_subtasks(task_id, sort_order, created_at, id);

-- New checklist items append after the current order, including after reordering.
create function public.tracker_append_subtask()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.tasks where id = new.task_id for no key update;
  select coalesce(max(sort_order) + 1, 0) into new.sort_order
    from public.task_subtasks where task_id = new.task_id;
  return new;
end;
$$;
create trigger task_subtasks_append before insert on public.task_subtasks
  for each row execute function public.tracker_append_subtask();

-- Parent locks serialize sibling moves. RLS and the role check both apply.
create function public.reorder_tracker_item(p_kind text, p_id uuid, p_direction text, p_status text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  table_name text;
  parent_column text;
  parent_id uuid;
  package_id uuid;
  project_id uuid;
  ordered_ids uuid[];
  item_position integer;
  destination integer;
  adjacent_id uuid;
  scoped_ids uuid[];
  scoped_position integer;
begin
  if public.current_user_role() is distinct from 'owner' then
    raise exception 'Owner role required' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'Direction must be up or down' using errcode = '22023';
  end if;
  if p_status is not null and (p_kind is distinct from 'task' or p_status not in ('todo', 'doing', 'blocked', 'done')) then
    raise exception 'Status scope is only supported for task board columns' using errcode = '22023';
  end if;
  if p_kind = 'work_package' then
    table_name := 'work_packages'; parent_column := 'project_id';
    select w.project_id into parent_id from public.work_packages w where w.id = p_id and w.archived_at is null;
    project_id := parent_id;
  elsif p_kind = 'task' then
    table_name := 'tasks'; parent_column := 'work_package_id';
    select t.work_package_id into parent_id from public.tasks t where t.id = p_id and t.archived_at is null;
    package_id := parent_id;
    select w.project_id into project_id from public.work_packages w where w.id = package_id and w.archived_at is null;
  elsif p_kind = 'subtask' then
    table_name := 'task_subtasks'; parent_column := 'task_id';
    select s.task_id into parent_id from public.task_subtasks s where s.id = p_id and s.archived_at is null;
    select t.work_package_id into package_id from public.tasks t where t.id = parent_id and t.archived_at is null;
    select w.project_id into project_id from public.work_packages w where w.id = package_id and w.archived_at is null;
  else
    raise exception 'Unknown item type' using errcode = '22023';
  end if;
  -- Lock ancestors in a consistent order and reject archived hierarchies.
  perform 1 from public.projects p where p.id = project_id and p.archived_at is null for no key update;
  if not found then raise exception 'Restore the item and its parents before reordering' using errcode = '22023'; end if;
  if package_id is not null then
    perform 1 from public.work_packages w where w.id = package_id and w.archived_at is null for no key update;
    if not found then raise exception 'Work package is archived' using errcode = '22023'; end if;
  end if;
  if p_kind = 'subtask' then
    perform 1 from public.tasks t where t.id = parent_id and t.archived_at is null for no key update;
    if not found then raise exception 'Task is archived' using errcode = '22023'; end if;
  end if;
  execute format('select array_agg(id order by sort_order, created_at, id) from public.%I where %I = $1 and archived_at is null', table_name, parent_column)
    into ordered_ids using parent_id;
  item_position := array_position(ordered_ids, p_id);
  if item_position is null then raise exception 'Item not found or archived' using errcode = '22023'; end if;
  if p_status is null then
    destination := item_position + case when p_direction = 'up' then -1 else 1 end;
    if destination < 1 or destination > array_length(ordered_ids, 1) then return; end if;
  else
    select array_agg(t.id order by t.sort_order, t.created_at, t.id) into scoped_ids
      from public.tasks t where t.work_package_id = parent_id and t.archived_at is null and t.status = p_status;
    scoped_position := array_position(scoped_ids, p_id);
    if scoped_position is null then raise exception 'Task is no longer in this status column' using errcode = '22023'; end if;
    scoped_position := scoped_position + case when p_direction = 'up' then -1 else 1 end;
    if scoped_position < 1 or scoped_position > array_length(scoped_ids, 1) then return; end if;
    destination := array_position(ordered_ids, scoped_ids[scoped_position]);
  end if;
  adjacent_id := ordered_ids[destination];
  ordered_ids[destination] := p_id;
  ordered_ids[item_position] := adjacent_id;
  execute format('update public.%I item set sort_order = ranked.position - 1 from unnest($1::uuid[]) with ordinality ranked(id, position) where item.id = ranked.id and item.sort_order is distinct from ranked.position - 1', table_name)
    using ordered_ids;
end;
$$;
revoke all on function public.reorder_tracker_item(text, uuid, text, text) from public, anon;
grant execute on function public.reorder_tracker_item(text, uuid, text, text) to authenticated;
commit;

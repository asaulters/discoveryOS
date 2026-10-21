-- Business conflicts must not use serialization_failure: PostgREST retries it.
begin;
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.apply_project_csv_update(uuid,uuid,text,date,text,text,jsonb,jsonb)'::regprocedure);
  if position('using errcode = ''40001''' in definition) = 0 then
    raise exception 'Expected the CSV update function from migration 0044';
  end if;
  execute replace(definition, 'using errcode = ''40001''', 'using errcode = ''PT409''');
end;
$$;

-- The app checks this marker before enabling writes against the patched function.
create or replace function public.get_project_csv_state(p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('snapshot', s, 'revision', md5(s::text), 'conflict_mode', 'http409')
    from (select public.project_csv_snapshot(p_project_id) as s) state;
$$;
notify pgrst, 'reload schema';
commit;

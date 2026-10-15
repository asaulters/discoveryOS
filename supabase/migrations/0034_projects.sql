-- Sprint 34: project hierarchy. All tracker rows are archived, never deleted.
begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  requesting_team text,
  sponsor text,
  goal text,
  stage text not null default 'intake'
    check (stage in ('intake', 'discovery', 'decide', 'build', 'pilot', 'live', 'paused', 'closed')),
  health text not null default 'on_track' check (health in ('on_track', 'at_risk', 'off_track')),
  target_date date,
  definition_of_done text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create function public.tracker_prevent_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Archive tracker rows instead of deleting them' using errcode = '23514';
end;
$$;
create trigger projects_prevent_delete before delete on public.projects
  for each row execute function public.tracker_prevent_delete();

alter table public.projects enable row level security;
revoke all on public.projects from anon;
revoke all on public.projects from authenticated;
grant select, insert, update, delete on public.projects to authenticated;
create policy projects_read on public.projects for select to authenticated
  using ((select public.current_user_role()) in ('owner', 'viewer'));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy projects_update on public.projects for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy projects_delete on public.projects for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

commit;

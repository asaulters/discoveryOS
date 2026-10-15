-- Sprint 35: optional meeting/project link and stable JSON-array source keys.
begin;
alter table public.meetings add column project_id uuid references public.projects(id) on delete set null;
create index meetings_project_id_idx on public.meetings(project_id);
alter table public.work_packages add column source_item_key text;
alter table public.tasks add column source_item_key text;
create unique index work_packages_source_unique on public.work_packages
  (source_type, source_item_id, coalesce(source_item_key, ''))
  where source_item_id is not null and archived_at is null;
create unique index tasks_source_unique on public.tasks
  (source_type, source_item_id, coalesce(source_item_key, ''))
  where source_item_id is not null and archived_at is null;
commit;

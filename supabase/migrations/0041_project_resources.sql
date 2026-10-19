-- Project context and private, role-protected files/document links.
begin;
alter table public.projects add column notes text;
create table public.project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  kind text not null check (kind in ('file', 'link')),
  name text not null check (length(btrim(name)) between 1 and 500),
  description text,
  url text,
  storage_path text unique,
  size_bytes bigint check (size_bytes between 1 and 26214400),
  content_type text,
  state text not null default 'pending' check (state in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'file' and storage_path is not null and url is null and size_bytes is not null
      and storage_path like project_id::text || '/' || id::text || '/%')
    or (kind = 'link' and url is not null and url ~ '^https://' and storage_path is null and size_bytes is null and state = 'ready'))
);
create index project_attachments_project_idx on public.project_attachments(project_id, created_at, id);
create trigger project_attachments_updated before update on public.project_attachments
  for each row execute function public.set_updated_at();
create trigger project_attachments_prevent_delete before delete on public.project_attachments
  for each row execute function public.tracker_prevent_delete();
alter table public.project_attachments enable row level security;
revoke all on public.project_attachments from anon;
revoke all on public.project_attachments from authenticated;
grant select, insert, update, delete on public.project_attachments to authenticated;
create policy project_attachments_read on public.project_attachments for select to authenticated
  using ((select public.current_user_role()) = 'owner'
    or ((select public.current_user_role()) = 'viewer' and state = 'ready'));
create policy project_attachments_insert on public.project_attachments for insert to authenticated
  with check ((select public.current_user_role()) = 'owner');
create policy project_attachments_update on public.project_attachments for update to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
create policy project_attachments_delete on public.project_attachments for delete to authenticated
  using ((select public.current_user_role()) = 'owner');

insert into storage.buckets(id, name, public, file_size_limit)
  values ('project-files', 'project-files', false, 26214400);
create policy project_files_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and exists (
    select 1 from public.project_attachments a where a.storage_path = storage.objects.name
      and a.archived_at is null and (a.state = 'ready' or (select public.current_user_role()) = 'owner')
      and (select public.current_user_role()) in ('owner', 'viewer')));
create policy project_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and (select public.current_user_role()) = 'owner'
    and exists (select 1 from public.project_attachments a join public.projects p on p.id = a.project_id
      where a.storage_path = storage.objects.name and a.kind = 'file' and a.state = 'pending'
        and a.archived_at is null and p.archived_at is null));
-- No update policy: uploads cannot overwrite an existing file.

create function public.project_attachment_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then event_action := 'resource_added';
  elsif to_jsonb(old) - 'updated_at' = to_jsonb(new) - 'updated_at' then return new;
  elsif old.archived_at is distinct from new.archived_at then
    event_action := case when new.archived_at is null then 'resource_restored' else 'resource_archived' end;
  elsif old.state is distinct from new.state then event_action := 'file_uploaded';
  else event_action := 'resource_edited'; end if;
  insert into public.project_events(project_id, entity_type, entity_id, action, from_value, to_value)
    values (new.project_id, 'project', new.project_id, event_action,
      case when tg_op = 'UPDATE' then jsonb_build_object('resource', to_jsonb(old)) else null end,
      jsonb_build_object('resource', to_jsonb(new)));
  return new;
end;
$$;
create trigger project_attachments_event after insert or update on public.project_attachments
  for each row execute function public.project_attachment_event();
commit;

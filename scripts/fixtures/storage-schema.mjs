// Minimal Supabase-owned Storage schema for isolated policy/protocol tests.
export async function storageSchema(db) {
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text not null, public boolean not null default false, file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id), name text not null, metadata jsonb, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
}

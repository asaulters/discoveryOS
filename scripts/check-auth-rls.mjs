// Isolated PostgreSQL/RLS verification. Never connects to the hosted project.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "00000000-0000-0000-0000-000000000001";
const viewer = "00000000-0000-0000-0000-000000000002";
const unprovisioned = "00000000-0000-0000-0000-000000000003";
const meeting = "00000000-0000-0000-0000-000000000004";
try {
  // Supabase-owned auth schema and roles, emulated only for this local test.
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  const tables = [];
  for (const file of readdirSync("supabase/migrations").filter(f => /^00\d\d_.*\.sql$/.test(f)).sort()) {
    let sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    if (file < "0033") tables.push(...Array.from(sql.matchAll(/create table\s+(?:if not exists\s+)?(\w+)/gi), m => m[1]));
    // PGlite has built-in gen_random_uuid(), but does not ship pgcrypto.
    sql = sql.replace('create extension if not exists "pgcrypto";', "");
    await db.exec(sql);
  }
  const { rows: policies } = await db.query("select tablename, cmd, roles from pg_policies where schemaname = 'public'");
  for (const table of tables) {
    assert.deepEqual(policies.filter(p => p.tablename === table).map(p => p.cmd).sort(), ["DELETE", "INSERT", "SELECT", "UPDATE"]);
    const { rows } = await db.query("select relrowsecurity from pg_class where oid = $1::regclass", [table]);
    assert.equal(rows[0].relrowsecurity, true, `${table} must enable RLS`);
  }
  await db.exec(`insert into auth.users values ('${owner}'), ('${viewer}'), ('${unprovisioned}');
    insert into profiles (id, role) values ('${owner}', 'owner'), ('${viewer}', 'viewer');
    insert into meetings (id, name, meeting_type) values ('${meeting}', 'Auth test', 'automation_discovery');`);
  async function asRole(role, user, fn) {
    await db.exec(`set role ${role}; set request.jwt.claim.sub = '${user ?? ""}';`);
    try { await fn(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
  }
  await asRole("anon", null, async () => {
    for (const table of tables) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `anon sees ${table}`);
    await assert.rejects(db.exec("insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')"), /permission denied|row-level security/);
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal((await db.query("select public.current_user_role() as role")).rows[0].role, "viewer");
    assert.equal((await db.query("select * from meetings")).rows.length, 1);
    await assert.rejects(db.exec("insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')"), /row-level security/);
    assert.equal((await db.query(`update meetings set name = 'blocked' where id = '${meeting}' returning id`)).rows.length, 0);
    assert.equal((await db.query(`delete from meetings where id = '${meeting}' returning id`)).rows.length, 0);
    await assert.rejects(db.exec(`update profiles set role = 'owner' where id = '${viewer}'`), /permission denied/);
    await assert.rejects(db.exec(`insert into profiles (id, role) values ('${unprovisioned}', 'owner')`), /permission denied/);
    await assert.rejects(db.exec("truncate meetings cascade"), /permission denied/);
  });
  await asRole("authenticated", unprovisioned, async () => {
    assert.equal((await db.query("select * from meetings")).rows.length, 0);
    await assert.rejects(db.exec("insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')"), /row-level security/);
  });
  await asRole("authenticated", owner, async () => {
    const id = (await db.query("insert into meetings (name, meeting_type) values ('Owner created', 'automation_discovery') returning id")).rows[0].id;
    assert.equal((await db.query("update meetings set name = 'Owner updated' where id = $1 returning id", [id])).rows.length, 1);
    assert.equal((await db.query("delete from meetings where id = $1 returning id", [id])).rows.length, 1);
  });
  console.log(`PASS: all migrations applied; ${tables.length} tables covered; anon denied, viewer read-only, owner CRUD, profile escalation denied.`);
} finally { await db.close(); }

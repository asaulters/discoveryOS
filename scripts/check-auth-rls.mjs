import { checkReordering } from "./check-reordering-rls.mjs";
import { checkProjectResources } from "./check-project-resources-rls.mjs";
import { storageSchema } from "./fixtures/storage-schema.mjs";
import { checkSubtasks } from "./check-subtasks-rls.mjs";
import { checkMeetingProject } from "./check-meeting-project-rls.mjs";
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
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await storageSchema(db);
  const tables = [];
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => /^00\d\d_.*\.sql$/.test(f))
    .sort()) {
    let sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    if (file !== "0033_auth_rls.sql")
      tables.push(
        ...Array.from(
          sql.matchAll(
            /create table\s+(?:if not exists\s+)?(?:public\.)?(\w+)/gi,
          ),
          (m) => m[1],
        ),
      );
    // PGlite has built-in gen_random_uuid(), but does not ship pgcrypto.
    sql = sql.replace('create extension if not exists "pgcrypto";', "");
    await db.exec(sql);
  }
  const { rows: policies } = await db.query(
    "select tablename, cmd, roles from pg_policies where schemaname = 'public'",
  );
  for (const table of tables) {
    assert.deepEqual(
      policies
        .filter((p) => p.tablename === table)
        .map((p) => p.cmd)
        .sort(),
      table === "project_events"
        ? ["INSERT", "SELECT"]
        : ["DELETE", "INSERT", "SELECT", "UPDATE"],
    );
    const { rows } = await db.query(
      "select relrowsecurity from pg_class where oid = $1::regclass",
      [table],
    );
    assert.equal(rows[0].relrowsecurity, true, `${table} must enable RLS`);
  }
  await db.exec(`insert into auth.users values ('${owner}'), ('${viewer}'), ('${unprovisioned}');
    insert into profiles (id, role) values ('${owner}', 'owner'), ('${viewer}', 'viewer');
    insert into meetings (id, name, meeting_type) values ('${meeting}', 'Auth test', 'automation_discovery');`);
  async function asRole(role, user, fn) {
    await db.exec(
      `set role ${role}; set request.jwt.claim.sub = '${user ?? ""}';`,
    );
    try {
      await fn();
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub;");
    }
  }
  await asRole("anon", null, async () => {
    for (const table of tables) {
      if (
        [
          "projects",
          "work_packages",
          "tasks",
          "project_events",
          "raid_items",
          "task_subtasks",
          "project_attachments",
        ].includes(table)
      ) {
        for (const privilege of [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE",
          "TRUNCATE",
        ]) {
          assert.equal(
            (
              await db.query(
                "select has_table_privilege('anon', $1, $2) as allowed",
                [table, privilege],
              )
            ).rows[0].allowed,
            false,
          );
        }
        await assert.rejects(
          db.query(`select * from ${table}`),
          /permission denied/,
        );
      } else
        assert.equal(
          (await db.query(`select * from ${table}`)).rows.length,
          0,
          `anon sees ${table}`,
        );
    }
    await assert.rejects(
      db.exec(
        "insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')",
      ),
      /permission denied|row-level security/,
    );
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (await db.query("select public.current_user_role() as role")).rows[0]
        .role,
      "viewer",
    );
    assert.equal((await db.query("select * from meetings")).rows.length, 1);
    await assert.rejects(
      db.exec(
        "insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')",
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          `update meetings set name = 'blocked' where id = '${meeting}' returning id`,
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          `delete from meetings where id = '${meeting}' returning id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec(`update profiles set role = 'owner' where id = '${viewer}'`),
      /permission denied/,
    );
    await assert.rejects(
      db.exec(
        `insert into profiles (id, role) values ('${unprovisioned}', 'owner')`,
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("truncate meetings cascade"),
      /permission denied/,
    );
  });
  await asRole("authenticated", unprovisioned, async () => {
    assert.equal((await db.query("select * from meetings")).rows.length, 0);
    await assert.rejects(
      db.exec(
        "insert into meetings (name, meeting_type) values ('blocked', 'automation_discovery')",
      ),
      /row-level security/,
    );
  });
  await asRole("authenticated", owner, async () => {
    const id = (
      await db.query(
        "insert into meetings (name, meeting_type) values ('Owner created', 'automation_discovery') returning id",
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query(
          "update meetings set name = 'Owner updated' where id = $1 returning id",
          [id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (await db.query("delete from meetings where id = $1 returning id", [id]))
        .rows.length,
      1,
    );
  });
  const project = "00000000-0000-0000-0000-000000000010";
  const workPackage = "00000000-0000-0000-0000-000000000011";
  const task = "00000000-0000-0000-0000-000000000012";
  const secondPackage = "00000000-0000-0000-0000-000000000013";
  await asRole("authenticated", owner, async () => {
    await db.query(
      "insert into projects (id, name) values ($1, 'Tracker acceptance')",
      [project],
    );
    await db.query(
      "insert into work_packages (id, project_id, name) values ($1, $2, 'First'), ($3, $2, 'Second')",
      [workPackage, project, secondPackage],
    );
    await db.query(
      "insert into tasks (id, work_package_id, title, source_meeting_id, certainty, evidence_quote) values ($1, $2, 'Acceptance task', $3, 'known', 'A source quote')",
      [task, workPackage, meeting],
    );
    assert.equal(
      (await db.query("select completed_at from tasks where id = $1", [task]))
        .rows[0].completed_at,
      null,
    );
    await db.query("update tasks set status = 'doing' where id = $1", [task]);
    await assert.rejects(
      db.query("update tasks set status = 'blocked' where id = $1", [task]),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "update tasks set status = 'blocked', blocked_reason = '  ' where id = $1",
        [task],
      ),
      /check constraint/,
    );
    await db.query(
      "update tasks set status = 'blocked', blocked_reason = 'Waiting for access' where id = $1",
      [task],
    );
    await db.query("update tasks set status = 'done' where id = $1", [task]);
    const completed = (
      await db.query("select completed_at from tasks where id = $1", [task])
    ).rows[0].completed_at;
    assert.ok(completed);
    await db.query(
      "update tasks set title = 'Edited title', completed_at = now() + interval '1 day' where id = $1",
      [task],
    );
    assert.equal(
      String(
        (await db.query("select completed_at from tasks where id = $1", [task]))
          .rows[0].completed_at,
      ),
      String(completed),
    );
    await db.query("update tasks set status = 'todo' where id = $1", [task]);
    assert.equal(
      (await db.query("select completed_at from tasks where id = $1", [task]))
        .rows[0].completed_at,
      null,
    );
    await db.query(
      "update work_packages set archived_at = now() where id = $1",
      [workPackage],
    );
    await db.query("update projects set health = 'at_risk' where id = $1", [
      project,
    ]);
    for (const table of ["projects", "work_packages", "tasks"])
      await assert.rejects(
        db.query(`delete from ${table}`),
        /Archive tracker rows/,
      );
    const events = (
      await db.query("select * from project_events where project_id = $1", [
        project,
      ])
    ).rows;
    assert.equal(events.filter((e) => e.action === "created").length, 4);
    assert.ok(
      events.some(
        (e) => e.action === "archived" && e.entity_id === workPackage,
      ),
    );
    assert.equal(events.filter((e) => e.action === "status_changed").length, 4);
    assert.ok(
      events.some(
        (e) => e.action === "edited" && e.to_value.title === "Edited title",
      ),
    );
    for (const action of [
      "update project_events set action = 'forged'",
      "delete from project_events",
      "truncate project_events",
    ])
      await assert.rejects(db.exec(action), /permission denied/);
  });
  await asRole("authenticated", viewer, async () => {
    for (const table of [
      "projects",
      "work_packages",
      "tasks",
      "project_events",
    ])
      assert.ok((await db.query(`select * from ${table}`)).rows.length > 0);
    for (const sql of [
      "insert into projects (name) values ('forbidden')",
      `insert into work_packages (project_id, name) values ('${project}', 'forbidden')`,
      `insert into tasks (work_package_id, title) values ('${workPackage}', 'forbidden')`,
      `insert into project_events (project_id, entity_type, entity_id, action) values ('${project}', 'task', '${task}', 'forged')`,
    ])
      await assert.rejects(db.exec(sql), /row-level security/);
    for (const [table, field] of [
      ["projects", "name"],
      ["work_packages", "name"],
      ["tasks", "title"],
    ]) {
      assert.equal(
        (
          await db.query(
            `update ${table} set ${field} = 'forbidden' returning id`,
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query(`delete from ${table} returning id`)).rows.length,
        0,
      );
    }
    for (const sql of [
      "update project_events set action = 'forged'",
      "delete from project_events",
    ])
      await assert.rejects(db.exec(sql), /permission denied/);
  });
  // Meeting provenance is nullable; deleting a source never deletes tracker work.
  await asRole("authenticated", owner, async () => {
    await db.query("delete from meetings where id = $1", [meeting]);
    const row = (
      await db.query(
        "select source_meeting_id, evidence_quote from tasks where id = $1",
        [task],
      )
    ).rows[0];
    assert.equal(row.source_meeting_id, null);
    assert.equal(row.evidence_quote, "A source quote");
    await db.query(
      "update work_packages set archived_at = null where id = $1",
      [workPackage],
    );
    assert.ok(
      (await db.query("select * from project_events where action = 'restored'"))
        .rows.length,
    );
  });
  await checkMeetingProject(db, asRole, owner, viewer);
  await checkReordering(db, asRole, owner, viewer);
  await checkSubtasks(db, asRole, owner, viewer);
  await checkProjectResources(db, asRole, owner, viewer);
  // Event failure rolls the originating mutation back; there is no partial save.
  await db.exec("revoke insert on project_events from authenticated");
  await asRole("authenticated", owner, async () => {
    await assert.rejects(
      db.query("update tasks set title = 'Must roll back' where id = $1", [
        task,
      ]),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select title from tasks where id = $1", [task])).rows[0]
        .title,
      "Edited title",
    );
  });
  console.log(
    `PASS: all migrations applied; ${tables.length} tables covered; anon denied, viewer read-only, owner CRUD, profile escalation denied; tracker transitions, archives, provenance and atomic append-only events verified.`,
  );
} finally {
  await db.close();
}

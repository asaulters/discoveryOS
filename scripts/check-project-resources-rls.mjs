import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importModules } from "./fixtures/import-module.mjs";
export async function checkProjectResources(db, asRole, owner, viewer) {
  const { parseProjectCsv, PROJECT_CSV_TEMPLATE } = await importModules();
  const rows = parseProjectCsv(PROJECT_CSV_TEMPLATE).rows.map(
    ({ type, key, parent_key, data }) => ({ type, key, parent_key, data }),
  );
  const send = (id, data = rows) =>
    db.query("select import_project_csv($1,$2::jsonb) as result", [
      id,
      JSON.stringify(data),
    ]);
  let project, attachment, path;
  await asRole("authenticated", viewer, async () => {
    await assert.rejects(send(randomUUID()), /Owner role required/);
  });
  await asRole("authenticated", owner, async () => {
    const request = randomUUID(),
      result = (await send(request, [...rows].reverse())).rows[0].result;
    project = result.project_id;
    assert.deepEqual(result.counts, {
      project: 1,
      work_package: 1,
      task: 1,
      subtask: 2,
    });
    const workPackage = (
      await db.query("select * from work_packages where project_id=$1", [
        project,
      ])
    ).rows[0];
    const task = (
      await db.query("select * from tasks where work_package_id=$1", [
        workPackage.id,
      ])
    ).rows[0];
    assert.equal(
      (
        await db.query("select * from task_subtasks where task_id=$1", [
          task.id,
        ])
      ).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select notes from projects where id=$1", [project]))
        .rows[0].notes,
      "Build notes and project context",
    );
    const retried = (await send(request, [...rows].reverse())).rows[0].result;
    assert.equal(retried.project_id, project);
    assert.equal(retried.already_imported, true);
    await assert.rejects(send(request, rows), /different content/);
    const counts = async () =>
      (
        await db.query(
          "select (select count(*) from projects)::int p,(select count(*) from work_packages)::int w,(select count(*) from tasks)::int t,(select count(*) from task_subtasks)::int s,(select count(*) from project_events)::int e",
        )
      ).rows[0];
    const before = await counts(),
      invalid = structuredClone(rows);
    invalid.find((r) => r.type === "subtask").parent_key = "missing";
    await assert.rejects(
      send(randomUUID(), invalid),
      /Missing or invalid parent/,
    );
    assert.deepEqual(
      await counts(),
      before,
      "Invalid last child rolls back every parent and event",
    );
    const blocked = structuredClone(rows);
    blocked.find((r) => r.type === "task").data.status = "blocked";
    await assert.rejects(send(randomUUID(), blocked), /check constraint/);
    assert.deepEqual(await counts(), before);
    await assert.rejects(db.query("insert into project_attachments(project_id,kind,name,state) values($1,'link','Missing URL','ready')", [project]), /check constraint/);
    attachment = randomUUID();
    path = `${project}/${attachment}/deck.pdf`;
    await db.query(
      "insert into project_attachments(id,project_id,kind,name,storage_path,size_bytes) values($1,$2,'file','Deck.pdf',$3,100)",
      [attachment, project, path],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,metadata) values('project-files',$1,'{\"size\":100}')",
      [path],
    );
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('project-files','unreserved.pdf')",
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into project_attachments(project_id,kind,name,url,state) values($1,'link','Bad','javascript:alert(1)','ready')",
        [project],
      ),
      /check constraint/,
    );
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (
        await db.query("select * from project_attachments where id=$1", [
          attachment,
        ])
      ).rows.length,
      0,
      "Incomplete uploads hidden from viewers",
    );
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into project_attachments(project_id,kind,name,url,state) values($1,'link','Forbidden','https://example.test','ready')",
        [project],
      ),
      /row-level security/,
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('project-files',$1)",
        [path],
      ),
      /row-level security/,
    );
  });
  await asRole("authenticated", owner, async () => {
    await db.query("update project_attachments set state='ready' where id=$1", [
      attachment,
    ]);
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (
        await db.query("select * from project_attachments where id=$1", [
          attachment,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update project_attachments set archived_at=now() where id=$1 returning id",
          [attachment],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update storage.objects set metadata='{}' where name=$1 returning id",
          [path],
        )
      ).rows.length,
      0,
    );
  });
  await asRole("anon", null, async () => {
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      0,
    );
  });
  await asRole("authenticated", owner, async () => {
    await assert.rejects(
      db.query("delete from project_attachments where id=$1", [attachment]),
      /Archive/,
    );
    await db.query(
      "update project_attachments set archived_at=now() where id=$1",
      [attachment],
    );
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (await db.query("select * from storage.objects where name=$1", [path]))
        .rows.length,
      0,
    );
  });
  await asRole("authenticated", owner, async () => {
    await db.query(
      "update project_attachments set archived_at=null where id=$1",
      [attachment],
    );
  });
  await db.exec("revoke insert on project_events from authenticated");
  try {
    await asRole("authenticated", owner, async () => {
      await assert.rejects(send(randomUUID()), /permission denied/);
      await assert.rejects(
        db.query(
          "update project_attachments set archived_at=now() where id=$1",
          [attachment],
        ),
        /permission denied/,
      );
      assert.equal(
        (
          await db.query(
            "select archived_at from project_attachments where id=$1",
            [attachment],
          )
        ).rows[0].archived_at,
        null,
      );
    });
  } finally {
    await db.exec("grant insert on project_events to authenticated");
  }
  assert.equal(
    (
      await db.query(
        "select prosecdef from pg_proc where oid='import_project_csv(uuid,jsonb)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select public from storage.buckets where id='project-files'",
      )
    ).rows[0].public,
    false,
  );
  console.log(
    "PASS: project notes, atomic hierarchy import and retry protection, rollback including events, private reserved uploads, incomplete/archive visibility, owner/viewer/anon file policies and archive-only resources.",
  );
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importModules } from "./fixtures/import-module.mjs";
export async function checkProjectUpdates(db, asRole, owner, viewer) {
  const { buildUpdatePlan, serializeUpdateCsv, exportUpdateCsv, readCsv } =
    await importModules();
  const date = "2026-10-21";
  let project, workPackage, task, applyInput;
  const state = async () =>
    (await db.query("select get_project_csv_state($1) as state", [project]))
      .rows[0].state;
  const apply = async (input) =>
    (
      await db.query(
        "select apply_project_csv_update($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as result",
        input,
      )
    ).rows[0].result;
  const decode = (csv) => {
    const records = readCsv(csv),
      head = records.shift().cells;
    return records.map((r) =>
      Object.fromEntries(head.map((h, i) => [h, r.cells[i]])),
    );
  };
  await asRole("authenticated", owner, async () => {
    project = (
      await db.query(
        "insert into projects(name,notes) values ('Daily CSV acceptance','Original project context') returning id",
      )
    ).rows[0].id;
    workPackage = (
      await db.query(
        "insert into work_packages(project_id,name) values ($1,'Delivery') returning id",
        [project],
      )
    ).rows[0].id;
    task = (
      await db.query(
        "insert into tasks(work_package_id,title,notes,due_date) values ($1,'Existing task','Keep existing notes','2026-10-30') returning id",
        [workPackage],
      )
    ).rows[0].id;
    const subtask = (
      await db.query(
        "insert into task_subtasks(task_id,title) values ($1,'Check') returning id",
        [task],
      )
    ).rows[0].id;
    assert.ok(subtask);
    const original = await state(),
      rows = decode(exportUpdateCsv(original.snapshot));
    rows[0].report_date = date;
    rows[0].update_summary = "Verified daily work";
    rows.find((r) => r.type === "task").status = "done";
    rows.find((r) => r.type === "task").notes = "";
    rows.find((r) => r.type === "task").progress_note = "Build passed";
    rows.find((r) => r.type === "subtask").is_done = "true";
    rows.push({
      type: "task",
      key: "new_task",
      parent_key: rows.find((r) => r.type === "work_package").key,
      name: "New action",
      action: "create",
    });
    const csv = serializeUpdateCsv(rows),
      plan = buildUpdatePlan(csv, original.snapshot, date);
    applyInput = [
      project,
      randomUUID(),
      original.revision,
      date,
      plan.summary,
      csv,
      JSON.stringify(plan.operations),
      JSON.stringify(plan.changes),
    ];
    const result = await apply(applyInput);
    assert.equal(result.already_applied, false);
    const updated = await state();
    assert.notEqual(updated.revision, original.revision);
    const saved = updated.snapshot.tasks.find((t) => t.id === task);
    assert.equal(saved.status, "done");
    assert.equal(saved.notes, "Keep existing notes\n[2026-10-21] Build passed");
    assert.equal(saved.due_date, "2026-10-30");
    assert.equal(updated.snapshot.subtasks[0].is_done, true);
    assert.equal(updated.snapshot.tasks.length, 2);
    assert.equal(updated.snapshot.keys.length, 5);
    const history = (
      await db.query("select * from project_csv_updates where project_id=$1", [
        project,
      ])
    ).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].source_csv, csv);
    assert.equal(
      history[0].before_state.tasks.find((t) => t.id === task).notes,
      "Keep existing notes",
    );
    assert.equal(
      history[0].after_state.tasks.find((t) => t.id === task).status,
      "done",
    );
    assert.equal((await apply(applyInput)).already_applied, true);
    assert.equal(
      (await apply([project, randomUUID(), ...applyInput.slice(2)]))
        .already_applied,
      true,
      "Same content with a new request ID does not duplicate new records or progress notes",
    );
    await assert.rejects(
      apply([...applyInput.slice(0, 5), csv + "\n", ...applyInput.slice(6)]),
      /Request ID reused/,
    );
    assert.equal((await state()).snapshot.tasks.length, 2);
    const editedRows = decode(exportUpdateCsv(updated.snapshot));
    editedRows[0].notes = "Updated project context";
    const editedCsv = serializeUpdateCsv(editedRows),
      editedPlan = buildUpdatePlan(editedCsv, updated.snapshot, date);
    const stale = [
      project,
      randomUUID(),
      updated.revision,
      date,
      "Stale",
      editedCsv,
      JSON.stringify(editedPlan.operations),
      JSON.stringify(editedPlan.changes),
    ];
    await db.query(
      "update tasks set notes='Concurrent human edit' where id=$1",
      [task],
    );
    await assert.rejects(apply(stale), /changed since preview/);
    assert.equal(
      (await state()).snapshot.projects[0].notes,
      "Original project context",
    );
    const before = await state();
    const otherProject = (
      await db.query(
        "insert into projects(name) values ('Other project') returning id",
      )
    ).rows[0].id;
    const otherWp = (
      await db.query(
        "insert into work_packages(project_id,name) values ($1,'Foreign parent') returning id",
        [otherProject],
      )
    ).rows[0].id;
    const foreignTask = (
      await db.query(
        "insert into tasks(work_package_id,title) values ($1,'Foreign task') returning id",
        [otherWp],
      )
    ).rows[0].id;
    const corrupt = structuredClone(editedPlan.operations);
    corrupt.find((o) => o.kind === "task").id = foreignTask;
    await assert.rejects(
      apply([
        project,
        randomUUID(),
        before.revision,
        date,
        "Foreign",
        editedCsv + "\n",
        JSON.stringify(corrupt),
        JSON.stringify([]),
      ]),
      /reparent|saved record/,
    );
    assert.deepEqual(
      (await state()).snapshot,
      before.snapshot,
      "Invalid final child rolls back earlier project writes and key changes",
    );
    await assert.rejects(
      db.query(
        "update project_csv_updates set summary='tampered' where project_id=$1",
        [project],
      ),
      /permission denied|archive/i,
    );
    await assert.rejects(
      db.query("delete from project_csv_updates where project_id=$1", [
        project,
      ]),
      /permission denied|archive/i,
    );
  });
  await db.exec("revoke insert on project_events from authenticated");
  try {
    await asRole("authenticated", owner, async () => {
      const before = await state(),
        rows = decode(exportUpdateCsv(before.snapshot));
      rows[0].notes = "Must roll back";
      const csv = serializeUpdateCsv(rows),
        plan = buildUpdatePlan(csv, before.snapshot, date);
      await assert.rejects(
        apply([
          project,
          randomUUID(),
          before.revision,
          date,
          "Rollback",
          csv,
          JSON.stringify(plan.operations),
          JSON.stringify(plan.changes),
        ]),
        /permission denied/,
      );
      assert.deepEqual((await state()).snapshot, before.snapshot);
    });
  } finally {
    await db.exec("grant insert on project_events to authenticated");
  }
  await asRole("authenticated", viewer, async () => {
    await assert.rejects(apply(applyInput), /Owner role required/);
    assert.equal(
      (
        await db.query(
          "select id from project_csv_updates where project_id=$1",
          [project],
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        "insert into project_csv_keys(project_id,key,kind,record_id) values ($1,'evil','task',$2)",
        [project, task],
      ),
      /row-level security/,
    );
  });
  await asRole("anon", null, async () => {
    await assert.rejects(
      db.query("select get_project_csv_state($1)", [project]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from project_csv_updates"),
      /permission denied/,
    );
  });
  console.log(
    "PASS: daily CSV update transaction, history/before-after retention, stable keys, idempotent retry, stale preview, cross-project rejection, event rollback and viewer/anon denial.",
  );
}

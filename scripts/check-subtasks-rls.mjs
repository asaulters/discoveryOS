import assert from "node:assert/strict";
export async function checkSubtasks(db, asRole, owner, viewer) {
  let project, workPackage, task, subtask;
  await asRole("authenticated", owner, async () => {
    project = (
      await db.query(
        "insert into projects(name) values ('Checklist security test') returning id",
      )
    ).rows[0].id;
    workPackage = (
      await db.query(
        "insert into work_packages(project_id,name,notes) values ($1,'Package with notes','Package context') returning id",
        [project],
      )
    ).rows[0].id;
    task = (
      await db.query(
        "insert into tasks(work_package_id,title,notes) values ($1,'Task with notes','Task context') returning id",
        [workPackage],
      )
    ).rows[0].id;
    subtask = (
      await db.query(
        "insert into task_subtasks(task_id,title,notes) values ($1,'Small action','Checklist context') returning id",
        [task],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select notes from work_packages where id=$1", [
          workPackage,
        ])
      ).rows[0].notes,
      "Package context",
    );
    await db.query("update task_subtasks set is_done=true where id=$1", [
      subtask,
    ]);
    assert.equal(
      (await db.query("select status from tasks where id=$1", [task])).rows[0]
        .status,
      "todo",
    );
    const events = (
      await db.query(
        "select action,entity_id,to_value from project_events where project_id=$1 order by created_at",
        [project],
      )
    ).rows;
    assert.ok(
      events.some(
        (e) =>
          e.action === "subtask_added" &&
          e.entity_id === task &&
          e.to_value.subtask.notes === "Checklist context",
      ),
    );
    assert.ok(events.some((e) => e.action === "subtask_completed"));
    await assert.rejects(
      db.query("insert into task_subtasks(task_id,title) values ($1,' ')", [
        task,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("delete from task_subtasks where id=$1", [subtask]),
      /Archive/,
    );
    await db.query("update task_subtasks set archived_at=now() where id=$1", [
      subtask,
    ]);
    await db.query(
      "update task_subtasks set archived_at=null,is_done=false where id=$1",
      [subtask],
    );
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (await db.query("select notes from task_subtasks where id=$1", [subtask]))
        .rows[0].notes,
      "Checklist context",
    );
    await assert.rejects(
      db.query(
        "insert into task_subtasks(task_id,title) values ($1,'Forbidden')",
        [task],
      ),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          "update task_subtasks set is_done=true where id=$1 returning id",
          [subtask],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query("delete from task_subtasks where id=$1 returning id", [
          subtask,
        ])
      ).rows.length,
      0,
    );
  });
  // A failed event insertion must roll the checklist mutation back too.
  await db.exec("revoke insert on project_events from authenticated");
  try {
    await asRole("authenticated", owner, async () => {
      await assert.rejects(
        db.query("update task_subtasks set is_done=true where id=$1", [
          subtask,
        ]),
        /permission denied/,
      );
      assert.equal(
        (
          await db.query("select is_done from task_subtasks where id=$1", [
            subtask,
          ])
        ).rows[0].is_done,
        false,
      );
    });
  } finally {
    await db.exec("grant insert on project_events to authenticated");
  }
  console.log(
    "PASS: optional package/task notes, checklist lifecycle, viewer read-only RLS, archive-only deletion and atomic checklist events.",
  );
}

import assert from "node:assert/strict";
export async function checkReordering(db, asRole, owner, viewer) {
  let project, packageId, taskId, subtaskId;
  await asRole("authenticated", owner, async () => {
    project = (
      await db.query(
        "insert into projects(name) values ('Reordering test') returning id",
      )
    ).rows[0].id;
    const packages = (
      await db.query(
        "insert into work_packages(project_id,name) values ($1,'First package'),($1,'Second package'),($1,'Third package') returning id",
        [project],
      )
    ).rows.map((r) => r.id);
    packageId = packages[0];
    // Equal legacy positions use the same created_at/id tie-breakers as the app.
    const cases = [["work_package", "work_packages", "project_id", project]];
    const tasks = (
      await db.query(
        "insert into tasks(work_package_id,title) values ($1,'First task'),($1,'Second task'),($1,'Third task') returning id",
        [packageId],
      )
    ).rows.map((r) => r.id);
    taskId = tasks[0];
    cases.push(["task", "tasks", "work_package_id", packageId]);
    await db.query(
      "insert into task_subtasks(task_id,title) values ($1,'First subtask'),($1,'Second subtask'),($1,'Third subtask')",
      [taskId],
    );
    cases.push(["subtask", "task_subtasks", "task_id", taskId]);
    for (const [kind, table, parent, id] of cases) {
      const ordered = async () =>
        (
          await db.query(
            `select id from ${table} where ${parent}=$1 and archived_at is null order by sort_order,created_at,id`,
            [id],
          )
        ).rows.map((r) => r.id);
      const before = await ordered();
      await db.query("select reorder_tracker_item($1,$2,'up')", [
        kind,
        before[1],
      ]);
      assert.deepEqual(await ordered(), [before[1], before[0], before[2]]);
      await db.query("select reorder_tracker_item($1,$2,'up')", [
        kind,
        before[1],
      ]);
      assert.deepEqual(
        await ordered(),
        [before[1], before[0], before[2]],
        "First item cannot move up",
      );
      await db.query("select reorder_tracker_item($1,$2,'down')", [
        kind,
        before[1],
      ]);
      assert.deepEqual(await ordered(), before);
      await db.query(`update ${table} set archived_at=now() where id=$1`, [
        before[1],
      ]);
      await db.query("select reorder_tracker_item($1,$2,'down')", [
        kind,
        before[0],
      ]);
      assert.deepEqual(
        await ordered(),
        [before[2], before[0]],
        "Archived siblings do not participate",
      );
      await db.query(`update ${table} set archived_at=null where id=$1`, [
        before[1],
      ]);
    }
    await db.query("update tasks set status='doing' where id=$1", [tasks[1]]);
    const beforeBoard = (
      await db.query(
        "select id,status from tasks where work_package_id=$1 order by sort_order,created_at,id",
        [packageId],
      )
    ).rows;
    const todos = beforeBoard
      .filter((t) => t.status === "todo")
      .map((t) => t.id);
    await db.query("select reorder_tracker_item('task',$1,'up','todo')", [
      todos[1],
    ]);
    const afterBoard = (
      await db.query(
        "select id,status from tasks where work_package_id=$1 order by sort_order,created_at,id",
        [packageId],
      )
    ).rows;
    assert.deepEqual(
      afterBoard.map((t) => t.id),
      beforeBoard.map((t) =>
        t.id === todos[0] ? todos[1] : t.id === todos[1] ? todos[0] : t.id,
      ),
    );
    assert.equal(afterBoard.find((t) => t.id === tasks[1]).status, "doing");
    await assert.rejects(
      db.query("select reorder_tracker_item('task',$1,'up','done')", [
        todos[0],
      ]),
      /no longer/,
    );
    subtaskId = (
      await db.query(
        "select id from task_subtasks where task_id=$1 order by sort_order desc,created_at desc,id desc limit 1",
        [taskId],
      )
    ).rows[0].id;
    const added = (
      await db.query(
        "insert into task_subtasks(task_id,title) values ($1,'Appended') returning id,sort_order",
        [taskId],
      )
    ).rows[0];
    assert.equal(
      (
        await db.query(
          "select id from task_subtasks where task_id=$1 order by sort_order desc,created_at desc,id desc limit 1",
          [taskId],
        )
      ).rows[0].id,
      added.id,
    );
    await assert.rejects(
      db.query("select reorder_tracker_item('task',$1,'sideways')", [taskId]),
      /Direction/,
    );
    await db.query("update projects set archived_at=now() where id=$1", [
      project,
    ]);
    await assert.rejects(
      db.query("select reorder_tracker_item('subtask',$1,'up')", [subtaskId]),
      /Restore/,
    );
    await db.query("update projects set archived_at=null where id=$1", [
      project,
    ]);
  });
  const snapshot = (
    await db.query(
      "select id,sort_order from tasks where work_package_id=$1 order by id",
      [packageId],
    )
  ).rows;
  await db.exec("revoke insert on public.project_events from authenticated");
  try {
    await asRole("authenticated", owner, async () => {
      const ids = (
        await db.query(
          "select id from tasks where work_package_id=$1 and archived_at is null order by sort_order,created_at,id",
          [packageId],
        )
      ).rows.map((r) => r.id);
      await assert.rejects(
        db.query("select reorder_tracker_item('task',$1,'up')", [ids[1]]),
        /permission denied/,
      );
      assert.deepEqual(
        (
          await db.query(
            "select id,sort_order from tasks where work_package_id=$1 order by id",
            [packageId],
          )
        ).rows,
        snapshot,
        "Failed activity writes roll back every sibling update",
      );
    });
  } finally {
    await db.exec("grant insert on public.project_events to authenticated");
  }
  await asRole("authenticated", viewer, async () => {
    for (const [kind, id] of [
      ["work_package", packageId],
      ["task", taskId],
      ["subtask", subtaskId],
    ])
      await assert.rejects(
        db.query("select reorder_tracker_item($1,$2,'up')", [kind, id]),
        /Owner role required/,
      );
    assert.equal(
      (
        await db.query(
          "update task_subtasks set sort_order=99 where id=$1 returning id",
          [subtaskId],
        )
      ).rows.length,
      0,
    );
  });
  await asRole("anon", null, async () => {
    await assert.rejects(
      db.query("select reorder_tracker_item('task',$1,'up')", [taskId]),
      /permission denied/,
    );
  });
  console.log(
    "PASS: atomic sibling reordering for all three levels, duplicate positions, boundaries, archived siblings/ancestors, append order, viewer and anonymous denial.",
  );
}

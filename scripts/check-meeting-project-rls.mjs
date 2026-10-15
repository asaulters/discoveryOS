import assert from "node:assert/strict";
import { seedDiscovery } from "./fixtures/discovery-seed.mjs";
export async function checkMeetingProject(db, asRole, owner, viewer) {
  const s = await seedDiscovery(db);
  const ref = (source_type, source_item_id, source_item_key = null) => ({
    source_type,
    source_item_id,
    source_item_key,
  });
  const batch = [
    ref("followup", s.review, "recommended_followups:0"),
    ref("workflow_gap", s.gap),
    ref("mismatch", s.mismatch),
    ref("recommendation", s.run, "applied_ai_recommendation"),
    ref("experiment", s.run, "smallest_useful_experiment"),
    ref("risk", s.review, "risks:0"),
    ref("recommendation", s.review, "build_direction"),
    ref("open_question", s.review, "open_questions:0"),
  ];
  const send = (items) =>
    db.query("select send_to_project($1,$2,$3::jsonb) as result", [
      s.meeting,
      s.project,
      JSON.stringify(items),
    ]);
  const counts = async () =>
    (
      await db.query(
        "select (select count(*) from tasks)::int tasks,(select count(*) from work_packages)::int packages,(select count(*) from raid_items)::int raid,(select count(*) from project_events)::int events",
      )
    ).rows[0];
  await asRole("authenticated", viewer, async () => {
    await assert.rejects(send(batch), /Owner role required/);
    await assert.rejects(
      db.query(
        "insert into raid_items(project_id,kind,title) values ($1,'risk','Viewer write')",
        [s.project],
      ),
      /row-level security/,
    );
  });
  let ids;
  await asRole("authenticated", owner, async () => {
    const before = await counts();
    await assert.rejects(
      send([batch[0], ref("workflow_gap", s.review)]),
      /Workflow gap not found/,
    );
    assert.deepEqual(
      await counts(),
      before,
      "Failed batch also rolls back fallback package and events",
    );
    assert.equal(
      (
        await db.query("select project_id from meetings where id=$1", [
          s.meeting,
        ])
      ).rows[0].project_id,
      null,
    );
    batch[0].title = "Edited follow-up";
    batch[0].certainty = "known";
    batch[0].evidence_quote = "Forged quote";
    batch[2].title = "Confirm timing";
    ids = (await send(batch)).rows[0].result;
    assert.equal(ids.tasks.length, 3);
    assert.equal(ids.work_packages.length, 1);
    assert.equal(ids.raid_items.length, 4);
    assert.equal(ids.has_decision, true);
    assert.equal(
      (await db.query("select stage from projects where id=$1", [s.project]))
        .rows[0].stage,
      "intake",
    );
    assert.equal(
      (
        await db.query("select project_id from meetings where id=$1", [
          s.meeting,
        ])
      ).rows[0].project_id,
      s.project,
    );
    const tasks = (
      await db.query("select * from tasks where source_meeting_id=$1", [
        s.meeting,
      ])
    ).rows;
    assert.equal(
      tasks.find((t) => t.source_type === "followup").evidence_quote,
      null,
    );
    assert.equal(
      tasks.find((t) => t.source_type === "followup").title,
      "Edited follow-up",
    );
    assert.equal(
      tasks.find((t) => t.source_type === "followup").certainty,
      "known",
    );
    assert.equal(
      tasks.find((t) => t.source_type === "workflow_gap").evidence_quote,
      "We wait when Sam is away",
    );
    const raid = (
      await db.query("select * from raid_items where source_meeting_id=$1", [
        s.meeting,
      ])
    ).rows;
    assert.equal(
      raid.find((r) => r.source_type === "mismatch").title,
      "Needs clarification: Confirm timing",
    );
    assert.equal(
      raid.find((r) => r.source_type === "mismatch").evidence_quote,
      "A: We approve daily\nB: It waits until Friday",
    );
    assert.equal(
      raid.find((r) => r.recommendation_type === "no_build").confidence,
      "medium",
    );
    assert.equal(
      raid.find((r) => r.recommendation_type === "no_build").evidence_quote,
      "It waits until Friday",
    );
    const after = await counts();
    await assert.rejects(send([batch[0]]), /duplicate key/);
    assert.deepEqual(await counts(), after);
    // A new row followed by a duplicate must also roll back everything.
    await db.query(
      "update post_meeting_reviews set open_questions=open_questions || $2::jsonb where id=$1",
      [
        s.review,
        JSON.stringify([
          { question: "New question", whyItMatters: "Check rollback" },
        ]),
      ],
    );
    await assert.rejects(
      send([ref("open_question", s.review, "open_questions:1"), batch[0]]),
      /duplicate key/,
    );
    assert.deepEqual(await counts(), after);
    // Archive frees only the source row's slot; the fallback package is reused.
    await db.query("update tasks set archived_at=now() where id=$1", [
      ids.tasks[0],
    ]);
    await send([batch[0]]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from work_packages where project_id=$1 and name='Discovery follow-ups'",
          [s.project],
        )
      ).rows[0].n,
      1,
    );
    await db.query("update raid_items set status='resolved' where id=$1", [
      ids.raid_items[0],
    ]);
    assert.ok(
      (
        await db.query("select resolved_at from raid_items where id=$1", [
          ids.raid_items[0],
        ])
      ).rows[0].resolved_at,
    );
    await db.query("update raid_items set status='open' where id=$1", [
      ids.raid_items[0],
    ]);
    assert.equal(
      (
        await db.query("select resolved_at from raid_items where id=$1", [
          ids.raid_items[0],
        ])
      ).rows[0].resolved_at,
      null,
    );
  });
  await asRole("authenticated", viewer, async () => {
    assert.equal(
      (
        await db.query("select * from raid_items where project_id=$1", [
          s.project,
        ])
      ).rows.length,
      4,
    );
    assert.equal(
      (
        await db.query(
          "update raid_items set status='resolved' where id=$1 returning id",
          [ids.raid_items[0]],
        )
      ).rows.length,
      0,
    );
  });
  await asRole("authenticated", owner, async () => {
    await db.query("delete from meetings where id=$1", [s.meeting]);
    for (const table of ["tasks", "work_packages", "raid_items"]) {
      const rows = (
        await db.query(
          `select * from ${table} where source_item_id in ($1,$2,$3,$4)`,
          [s.review, s.gap, s.mismatch, s.run],
        )
      ).rows;
      assert.ok(rows.length);
      assert.ok(
        rows.every((r) => r.source_meeting_id === null && r.source_type),
      );
    }
    assert.equal(
      (
        await db.query("select evidence_quote from raid_items where id=$1", [
          ids.raid_items[1],
        ])
      ).rows[0].evidence_quote,
      "It waits until Friday",
    );
  });
  assert.equal(
    (
      await db.query(
        "select prosecdef from pg_proc where oid='send_to_project(uuid,uuid,jsonb,uuid)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  console.log(
    "PASS: send RPC owner boundary, all source mappings, evidence copies, global deduplication, atomic rollback, fallback reuse, RAID transitions and deleted-meeting survival.",
  );
}

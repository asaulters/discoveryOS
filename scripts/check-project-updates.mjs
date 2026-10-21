import assert from "node:assert/strict";
import { importModules } from "./fixtures/import-module.mjs";
const {
  buildUpdatePlan: plan,
  serializeUpdateCsv: csv,
  exportUpdateCsv,
  readCsv,
} = await importModules();
const p = "10000000-0000-4000-8000-000000000001",
  w = "10000000-0000-4000-8000-000000000002",
  t = "10000000-0000-4000-8000-000000000003",
  s = "10000000-0000-4000-8000-000000000004";
export const snapshot = {
  projects: [
    {
      id: p,
      name: "Daily project",
      notes: "Current context",
      stage: "build",
      health: "on_track",
      archived_at: null,
    },
  ],
  workPackages: [
    {
      id: w,
      project_id: p,
      name: "Delivery",
      notes: null,
      status: "todo",
      sort_order: 3,
      archived_at: null,
    },
  ],
  tasks: [
    {
      id: t,
      work_package_id: w,
      title: "First task",
      notes: "Keep this note",
      status: "doing",
      size: "m",
      sort_order: 4,
      due_date: "2026-10-30",
      blocked_reason: null,
      archived_at: null,
    },
  ],
  subtasks: [
    {
      id: s,
      task_id: t,
      title: "Check",
      notes: null,
      is_done: true,
      sort_order: 0,
      archived_at: null,
    },
  ],
  keys: [],
};
const rows = [
  {
    type: "project",
    key: "p1",
    parent_key: "",
    name: "Daily project",
    report_date: "2026-10-21",
    update_summary: "Daily progress",
  },
  { type: "work_package", key: "wp1", parent_key: "p1", name: "Delivery" },
  {
    type: "task",
    key: "t1",
    parent_key: "wp1",
    name: "First task",
    status: "done",
    progress_note: "Build passed",
  },
  {
    type: "subtask",
    key: "s1",
    parent_key: "t1",
    name: "Check",
    is_done: "false",
  },
];
const result = plan(csv(rows), snapshot, "2026-10-20");
assert.equal(result.reportDate, "2026-10-21");
assert.deepEqual(result.counts, { create: 0, update: 2, unchanged: 2 });
assert.equal(
  result.operations[2].data.notes,
  "Keep this note\n[2026-10-21] Build passed",
);
assert.equal(
  result.operations[2].data.due_date,
  undefined,
  "Blank values do not clear fields",
);
assert.equal(
  result.operations[2].data.sort_order,
  undefined,
  "Omitted ordering stays unchanged",
);
assert.equal(result.operations[3].data.is_done, false);
assert.equal(result.changes[0].matched_by, "exact name and parent");
const bound = structuredClone(snapshot);
bound.keys = result.operations.map((o) => ({
  key: o.key,
  kind: o.kind,
  record_id: o.id,
}));
const renamed = structuredClone(rows);
renamed[2].name = "Renamed task";
assert.equal(plan(csv(renamed), bound, "2026-10-21").operations[2].id, t);
assert.equal(
  plan(
    csv(renamed.map((r, i) => ({ ...r, record_id: [p, w, t, s][i] }))),
    snapshot,
    "2026-10-21",
  ).operations[2].id,
  t,
);
const second = structuredClone(bound);
second.tasks[0].notes = result.operations[2].data.notes;
assert.equal(
  plan(csv(rows), second, "2026-10-21").operations[2].data.notes,
  second.tasks[0].notes,
  "Repeated daily progress lines are not duplicated",
);
const clearing = structuredClone(rows);
clearing[2].clear_fields = "due_date;notes";
delete clearing[2].progress_note;
assert.equal(
  plan(csv(clearing), snapshot, "2026-10-21").operations[2].data.due_date,
  null,
);
const create = structuredClone(rows);
create.push({
  type: "task",
  key: "t_new",
  parent_key: "wp1",
  name: "New action",
  action: "create",
});
assert.equal(plan(csv(create), snapshot, "2026-10-21").counts.create, 1);
assert.equal(
  plan(csv([rows[0]]), snapshot, "2026-10-21").operations.length,
  1,
  "Omitted rows are preserved",
);
const exported = exportUpdateCsv(bound),
  roundtrip = plan(exported, bound, "2026-10-21");
assert.equal(roundtrip.counts.update, 0);
assert.equal(roundtrip.counts.create, 0);
assert.match(exported, /record_id/);
assert.equal(readCsv(exported).length, 5);
const variations = [
  [
    (r) => {
      r[2].name = "Typo creates nothing";
    },
    /no matching record/,
  ],
  [
    (r) => {
      r[0].name = "Another project";
    },
    /current project/,
  ],
  [
    (r) => {
      r[2].parent_key = "p1";
    },
    /parent_key/,
  ],
  [
    (r) => {
      r[2].record_id = "20000000-0000-4000-8000-000000000001";
    },
    /does not belong/,
  ],
  [
    (r) => {
      r[2].clear_fields = "status";
    },
    /cannot clear/,
  ],
  [
    (r) => {
      r[2].due_date = "2026-10-30";
      r[2].clear_fields = "due_date";
    },
    /both a value/,
  ],
  [
    (r) => {
      r[2].status = "blocked";
    },
    /blocked_reason/,
  ],
  [
    (r) => {
      r[0].status = "done";
    },
    /does not apply/,
  ],
  [
    (r) => {
      r[2].is_done = "yes";
    },
    /does not apply/,
  ],
  [
    (r) => {
      r[3].is_done = "yes";
    },
    /true or false/,
  ],
  [
    (r) => {
      r[2].due_date = "10\/11\/2026";
    },
    /due_date/,
  ],
  [
    (r) => {
      r[2].sort_order = "1.5";
    },
    /integer/,
  ],
  [
    (r) => {
      r[3].key = "t1";
    },
    /duplicate key/,
  ],
  [
    (r) => {
      r[3].record_id = t;
    },
    /does not belong/,
  ],
  [
    (r) => {
      r[0].report_date = "2026-02-30";
    },
    /date/,
  ],
];
for (const [mutate, error] of variations) {
  const input = structuredClone(rows);
  mutate(input);
  assert.throws(() => plan(csv(input), snapshot, "2026-10-21"), error);
}
const ambiguous = structuredClone(snapshot);
ambiguous.tasks.push({
  ...ambiguous.tasks[0],
  id: "10000000-0000-4000-8000-000000000005",
});
assert.throws(() => plan(csv(rows), ambiguous, "2026-10-21"), /ambiguous/);
const archived = structuredClone(snapshot);
archived.tasks[0].archived_at = "2026-10-20";
assert.throws(() => plan(csv(rows), archived, "2026-10-21"), /archived/);
const multiline = structuredClone(rows);
multiline[2].notes = 'Context, with commas\nand "quotes"';
assert.equal(
  plan(csv(multiline), snapshot, "2026-10-21").operations[2].data.notes,
  'Context, with commas\nand "quotes"\n[2026-10-21] Build passed',
);
console.log(
  "PASS: daily update identity matching, explicit creation, blank/omitted preservation, clear instructions, progress dedupe, export round trip, wrong-project/parent/ambiguous/archive rejection and row validation.",
);

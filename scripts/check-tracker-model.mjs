import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync("lib/tracker/model.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
const { weekTasks, weekWindow, groupByDay, progress } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const now = new Date(2026, 9, 15, 12); // Thursday, local calendar dates.
const window = weekWindow(now);
assert.equal(window.today, "2026-10-15");
assert.equal(window.upcomingEnd, "2026-10-21");
assert.equal(window.start.getDay(), 1);
assert.equal(window.start.getDate(), 12);
assert.equal(window.end.getDate(), 19);
const base = {
  id: "t",
  work_package_id: "w",
  title: "Task",
  status: "todo",
  due_date: null,
  completed_at: null,
  archived_at: null,
  sort_order: 0,
};
const task = (id, patch) => ({ ...base, id, ...patch });
const data = {
  projects: [
    { id: "p", name: "Project", archived_at: null },
    { id: "archived-p", archived_at: "2026-10-01" },
  ],
  workPackages: [
    { id: "w", project_id: "p", archived_at: null },
    { id: "archived-w", project_id: "p", archived_at: "2026-10-01" },
    { id: "hidden-w", project_id: "archived-p", archived_at: null },
  ],
  tasks: [
    task("overdue", { due_date: "2026-10-01" }),
    task("today", { due_date: "2026-10-15" }),
    task("last-upcoming", { due_date: "2026-10-21" }),
    task("outside", { due_date: "2026-10-22" }),
    task("no-date-todo", {}),
    task("doing", { status: "doing" }),
    task("blocked", { status: "blocked", due_date: "2026-10-30" }),
    task("completed-this-week", {
      status: "done",
      completed_at: new Date(2026, 9, 12, 0).toISOString(),
    }),
    task("completed-last-week", {
      status: "done",
      completed_at: new Date(2026, 9, 11, 23, 59).toISOString(),
    }),
    task("completed-next-week", {
      status: "done",
      completed_at: new Date(2026, 9, 19, 0).toISOString(),
    }),
    task("archived-task", { status: "doing", archived_at: "2026-10-01" }),
    task("archived-package", {
      status: "doing",
      work_package_id: "archived-w",
    }),
    task("archived-project", { status: "doing", work_package_id: "hidden-w" }),
  ],
  events: [],
};
const result = weekTasks(data, now);
const includingArchived = weekTasks(data, now, true).open.map(
  (row) => row.task.id,
);
for (const id of ["archived-task", "archived-package", "archived-project"])
  assert.ok(includingArchived.includes(id));
assert.deepEqual(
  result.open.map((r) => r.task.id).sort(),
  ["overdue", "today", "last-upcoming", "doing", "blocked"].sort(),
);
assert.deepEqual(
  result.completed.map((r) => r.task.id),
  ["completed-this-week"],
);
const groups = groupByDay(result.open, now);
assert.equal(groups[0][0], "Overdue");
assert.equal(groups.at(-1)[0], "No date");
assert.equal(groups.flatMap(([, rows]) => rows).length, result.open.length);
assert.deepEqual(
  groups.find(([name]) => name === "No date")[1].map((r) => r.task.id),
  ["doing"],
);
const byProject = new Map();
for (const row of result.open)
  byProject.set(row.project.id, [
    ...(byProject.get(row.project.id) ?? []),
    row,
  ]);
assert.equal([...byProject.values()].flat().length, result.open.length);
assert.deepEqual(
  progress([
    task("a", { status: "done" }),
    task("b", { status: "blocked" }),
    task("c", { archived_at: "2026-10-01" }),
  ]),
  { total: 2, done: 1, blocked: 1 },
);
// Sunday and month/year boundaries use calendar arithmetic, not fixed ms.
assert.equal(weekWindow(new Date(2026, 11, 31, 12)).upcomingEnd, "2027-01-06");
assert.equal(weekWindow(new Date(2026, 9, 18, 12)).start.getDate(), 12);
console.log(
  "PASS: upcoming/overdue/doing/blocked selection, calendar-week completion, archived ancestors, progress and grouping consistency.",
);

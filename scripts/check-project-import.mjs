import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importModules } from "./fixtures/import-module.mjs";
const {
  parseProjectCsv: parse,
  readCsv,
  PROJECT_CSV_TEMPLATE: template,
} = await importModules();
assert.deepEqual(parse(template).counts, {
  project: 1,
  work_package: 1,
  task: 1,
  subtask: 2,
});
assert.equal(
  readFileSync("docs/project-import-template.csv", "utf8"),
  template,
  "Downloadable documented template must match the app template",
);
const quoted =
  '\uFEFFtype,key,parent_key,name,notes\r\nproject,p1,,"A, B","First line\nSecond ""quoted"" line"\r\nwork_package,w1,p1,Delivery,\r\ntask,t1,w1,Do it,\r\nsubtask,s1,t1,Check it,\r\n';
assert.equal(
  parse(quoted).rows[0].data.notes,
  'First line\nSecond "quoted" line',
);
assert.equal(parse(quoted).projectName, "A, B");
// Parent rows may follow their children.
const shuffled =
  "type,key,parent_key,name\nsubtask,s,t,Check\ntask,t,w,Task\nwork_package,w,p,Package\nproject,p,,Project";
assert.equal(parse(shuffled).rows.length, 4);
for (const [csv, pattern] of [
  [
    "type,key,parent_key,name\nproject,p,,Project\ntask,t,missing,Task",
    /parent_key/,
  ],
  ["type,key,parent_key,name\nproject,p,,A\nproject,p2,,B", /exactly one/],
  [
    "type,key,parent_key,name\nproject,p,,Project\nwork_package,p,p,Package",
    /duplicate key/,
  ],
  [
    "type,key,parent_key,name\nproject,p,,Project\nsubtask,s,p,Subtask",
    /parent_key/,
  ],
  [
    "type,key,parent_key,name,status\nproject,p,,Project,done",
    /does not apply/,
  ],
  ['type,key,parent_key,name\nproject,p,,"Unclosed', /not closed/],
  ['type,key,parent_key,name\nproject,p,,"Closed"tail', /quoting/],
  ["type,key,parent_key,name,wat\nproject,p,,Project,", /Unknown column/],
  ["type,key,parent_key,name,name\nproject,p,,Project,Other", /Duplicate CSV/],
  ["type,key,name\nproject,p,Project", /Missing required/],
  [
    "type,key,parent_key,name,target_date\nproject,p,,Project,2026-02-30",
    /Line 2/,
  ],
  [
    "type,key,parent_key,name,status\nproject,p,,Project,\nwork_package,w,p,Package,\ntask,t,w,Task,blocked",
    /blocked_reason/,
  ],
  [
    "type,key,parent_key,name,is_done\nproject,p,,Project,\nwork_package,w,p,Package,\ntask,t,w,Task,\nsubtask,s,t,Subtask,yes",
    /true or false/,
  ],
  [
    "type,key,parent_key,name,sort_order\nproject,p,,Project,\nwork_package,w,p,Package,1.5",
    /whole number/,
  ],
  ["type,key,parent_key,name\nproject,p,,Project,extra", /columns/],
])
  assert.throws(() => parse(csv), pattern);
assert.throws(() => readCsv("x".repeat(2 * 1024 * 1024 + 1)), /2 MB/);
assert.throws(
  () =>
    parse(
      "type,key,parent_key,name\nproject,p,,Project\n" +
        Array.from(
          { length: 2000 },
          (_, i) => `work_package,w${i},p,Package`,
        ).join("\n"),
    ),
  /2000 data rows/,
);
assert.equal(
  parse(template).rows.find((r) => r.type === "task").data.status,
  "todo",
);
console.log(
  "PASS: CSV template, BOM/CRLF, quoted commas/newlines/escaped quotes, arbitrary row order, hierarchy, duplicate keys, row-specific validation, dates, blocked reasons and size/row limits.",
);

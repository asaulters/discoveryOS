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

const { suggestMapping, formatProjectCsv, checkFormattedCsv, writeProjectCsv } =
  await importModules();
const messy =
  "Item Type,ID,Parent ID,Title,Order,Status,Size,Done,Extra\nProject,p,,Project,0,Done,,,keep this\nWork Package,w,p,Package,1,Not started,,,\nTask,t,w,Task,2,In progress,Small,,\nSub-task,s,t,Check,0,,,Yes,\n";
const mapping = suggestMapping(readCsv(messy)[0].cells);
const formatted = formatProjectCsv(messy, mapping);
assert.deepEqual(parse(formatted.csv).counts, {
  project: 1,
  work_package: 1,
  task: 1,
  subtask: 1,
});
assert.equal(parse(formatted.csv).rows[0].data.sort_order, undefined);
assert.equal(parse(formatted.csv).rows[2].data.status, "doing");
assert.equal(parse(formatted.csv).rows[3].data.is_done, true);
assert(
  formatted.changes.some(
    (c) =>
      c.field === "sort_order" &&
      c.line === 2 &&
      c.before === "0" &&
      c.after === "",
  ),
);
assert(
  formatted.changes.some(
    (c) =>
      c.field === "Extra" &&
      c.before === "keep this" &&
      c.reason === "Ignored source column",
  ),
);
assert.equal(checkFormattedCsv(formatted.csv).length, 0);
assert.deepEqual(
  formatProjectCsv(template, suggestMapping(readCsv(template)[0].cells))
    .changes,
  [],
);
assert.throws(
  () =>
    formatProjectCsv(
      messy,
      mapping.map(() => "name"),
    ),
  /only once/,
);
assert.throws(
  () =>
    formatProjectCsv(
      messy,
      mapping.map(() => ""),
    ),
  /Map a source column/,
);
assert.throws(
  () => formatProjectCsv(messy + "task,too,few", mapping),
  /expected.*columns/,
);
assert.throws(
  () =>
    formatProjectCsv('type,key,parent_key,name\nproject,p,,"open', [
      "type",
      "key",
      "parent_key",
      "name",
    ]),
  /not closed/,
);
assert.match(
  checkFormattedCsv(formatted.csv.replace("task,t,w,", "task,t,missing,"))[0],
  /parent_key/,
);
const multiline = writeProjectCsv([
  { type: "project", key: "p", name: "A, B", notes: 'line 1\nline 2 "quoted"' },
]);
assert.equal(parse(multiline).rows[0].data.notes, 'line 1\nline 2 "quoted"');
const invalidDate = writeProjectCsv([
  { type: "project", key: "p", name: "Dates", target_date: "10/11/2026" },
]);
assert.match(
  checkFormattedCsv(
    formatProjectCsv(invalidDate, suggestMapping(readCsv(invalidDate)[0].cells))
      .csv,
  )[0],
  /target_date/,
);
console.log(
  "PASS: formatter mapping, explicit removal reports, type/status/size/checkbox normalization, editable hierarchy validation, ambiguous date rejection and multiline CSV round trip.",
);

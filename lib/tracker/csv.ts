import { z } from "zod";
import {
  projectCreate,
  packageCreate,
  taskCreate,
  subtaskCreate,
} from "./validation";
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const CSV_COLUMNS = [
  "type",
  "key",
  "parent_key",
  "name",
  "notes",
  "status",
  "due_date",
  "target_date",
  "blocked_reason",
  "size",
  "sort_order",
  "acceptance_criteria",
  "requesting_team",
  "sponsor",
  "goal",
  "stage",
  "health",
  "definition_of_done",
  "is_done",
] as const;
export type ImportType = "project" | "work_package" | "task" | "subtask";
export interface ImportRow {
  type: ImportType;
  key: string;
  parent_key: string | null;
  data: Record<string, string | number | boolean | null>;
  line: number;
}
export const CSV_FIELDS_BY_TYPE: Record<ImportType, string[]> = {
  project: [
    "name",
    "notes",
    "requesting_team",
    "sponsor",
    "goal",
    "stage",
    "health",
    "target_date",
    "definition_of_done",
  ],
  work_package: [
    "name",
    "notes",
    "status",
    "target_date",
    "sort_order",
    "acceptance_criteria",
  ],
  task: [
    "name",
    "notes",
    "status",
    "due_date",
    "blocked_reason",
    "size",
    "sort_order",
  ],
  subtask: ["name", "notes", "is_done"],
};
const subtaskSchema = subtaskCreate
  .omit({ task_id: true })
  .extend({ is_done: z.boolean().optional() });
const schemas = {
  project: projectCreate,
  work_package: packageCreate.omit({ project_id: true }),
  task: taskCreate.omit({ work_package_id: true }),
  subtask: subtaskSchema,
};
// Quoted commas/newlines, CRLF, UTF-8 BOM and doubled quotes are supported.
export function readCsv(csv: string): { cells: string[]; line: number }[] {
  if (new TextEncoder().encode(csv).length > MAX_IMPORT_BYTES)
    throw new Error("CSV must be 2 MB or smaller");
  csv = csv.replace(/^\uFEFF/, "");
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [],
    value = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const field = () => {
    cells.push(value);
    value = "";
    closed = false;
  };
  const row = () => {
    field();
    if (cells.some((c) => c.trim())) rows.push({ cells, line: start });
    cells = [];
    if (rows.length > MAX_IMPORT_ROWS + 1)
      throw new Error(`CSV supports at most ${MAX_IMPORT_ROWS} data rows`);
  };
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += ch;
        if (ch === "\n") line++;
      }
    } else if (ch === ",") field();
    else if (ch === "\n" || ch === "\r") {
      row();
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      line++;
      start = line;
    } else if (ch === '"' && !value && !closed) quoted = true;
    else {
      if (closed || ch === '"')
        throw new Error(`Line ${line}: invalid CSV quoting`);
      value += ch;
    }
  }
  if (quoted) throw new Error(`Line ${start}: quoted field is not closed`);
  if (cells.length || value || closed) row();
  return rows;
}
export function parseProjectCsv(csv: string) {
  const records = readCsv(csv),
    header = records.shift()?.cells.map((c) => c.trim());
  if (!header?.length)
    throw new Error("Choose a CSV with a header and project rows");
  if (new Set(header).size !== header.length)
    throw new Error("Duplicate CSV column headings");
  for (const h of header)
    if (!(CSV_COLUMNS as readonly string[]).includes(h))
      throw new Error(`Unknown column: ${h}`);
  for (const h of ["type", "key", "parent_key", "name"])
    if (!header.includes(h)) throw new Error(`Missing required column: ${h}`);
  const rows: ImportRow[] = [],
    keys = new Set<string>();
  for (const r of records) {
    if (r.cells.length !== header.length)
      throw new Error(
        `Line ${r.line}: expected ${header.length} columns, found ${r.cells.length}`,
      );
    const values = Object.fromEntries(
        header.map((h, i) => [h, r.cells[i].trim()]),
      ),
      type = values.type as ImportType;
    if (!Object.hasOwn(CSV_FIELDS_BY_TYPE, type))
      throw new Error(
        `Line ${r.line}: type must be project, work_package, task or subtask`,
      );
    const key = values.key,
      parent_key = values.parent_key || null;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(key))
      throw new Error(
        `Line ${r.line}: key must be 1–64 letters, numbers, underscores or hyphens`,
      );
    if (keys.has(key)) throw new Error(`Line ${r.line}: duplicate key ${key}`);
    keys.add(key);
    const data: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      if (["type", "key", "parent_key"].includes(field) || !value) continue;
      if (!CSV_FIELDS_BY_TYPE[type].includes(field))
        throw new Error(`Line ${r.line}: ${field} does not apply to ${type}`);
      if (field === "sort_order") {
        if (!/^\d+$/.test(value))
          throw new Error(
            `Line ${r.line}: sort_order must be a nonnegative whole number`,
          );
        data[field] = Number(value);
      } else if (field === "is_done") {
        if (!["true", "false"].includes(value))
          throw new Error(`Line ${r.line}: is_done must be true or false`);
        data[field] = value === "true";
      } else
        data[
          field === "name" && ["task", "subtask"].includes(type)
            ? "title"
            : field
        ] = value;
    }
    const parsed = schemas[type].safeParse(data);
    if (!parsed.success)
      throw new Error(
        `Line ${r.line}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    if (type === "task" && data.status === "blocked" && !data.blocked_reason)
      throw new Error(`Line ${r.line}: blocked task needs blocked_reason`);
    rows.push({ type, key, parent_key, data: parsed.data, line: r.line });
  }
  if (rows.filter((r) => r.type === "project").length !== 1)
    throw new Error("CSV must contain exactly one project row");
  const byKey = new Map(rows.map((r) => [r.key, r])),
    parentTypes: Record<string, string> = {
      work_package: "project",
      task: "work_package",
      subtask: "task",
    };
  for (const r of rows) {
    if (r.type === "project") {
      if (r.parent_key)
        throw new Error(
          `Line ${r.line}: project must have an empty parent_key`,
        );
    } else if (
      !r.parent_key ||
      byKey.get(r.parent_key)?.type !== parentTypes[r.type]
    )
      throw new Error(
        `Line ${r.line}: ${r.type} parent_key must reference a ${parentTypes[r.type]} row`,
      );
  }
  const counts = Object.fromEntries(
    Object.keys(CSV_FIELDS_BY_TYPE).map((t) => [
      t,
      rows.filter((r) => r.type === t).length,
    ]),
  ) as Record<ImportType, number>;
  return {
    rows,
    counts,
    projectName: rows.find((r) => r.type === "project")!.data.name as string,
  };
}

import { z } from "zod";
import {
  CSV_COLUMNS,
  CSV_FIELDS_BY_TYPE,
  MAX_IMPORT_ROWS,
  readCsv,
  type ImportType,
} from "./csv";
import {
  projectPatch,
  packagePatch,
  taskPatch,
  subtaskPatch,
} from "./validation";

export const UPDATE_COLUMNS = [
  ...CSV_COLUMNS,
  "record_id",
  "action",
  "clear_fields",
  "report_date",
  "update_summary",
  "progress_note",
] as const;
export interface UpdateRecord extends Record<string, unknown> {
  id: string;
  archived_at: string | null;
}
export interface CsvKey {
  key: string;
  kind: ImportType;
  record_id: string;
}
export interface UpdateSnapshot {
  projects: UpdateRecord[];
  workPackages: UpdateRecord[];
  tasks: UpdateRecord[];
  subtasks: UpdateRecord[];
  keys: CsvKey[];
}
export interface UpdateOperation {
  kind: ImportType;
  key: string;
  id: string;
  parent_id: string | null;
  parent_key: string | null;
  is_new: boolean;
  data: Record<string, unknown>;
}
export interface UpdateChange {
  key: string;
  kind: ImportType;
  name: string;
  action: "create" | "update" | "unchanged";
  fields: { field: string; before: unknown; after: unknown }[];
  matched_by: string;
}
const schemas = {
  project: projectPatch.omit({ archived: true }),
  work_package: packagePatch.omit({ archived: true }),
  task: taskPatch.omit({ archived: true }),
  subtask: subtaskPatch
    .omit({ archived: true })
    .extend({ sort_order: z.number().int().min(0).max(1000000).optional() }),
};
const parentFields = {
  work_package: "project_id",
  task: "work_package_id",
  subtask: "task_id",
};
const parentTypes = {
  work_package: "project",
  task: "work_package",
  subtask: "task",
};
const nullable = new Set([
  "notes",
  "due_date",
  "target_date",
  "blocked_reason",
  "size",
  "acceptance_criteria",
  "requesting_team",
  "sponsor",
  "goal",
  "definition_of_done",
]);
const keyPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export function snapshotRows(
  snapshot: UpdateSnapshot,
): Record<ImportType, UpdateRecord[]> {
  return {
    project: snapshot.projects,
    work_package: snapshot.workPackages,
    task: snapshot.tasks,
    subtask: snapshot.subtasks,
  };
}
export function serializeUpdateCsv(rows: Record<string, string>[]) {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return (
    [
      UPDATE_COLUMNS.join(","),
      ...rows.map((row) =>
        UPDATE_COLUMNS.map((c) => escape(row[c] || "")).join(","),
      ),
    ].join("\n") + "\n"
  );
}
export function exportUpdateCsv(snapshot: UpdateSnapshot) {
  const groups = snapshotRows(snapshot),
    keys = new Map(snapshot.keys.map((k) => [k.record_id, k.key]));
  for (const [kind, rows] of Object.entries(groups))
    for (const row of rows)
      if (!keys.has(row.id))
        keys.set(row.id, `${kind}_${row.id.replaceAll("-", "")}`);
  const rows: Record<string, string>[] = [];
  for (const kind of ["project", "work_package", "task", "subtask"] as const) {
    const ordered = [...groups[kind]].sort(
      (a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.created_at).localeCompare(String(b.created_at)) ||
        a.id.localeCompare(b.id),
    );
    for (const record of ordered.filter((r) => !r.archived_at)) {
      const row: Record<string, string> = {
        type: kind,
        key: keys.get(record.id)!,
        record_id: record.id,
        action: "update",
        parent_key:
          kind === "project"
            ? ""
            : keys.get(String(record[parentFields[kind]]))!,
      };
      const fields =
        kind === "subtask"
          ? [...CSV_FIELDS_BY_TYPE[kind], "sort_order"]
          : CSV_FIELDS_BY_TYPE[kind];
      for (const field of fields) {
        const value =
          record[
            field === "name" && ["task", "subtask"].includes(kind)
              ? "title"
              : field
          ];
        row[field] = value === null || value === undefined ? "" : String(value);
      }
      // An archived ancestor hides its descendants from the daily baseline.
      if (kind !== "project" && !rows.some((r) => r.key === row.parent_key))
        continue;
      rows.push(row);
    }
  }
  return serializeUpdateCsv(rows);
}
export function buildUpdatePlan(
  csv: string,
  snapshot: UpdateSnapshot,
  fallbackDate: string,
  newId: () => string = () => crypto.randomUUID(),
) {
  z.iso.date().parse(fallbackDate);
  const records = readCsv(csv),
    headers = records.shift()?.cells.map((c) => c.trim());
  if (!headers?.length)
    throw Error("Choose a CSV with a header and project rows");
  if (new Set(headers).size !== headers.length)
    throw Error("Duplicate CSV headings");
  for (const h of headers)
    if (!(UPDATE_COLUMNS as readonly string[]).includes(h))
      throw Error(`Unknown update column: ${h}`);
  for (const h of ["type", "key", "parent_key", "name"])
    if (!headers.includes(h)) throw Error(`Missing required column: ${h}`);
  if (!records.length || records.length > MAX_IMPORT_ROWS)
    throw Error("Update supports 1–2,000 rows");
  const inputs = records.map((r) => {
    if (r.cells.length !== headers.length)
      throw Error(
        `Line ${r.line}: expected ${headers.length} columns, found ${r.cells.length}`,
      );
    return {
      line: r.line,
      values: Object.fromEntries(headers.map((h, i) => [h, r.cells[i].trim()])),
    };
  });
  const seen = new Set<string>();
  for (const { line, values: v } of inputs) {
    if (!Object.hasOwn(groupsPrototype(), v.type))
      throw Error(`Line ${line}: invalid row type`);
    if (!keyPattern.test(v.key) || seen.has(v.key))
      throw Error(`Line ${line}: invalid or duplicate key ${v.key}`);
    seen.add(v.key);
  }
  const roots = inputs.filter((r) => r.values.type === "project");
  if (roots.length !== 1 || roots[0].values.parent_key)
    throw Error("Include exactly one project row with an empty parent_key");
  const root = roots[0].values;
  const reportDate = root.report_date || fallbackDate;
  z.iso.date().parse(reportDate);
  const summary = root.update_summary || "";
  if (summary.length > 20000)
    throw Error("Update summary must be at most 20,000 characters");
  const groups = snapshotRows(snapshot),
    bindings = new Map(snapshot.keys.map((k) => [k.key, k]));
  const usedIds = new Set<string>(),
    resolved = new Map<string, UpdateOperation>(),
    operations: UpdateOperation[] = [],
    changes: UpdateChange[] = [];
  const rank = ["project", "work_package", "task", "subtask"];
  for (const { line, values: v } of [...inputs].sort(
    (a, b) => rank.indexOf(a.values.type) - rank.indexOf(b.values.type),
  )) {
    const kind = v.type as ImportType,
      fail = (message: string): never => {
        throw Error(`Line ${line} (${v.key}): ${message}`);
      };
    if (v.action && !["update", "create"].includes(v.action))
      fail("action must be update or create");
    if (kind === "project" && v.action === "create")
      fail("project action must be update");
    if (kind !== "project" && (v.report_date || v.update_summary))
      fail("report_date and update_summary belong only on the project row");
    const parent = kind === "project" ? null : resolved.get(v.parent_key);
    if (kind !== "project" && (!parent || parent.kind !== parentTypes[kind]))
      fail(
        `parent_key must reference a ${parentTypes[kind]} row included in this CSV`,
      );
    const binding = bindings.get(v.key);
    if (binding && binding.kind !== kind)
      fail("key is already bound to a different row type");
    if (v.record_id && !z.uuid().safeParse(v.record_id).success)
      fail(
        "record_id must be a DOS UUID; leave it blank only for baseline matching or new items",
      );
    if (binding && v.record_id && binding.record_id !== v.record_id)
      fail(
        "record_id conflicts with the saved key; keep the original identity",
      );
    const id = v.record_id || binding?.record_id;
    let existing = id ? groups[kind].find((r) => r.id === id) : undefined;
    let matchedBy = id
      ? v.record_id
        ? "record ID"
        : "saved key"
      : "exact name and parent";
    if (id && !existing)
      fail("record_id/key does not belong to this project and row type");
    if (!existing) {
      const candidates = groups[kind].filter(
        (r) =>
          String(
            r[kind === "task" || kind === "subtask" ? "title" : "name"],
          ) === v.name &&
          (kind === "project" || r[parentFields[kind]] === parent?.id),
      );
      if (candidates.length > 1)
        fail(
          "name is ambiguous; download the DOS baseline and use its record_id",
        );
      existing = candidates[0];
    }
    if (existing) {
      if (v.action === "create" && !id)
        fail(
          "new item has the same name and parent as an existing record; use its record_id or choose a distinct name",
        );
      if (existing.archived_at)
        fail("record is archived; restore it in DOS first");
      if (kind !== "project" && existing[parentFields[kind]] !== parent?.id)
        fail("moving items to another parent is not supported by CSV updates");
      const other = snapshot.keys.find(
        (k) => k.record_id === existing!.id && k.key !== v.key,
      );
      if (other)
        fail(`record already has saved key ${other.key}; keep that key`);
    } else {
      if (kind === "project")
        fail(
          "this file does not match the current project; use its DOS baseline/record_id",
        );
      if (v.action !== "create")
        fail(
          "no matching record; use the DOS baseline or set action=create explicitly for a new item",
        );
      matchedBy = "explicit create";
    }
    const recordId = existing?.id || newId();
    if (usedIds.has(recordId))
      fail("multiple keys refer to the same DOS record");
    usedIds.add(recordId);
    const allowed =
      kind === "subtask"
        ? [...CSV_FIELDS_BY_TYPE[kind], "sort_order"]
        : CSV_FIELDS_BY_TYPE[kind];
    const data: Record<string, unknown> = {};
    const fieldName = (field: string) =>
      field === "name" && ["task", "subtask"].includes(kind) ? "title" : field;
    for (const field of CSV_COLUMNS) {
      const value = v[field];
      if (["type", "key", "parent_key"].includes(field) || !value) continue;
      if (!allowed.includes(field)) fail(`${field} does not apply to ${kind}`);
      if (field === "sort_order") {
        if (!/^\d+$/.test(value))
          fail("sort_order must be a nonnegative integer");
        data[field] = Number(value);
      } else if (field === "is_done") {
        if (!["true", "false"].includes(value))
          fail("is_done must be true or false");
        data[field] = value === "true";
      } else data[fieldName(field)] = value;
    }
    for (const field of (v.clear_fields || "")
      .split(";")
      .map((f) => f.trim())
      .filter(Boolean)) {
      if (!nullable.has(field) || !allowed.includes(field))
        fail(`cannot clear ${field}`);
      if (v[field])
        fail(`${field} cannot have both a value and a clear instruction`);
      data[fieldName(field)] = null;
    }
    if (v.progress_note) {
      const progress = `[${reportDate}] ${v.progress_note}`;
      const notes = String(data.notes ?? existing?.notes ?? "");
      data.notes = `\n${notes}\n`.includes(`\n${progress}\n`)
        ? notes
        : [notes, progress].filter(Boolean).join("\n");
    }
    const parsed = schemas[kind].safeParse(data);
    if (!parsed.success)
      fail(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
    const patch = parsed.success ? parsed.data : {};
    const merged: Record<string, unknown> = { ...existing, ...patch };
    if (
      !String(
        merged[kind === "task" || kind === "subtask" ? "title" : "name"] || "",
      ).trim()
    )
      fail("name is required");
    if (
      kind === "task" &&
      merged.status === "blocked" &&
      !String(merged.blocked_reason || "").trim()
    )
      fail("blocked task needs blocked_reason");
    const fields = Object.entries(patch)
      .filter(
        ([field, value]) =>
          JSON.stringify(existing?.[field] ?? null) !== JSON.stringify(value),
      )
      .map(([field, value]) => ({
        field,
        before: existing?.[field] ?? null,
        after: value,
      }));
    const operation: UpdateOperation = {
      kind,
      key: v.key,
      id: recordId,
      parent_id: parent?.id || null,
      parent_key: parent?.key || null,
      is_new: !existing,
      data: patch,
    };
    operations.push(operation);
    resolved.set(v.key, operation);
    changes.push({
      kind,
      key: v.key,
      name: String(merged.name || merged.title),
      action: !existing ? "create" : fields.length ? "update" : "unchanged",
      fields,
      matched_by: matchedBy,
    });
  }
  return {
    reportDate,
    summary,
    operations,
    changes,
    counts: {
      create: changes.filter((c) => c.action === "create").length,
      update: changes.filter((c) => c.action === "update").length,
      unchanged: changes.filter((c) => c.action === "unchanged").length,
    },
  };
}
function groupsPrototype() {
  return { project: 1, work_package: 1, task: 1, subtask: 1 };
}

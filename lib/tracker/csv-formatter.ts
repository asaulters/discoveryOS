import {
  CSV_COLUMNS,
  CSV_FIELDS_BY_TYPE,
  readCsv,
  parseProjectCsv,
  type ImportType,
} from "./csv";

export type CsvColumn = (typeof CSV_COLUMNS)[number];
export type ColumnMapping = CsvColumn | "";
const normalized = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const aliases: Record<string, CsvColumn> = {
  row_type: "type",
  item_type: "type",
  id: "key",
  parent: "parent_key",
  parent_id: "parent_key",
  title: "name",
  description: "notes",
  order: "sort_order",
  completed: "is_done",
  done: "is_done",
  deadline: "due_date",
};
export function suggestMapping(headers: string[]): ColumnMapping[] {
  const used = new Set<string>();
  return headers.map((header) => {
    const value = normalized(header);
    const column = (CSV_COLUMNS as readonly string[]).includes(value)
      ? (value as CsvColumn)
      : Object.hasOwn(aliases, value)
        ? aliases[value]
        : "";
    if (!column || used.has(column)) return "";
    used.add(column);
    return column;
  });
}
export function writeProjectCsv(rows: Record<string, string>[]): string {
  const escape = (s: string) =>
    /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  return (
    [
      CSV_COLUMNS.join(","),
      ...rows.map((row) =>
        CSV_COLUMNS.map((c) => escape(row[c] || "")).join(","),
      ),
    ].join("\n") + "\n"
  );
}
export interface FormatChange {
  line: number;
  field: string;
  before: string;
  after: string;
  reason: string;
}
export function formatProjectCsv(source: string, mapping: ColumnMapping[]) {
  const records = readCsv(source);
  const header = records.shift()?.cells;
  if (!header) throw new Error("Choose a CSV with a header and project rows");
  if (mapping.length !== header.length)
    throw new Error("Map every source column or choose Ignore");
  const mapped = mapping.filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    throw new Error("Map each destination column only once");
  for (const required of ["type", "key", "parent_key", "name"])
    if (!mapped.includes(required as CsvColumn))
      throw new Error(`Map a source column to ${required}`);
  const changes: FormatChange[] = [];
  const rows = records.map(({ cells, line }) => {
    if (cells.length !== header.length)
      throw new Error(
        `Line ${line}: expected ${header.length} columns, found ${cells.length}. Fix the source CSV before formatting.`,
      );
    const row: Record<string, string> = {};
    for (let i = 0; i < cells.length; i++) {
      const field = mapping[i];
      if (field) row[field] = cells[i].trim();
      else if (cells[i].trim())
        changes.push({
          line,
          field: header[i] || `Column ${i + 1}`,
          before: cells[i],
          after: "",
          reason: "Ignored source column",
        });
    }
    const replace = (field: string, value: string, reason: string) => {
      if (row[field] !== value) {
        changes.push({ line, field, before: row[field], after: value, reason });
        row[field] = value;
      }
    };
    const type = normalized(row.type);
    const typeAliases: Record<string, string> = {
      workpackage: "work_package",
      sub_task: "subtask",
    };
    replace(
      "type",
      Object.hasOwn(typeAliases, type) ? typeAliases[type] : type,
      "Standardize row type",
    );
    if (Object.hasOwn(CSV_FIELDS_BY_TYPE, row.type)) {
      for (const [field, value] of Object.entries(row)) {
        if (["type", "key", "parent_key"].includes(field) || !value) continue;
        if (!CSV_FIELDS_BY_TYPE[row.type as ImportType].includes(field)) {
          replace(field, "", `Field does not apply to ${row.type}`);
          continue;
        }
        if (["status", "stage", "health", "size", "is_done"].includes(field)) {
          const valueNormalized = normalized(value);
          const synonyms: Record<string, Record<string, string>> = {
            status: {
              not_started: "todo",
              to_do: "todo",
              in_progress: "doing",
              completed: "done",
              complete: "done",
            },
            size: { small: "s", medium: "m", large: "l" },
            is_done: { yes: "true", no: "false", "1": "true", "0": "false" },
          };
          replace(
            field,
            synonyms[field] && Object.hasOwn(synonyms[field], valueNormalized)
              ? synonyms[field][valueNormalized]
              : valueNormalized,
            "Standardize value",
          );
        }
      }
    }
    return row;
  });
  return { csv: writeProjectCsv(rows), changes, rowCount: rows.length };
}
export function checkFormattedCsv(csv: string): string[] {
  try {
    parseProjectCsv(csv);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "Invalid CSV"];
  }
}

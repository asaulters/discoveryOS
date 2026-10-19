"use client";
import { useMemo, useState } from "react";
import { CSV_COLUMNS, readCsv } from "@/lib/tracker/csv";
import {
  checkFormattedCsv,
  formatProjectCsv,
  suggestMapping,
  type ColumnMapping,
} from "@/lib/tracker/csv-formatter";
import {
  buttonClass,
  primaryClass,
  inputClass,
  panelClass,
} from "@/app/tracker/shared";

export default function CsvFormatter({
  source,
  onUse,
}: {
  source: string;
  onUse: (csv: string) => void;
}) {
  const headers = useMemo(() => {
    try {
      return readCsv(source)[0]?.cells || [];
    } catch {
      return [];
    }
  }, [source]);
  const [mapping, setMapping] = useState<ColumnMapping[]>(() =>
    suggestMapping(headers),
  );
  const [edited, setEdited] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const result = useMemo(() => {
    try {
      return { value: formatProjectCsv(source, mapping), error: "" };
    } catch (e) {
      return {
        value: null,
        error: e instanceof Error ? e.message : "Could not format CSV",
      };
    }
  }, [source, mapping]);
  const csv = edited ?? result.value?.csv ?? "";
  const issues = useMemo(() => (csv ? checkFormattedCsv(csv) : []), [csv]);
  const changes = result.value?.changes || [];
  const ready =
    !!csv && !issues.length && !result.error && (!changes.length || accepted);
  function download() {
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "discoveryos-project-formatted.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={`${panelClass} mt-4`} aria-label="CSV formatter">
      <h3 className="font-semibold">CSV formatter</h3>
      <p className="my-2 text-sm">
        Map your columns, review corrections, then download or use the formatted
        file. Formatting happens in your browser. No project is created until
        you confirm the import.
      </p>
      <p className="my-2 text-sm text-neutral-500">
        The formatter standardizes row types and common status values, and
        clears fields that do not apply to a row type. It keeps your keys and
        parent links. Dates must use YYYY-MM-DD; ambiguous dates and missing
        parents need your input.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {headers.map((header, i) => (
          <label className="text-sm" key={i}>
            {header || `Column ${i + 1}`} →
            <select
              className={inputClass}
              aria-label={`Map column ${i + 1}: ${header}`}
              value={mapping[i] || ""}
              onChange={(event) => {
                setMapping(
                  mapping.map((value, index) =>
                    index === i ? (event.target.value as ColumnMapping) : value,
                  ),
                );
                setEdited(null);
                setAccepted(false);
              }}
            >
              <option value="">Ignore column</option>
              {CSV_COLUMNS.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {result.error && (
        <p role="alert" className="my-3 text-red-700">
          {result.error}
        </p>
      )}
      {result.value && (
        <>
          <p className="my-3 text-sm">
            {result.value.rowCount} rows · {changes.length} proposed value
            changes. Column headings and surrounding whitespace are
            standardized.
          </p>
          {changes.length > 0 && (
            <>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Source line",
                        "Field",
                        "Original",
                        "Formatted",
                        "Reason",
                      ].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change, i) => (
                      <tr className="border-t" key={i}>
                        <td className="p-2">{change.line}</td>
                        <td className="p-2">{change.field}</td>
                        <td className="max-w-64 whitespace-pre-wrap break-words p-2">
                          {change.before}
                        </td>
                        <td className="p-2">{change.after || "(empty)"}</td>
                        <td className="p-2">{change.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="my-3 block text-sm">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />{" "}
                I reviewed and accept these changes, including any cleared or
                ignored values.
              </label>
            </>
          )}
          <label className="my-3 block text-sm">
            Formatted CSV (editable)
            <textarea
              className={`${inputClass} min-h-64 font-mono text-xs`}
              aria-label="Formatted CSV (editable)"
              spellCheck={false}
              value={csv}
              onChange={(e) => setEdited(e.target.value)}
            />
          </label>
          {issues.length ? (
            <div role="alert" className="my-3 text-sm text-red-700">
              <p>
                Fix this issue in the editable CSV above. Validation updates as
                you edit; additional issues may appear after this one is fixed.
              </p>
              {issues.map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
            </div>
          ) : (
            <p role="status" className="my-3 text-sm">
              The formatted CSV passes import validation.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={!ready}
              onClick={download}
            >
              Download formatted CSV
            </button>
            <button
              className={primaryClass}
              disabled={!ready}
              onClick={() => onUse(csv)}
            >
              Use formatted CSV
            </button>
            <button
              className={buttonClass}
              disabled={edited === null}
              onClick={() => setEdited(null)}
            >
              Reset CSV edits
            </button>
          </div>
        </>
      )}
    </section>
  );
}

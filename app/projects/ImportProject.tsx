"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import {
  parseProjectCsv,
  MAX_IMPORT_BYTES,
  type ImportRow,
} from "@/lib/tracker/csv";
import {
  buttonClass,
  primaryClass,
  panelClass,
  inputClass,
} from "@/app/tracker/shared";
export default function ImportProject() {
  const selection = useRef(0);
  const [open, setOpen] = useState(false),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<ReturnType<typeof parseProjectCsv> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(""),
    [created, setCreated] = useState<string | null>(null);
  async function importProject() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/projects/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, request_id: requestId }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error || "Import failed");
      setCreated(data.project_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }
  function name(r: ImportRow) {
    return String(r.data.name || r.data.title);
  }
  return (
    <div className="mt-5">
      <button
        className={buttonClass}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close CSV import" : "Import project CSV"}
      </button>
      {open && (
        <section
          className={`${panelClass} mt-3`}
          aria-label="Import project CSV"
        >
          <h2 className="font-semibold">Import a project</h2>
          <p className="my-2 text-sm text-neutral-500">
            Upload one CSV containing a project and its work packages, tasks and
            subtasks. Review before creating; existing projects are kept as they
            are.
          </p>
          <a
            className="text-sm underline"
            href="/api/projects/import/template"
            download="discoveryos-project-template.csv"
          >
            Download CSV template
          </a>
          <p className="my-2 text-xs text-neutral-500">
            Required columns: type, key, parent_key, name. Keys connect children
            to their parent. Use YYYY-MM-DD dates. Maximum 2 MB and 2,000 rows.
          </p>
          <label className="mt-3 block text-sm">
            Project CSV
            <input
              className={inputClass}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                const version = ++selection.current;
                const file = e.target.files?.[0];
                setError("");
                setPreview(null);
                setCreated(null);
                setCsv("");
                setRequestId("");
                if (!file) return;
                try {
                  if (file.size > MAX_IMPORT_BYTES)
                    throw new Error("CSV must be 2 MB or smaller");
                  const text = await file.text(),
                    parsed = parseProjectCsv(text);
                  if (version !== selection.current) return;
                  setCsv(text);
                  setPreview(parsed);
                  setRequestId(crypto.randomUUID());
                } catch (e) {
                  if (version !== selection.current) return;
                  setError(
                    e instanceof Error ? e.message : "Could not read CSV",
                  );
                }
              }}
            />
          </label>
          {error && (
            <p role="alert" className="my-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {preview && (
            <div className="mt-4">
              <h3 className="font-medium">Preview: {preview.projectName}</h3>
              <p className="my-2 text-sm">
                1 project · {preview.counts.work_package} work packages ·{" "}
                {preview.counts.task} tasks · {preview.counts.subtask} subtasks
              </p>
              <p className="mb-3 text-xs text-neutral-500">
                All rows save together. If any row fails, no project is created.
              </p>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {["Line", "Type", "Key", "Parent", "Name", "Notes"].map(
                        (h) => (
                          <th className="p-2" key={h}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 100).map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="p-2">{r.line}</td>
                        <td className="p-2">{r.type.replaceAll("_", " ")}</td>
                        <td className="p-2">{r.key}</td>
                        <td className="p-2">{r.parent_key || "—"}</td>
                        <td className="p-2">{name(r)}</td>
                        <td
                          className="max-w-56 truncate p-2"
                          title={String(r.data.notes || "")}
                        >
                          {String(r.data.notes || "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 100 && (
                <p className="my-2 text-xs text-neutral-500">
                  Showing the first 100 rows. All {preview.rows.length} rows
                  will be imported.
                </p>
              )}
              {created ? (
                <Link
                  className="mt-3 inline-block underline"
                  href={`/projects/${created}`}
                >
                  Open imported project
                </Link>
              ) : (
                <button
                  className={`${primaryClass} mt-3`}
                  disabled={busy}
                  onClick={importProject}
                >
                  {busy ? "Importing…" : "Create project from CSV"}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

"use client";
import { useCallback, useRef, useState } from "react";
import { OwnerOnly } from "@/app/RoleControls";
import { MAX_IMPORT_BYTES } from "@/lib/tracker/csv";
import type { UpdateChange } from "@/lib/tracker/project-updates";
import {
  buttonClass,
  inputClass,
  panelClass,
  primaryClass,
  useTracker,
} from "@/app/tracker/shared";
interface Preview {
  revision: string;
  report_date: string;
  summary: string;
  changes: UpdateChange[];
  counts: { create: number; update: number; unchanged: number };
}
interface History {
  id: string;
  report_date: string;
  summary: string;
  created_at: string;
}
export default function ProjectCsvUpdates({
  projectId,
  archived,
  tracker,
}: {
  projectId: string;
  archived: boolean;
  tracker: ReturnType<typeof useTracker>;
}) {
  const base = `/api/projects/${projectId}/csv-updates`;
  const [open, setOpen] = useState(false),
    [csv, setCsv] = useState(""),
    [date, setDate] = useState(""),
    [requestId, setRequestId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const selection = useRef(0);
  const loadHistory = useCallback(async () => {
    const response = await fetch(base, { cache: "no-store" }),
      data = await response.json();
    if (!response.ok)
      throw Error(data.error || "Could not load update history");
    setHistory(data.updates);
  }, [base]);
  async function submit(mode: "preview" | "apply") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            csv,
            report_date: date,
            request_id: requestId,
            ...(mode === "apply" ? { revision: preview?.revision } : {}),
          }),
        }),
        data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setPreview(null);
          setReviewed(false);
        }
        throw Error(data.error || "CSV update failed");
      }
      if (mode === "preview") {
        setPreview(data);
        setReviewed(false);
      } else {
        setPreview(null);
        setReviewed(false);
        setCsv("");
        setMessage(
          data.already_applied
            ? "This CSV was already applied. No duplicate changes were made."
            : "Project updated. Download a fresh baseline for Claude before the next update.",
        );
        await Promise.all([tracker.refresh(), loadHistory()]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV update failed");
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || tracker.busy || archived;
  return (
    <section className={`${panelClass} mb-6`} aria-label="Project CSV updates">
      <button
        className={buttonClass}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            if (!date) {
              const d = new Date();
              setDate(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
              );
            }
            loadHistory().catch((e) => setError(e.message));
          }
        }}
      >
        {open ? "Close CSV updates" : "Daily CSV updates"}
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm">
            Give Claude the latest DOS baseline, then upload its daily CSV here.
            Updates apply only to this project. Omitted rows and blank cells
            stay unchanged; nothing is deleted or archived by an upload.
          </p>
          {!archived && (
            <a
              className="inline-block text-sm underline"
              href={`${base}?download=baseline`}
              download
            >
              Download current CSV baseline
            </a>
          )}
          <OwnerOnly>
            {archived ? (
              <p className="text-sm">
                Restore this project before uploading updates.
              </p>
            ) : (
              <>
                <p className="text-xs text-neutral-500">
                  Keep keys and record IDs unchanged. On your first upload, a
                  CSV without record IDs can match existing items by exact name
                  and parent. New items require action=create. Use progress_note
                  to append dated notes; use clear_fields to clear an optional
                  value. Maximum 2 MB / 2,000 rows.
                </p>
                <label className="block text-sm">
                  Report date (used if the project CSV row has no report_date)
                  <input
                    className={inputClass}
                    type="date"
                    aria-label="CSV report date"
                    value={date}
                    disabled={disabled}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setPreview(null);
                      setReviewed(false);
                    }}
                  />
                </label>
                <label className="block text-sm">
                  Project update CSV
                  <input
                    className={inputClass}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={disabled}
                    onChange={async (e) => {
                      const version = ++selection.current,
                        file = e.target.files?.[0];
                      setCsv("");
                      setPreview(null);
                      setReviewed(false);
                      setError("");
                      setMessage("");
                      setRequestId("");
                      if (!file) return;
                      try {
                        if (file.size > MAX_IMPORT_BYTES)
                          throw Error("CSV must be 2 MB or smaller");
                        const text = await file.text();
                        if (version !== selection.current) return;
                        setCsv(text);
                        setRequestId(crypto.randomUUID());
                      } catch (error) {
                        if (version === selection.current)
                          setError(
                            error instanceof Error
                              ? error.message
                              : "Could not read CSV",
                          );
                      }
                    }}
                  />
                </label>
                <button
                  className={buttonClass}
                  disabled={disabled || !csv || !date}
                  onClick={() => submit("preview")}
                >
                  {busy ? "Working…" : "Preview project updates"}
                </button>
                {preview && (
                  <div className="space-y-3">
                    <h3 className="font-semibold">Update preview</h3>
                    <p className="text-sm">
                      {preview.report_date} · {preview.counts.create} new ·{" "}
                      {preview.counts.update} updated ·{" "}
                      {preview.counts.unchanged} unchanged
                    </p>
                    {preview.summary && (
                      <p className="whitespace-pre-wrap text-sm">
                        {preview.summary}
                      </p>
                    )}
                    <div className="max-h-[32rem] overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr>
                            {["Key / item", "Match", "Action / changes"].map(
                              (h) => (
                                <th className="p-2" key={h}>
                                  {h}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.changes.map((change) => (
                            <tr className="border-t" key={change.key}>
                              <td className="p-2 align-top">
                                {change.key} · {change.name}
                                <span className="block text-xs text-neutral-500">
                                  {change.kind.replaceAll("_", " ")}
                                </span>
                              </td>
                              <td className="p-2 align-top">
                                {change.matched_by}
                              </td>
                              <td className="p-2">
                                <strong>{change.action}</strong>
                                {change.fields.map((field) => (
                                  <div key={field.field} className="mt-2">
                                    <span className="font-medium">
                                      {field.field}
                                    </span>
                                    <p className="max-w-xl whitespace-pre-wrap break-words text-xs text-neutral-500">
                                      Before:{" "}
                                      {field.before === null
                                        ? "(empty)"
                                        : String(field.before)}
                                    </p>
                                    <p className="max-w-xl whitespace-pre-wrap break-words text-xs">
                                      After:{" "}
                                      {field.after === null
                                        ? "(cleared)"
                                        : String(field.after)}
                                    </p>
                                  </div>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <label className="block text-sm">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={disabled}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />{" "}
                      I reviewed these changes for this project.
                    </label>
                    <button
                      className={primaryClass}
                      disabled={disabled || !reviewed}
                      onClick={() => submit("apply")}
                    >
                      Apply CSV updates
                    </button>
                    <p className="text-xs text-neutral-500">
                      All changes save together. If the project changed since
                      preview, preview again. Uploads and previous values are
                      retained in project history.
                    </p>
                  </div>
                )}
              </>
            )}
          </OwnerOnly>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <div>
            <h3 className="font-semibold">CSV update history</h3>
            <p className="my-2 text-xs text-neutral-500">
              Most recent 20 uploads. Previous upload files remain available
              after later updates.
            </p>
            {history.length ? (
              <ul className="space-y-2">
                {history.map((run) => (
                  <li key={run.id} className="border-t pt-2 text-sm">
                    <span>
                      {run.report_date} ·{" "}
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                    {run.summary && (
                      <p className="whitespace-pre-wrap">{run.summary}</p>
                    )}
                    <a
                      className="underline"
                      href={`${base}?download=source&run_id=${run.id}`}
                      download
                    >
                      Download uploaded CSV
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">No CSV updates yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

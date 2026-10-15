"use client";

import { WriteButton, WriteInput, WriteTextarea, WriteSelect } from "@/app/RoleControls";

import { useState } from "react";
import type { PilotIssue, PilotIssueCategory, PilotIssueSeverity } from "@/lib/types/database";
import { categorizeIssueText, ISSUE_CATEGORY_LABELS } from "@/lib/pilotIssueCategories";
import {
  PILOT_ISSUE_SEVERITY_OPTIONS,
  PILOT_ISSUE_SEVERITY_STYLES,
  PILOT_ISSUE_STATUS_LABELS,
  PILOT_ISSUE_STATUS_STYLES,
} from "@/lib/pilotIssueConstants";

const CATEGORY_OPTIONS = Object.entries(ISSUE_CATEGORY_LABELS) as [PilotIssueCategory, string][];

const STATUS_ORDER: Record<PilotIssue["status"], number> = { open: 0, resolved: 1, dismissed: 2 };

function sortIssues(issues: PilotIssue[]): PilotIssue[] {
  return [...issues].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.updated_at < b.updated_at ? 1 : -1;
  });
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

interface EditDraft {
  title: string;
  description: string;
  category: PilotIssueCategory;
  severity: PilotIssueSeverity;
}

export default function TrackedPilotIssuesSection({
  meetingId,
  initialIssues,
  issuesObservedText,
  sourcePilotNoteId,
}: {
  meetingId: string;
  initialIssues: PilotIssue[];
  issuesObservedText: string | null;
  sourcePilotNoteId: string | null;
}) {
  const [issues, setIssues] = useState<PilotIssue[]>(initialIssues);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PilotIssueCategory>("other");
  const [severity, setSeverity] = useState<PilotIssueSeverity>("medium");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  function handlePrefill() {
    if (!issuesObservedText) return;
    setDescription(issuesObservedText);
    const matched = categorizeIssueText(issuesObservedText);
    if (matched.length > 0) setCategory(matched[0]);
  }

  async function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Title is required");
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      const response = await fetch("/api/pilot/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          title: trimmedTitle,
          description: description.trim() || undefined,
          category,
          severity,
          sourcePilotNoteId: sourcePilotNoteId ?? undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to create pilot issue");
      setIssues((prev) => [result as PilotIssue, ...prev]);
      setTitle("");
      setDescription("");
      setCategory("other");
      setSeverity("medium");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create pilot issue");
    } finally {
      setCreating(false);
    }
  }

  async function runAction(issueId: string, path: string, body?: object) {
    setActionError(null);
    setActionPending(issueId);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Pilot issue action failed");
      setIssues((prev) => prev.map((i) => (i.id === issueId ? (result as PilotIssue) : i)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Pilot issue action failed");
    } finally {
      setActionPending(null);
    }
  }

  function handleResolve(issueId: string) {
    runAction(issueId, `/api/pilot/issues/${issueId}/resolve`, {
      resolutionNote: noteDrafts[issueId]?.trim() || undefined,
    });
  }

  function handleDismiss(issueId: string) {
    runAction(issueId, `/api/pilot/issues/${issueId}/dismiss`, {
      resolutionNote: noteDrafts[issueId]?.trim() || undefined,
    });
  }

  function handleReopen(issueId: string) {
    runAction(issueId, `/api/pilot/issues/${issueId}/reopen`);
  }

  function startEdit(issue: PilotIssue) {
    setEditingId(issue.id);
    setEditDraft({
      title: issue.title,
      description: issue.description ?? "",
      category: issue.category,
      severity: issue.severity,
    });
  }

  async function saveEdit(issueId: string) {
    if (!editDraft) return;
    setActionError(null);
    setActionPending(issueId);
    try {
      const response = await fetch(`/api/pilot/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDraft.title.trim(),
          description: editDraft.description.trim() || null,
          category: editDraft.category,
          severity: editDraft.severity,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to save pilot issue");
      setIssues((prev) => prev.map((i) => (i.id === issueId ? (result as PilotIssue) : i)));
      setEditingId(null);
      setEditDraft(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save pilot issue");
    } finally {
      setActionPending(null);
    }
  }

  const sortedIssues = sortIssues(issues);

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Tracked pilot issues
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Lightweight open/resolved/dismissed tracking, created manually from the notes below - not
        auto-generated, not a ticketing system. Internal only.
      </p>

      <div className="mt-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Create tracked issue
          </h3>
          {issuesObservedText && (
            <WriteButton
              type="button"
              onClick={handlePrefill}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Prefill from issues observed
            </WriteButton>
          )}
        </div>
        <div className="mt-2 space-y-2">
          <WriteInput
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Live capture missed phrase"
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <WriteTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <div className="flex flex-wrap gap-2">
            <WriteSelect
              value={category}
              onChange={(e) => setCategory(e.target.value as PilotIssueCategory)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            >
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </WriteSelect>
            <WriteSelect
              value={severity}
              onChange={(e) => setSeverity(e.target.value as PilotIssueSeverity)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            >
              {PILOT_ISSUE_SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </WriteSelect>
            <WriteButton
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {creating ? "Creating…" : "Create issue"}
            </WriteButton>
          </div>
          {formError && <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>}
        </div>
      </div>

      {actionError && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      )}

      {sortedIssues.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No tracked issues yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sortedIssues.map((issue) => {
            const pending = actionPending === issue.id;
            const isEditing = editingId === issue.id;
            return (
              <li
                key={issue.id}
                className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
              >
                {isEditing && editDraft ? (
                  <div className="space-y-2">
                    <WriteInput
                      type="text"
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                    />
                    <WriteTextarea
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      rows={2}
                      className="w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                    />
                    <div className="flex flex-wrap gap-2">
                      <WriteSelect
                        value={editDraft.category}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, category: e.target.value as PilotIssueCategory })
                        }
                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                      >
                        {CATEGORY_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </WriteSelect>
                      <WriteSelect
                        value={editDraft.severity}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, severity: e.target.value as PilotIssueSeverity })
                        }
                        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                      >
                        {PILOT_ISSUE_SEVERITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </WriteSelect>
                      <WriteButton
                        type="button"
                        onClick={() => saveEdit(issue.id)}
                        disabled={pending}
                        className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                      >
                        Save
                      </WriteButton>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft(null);
                        }}
                        className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium dark:border-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{issue.title}</span>
                        <Badge
                          label={ISSUE_CATEGORY_LABELS[issue.category]}
                          className="border-neutral-300 text-neutral-500 dark:border-neutral-700"
                        />
                        <Badge
                          label={PILOT_ISSUE_SEVERITY_OPTIONS.find((o) => o.value === issue.severity)?.label ?? issue.severity}
                          className={PILOT_ISSUE_SEVERITY_STYLES[issue.severity]}
                        />
                        <Badge
                          label={PILOT_ISSUE_STATUS_LABELS[issue.status]}
                          className={PILOT_ISSUE_STATUS_STYLES[issue.status]}
                        />
                      </div>
                      <WriteButton
                        type="button"
                        onClick={() => startEdit(issue)}
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Edit
                      </WriteButton>
                    </div>

                    {issue.description && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
                        {issue.description}
                      </p>
                    )}

                    {issue.status === "open" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <WriteInput
                          type="text"
                          value={noteDrafts[issue.id] ?? ""}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [issue.id]: e.target.value }))
                          }
                          placeholder="Resolution note (optional)"
                          className="min-w-[180px] flex-1 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
                        />
                        <WriteButton
                          type="button"
                          onClick={() => handleResolve(issue.id)}
                          disabled={pending}
                          className="rounded border border-green-300 px-2 py-1 text-xs font-medium text-green-700 disabled:opacity-50 dark:border-green-800 dark:text-green-400"
                        >
                          Resolve
                        </WriteButton>
                        <WriteButton
                          type="button"
                          onClick={() => handleDismiss(issue.id)}
                          disabled={pending}
                          className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700"
                        >
                          Dismiss
                        </WriteButton>
                      </div>
                    ) : (
                      <div className="mt-2">
                        {issue.resolution_note && (
                          <p className="text-xs text-neutral-500">
                            Resolution note: {issue.resolution_note}
                          </p>
                        )}
                        <WriteButton
                          type="button"
                          onClick={() => handleReopen(issue.id)}
                          disabled={pending}
                          className="mt-1 rounded border border-neutral-300 px-2 py-1 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
                        >
                          Reopen
                        </WriteButton>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

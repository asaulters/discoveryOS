"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const COPY_MESSAGE_MS = 2500;

/** Extracts one "## Heading" section (heading line + body) from the generated Markdown, or null if that section wasn't rendered (e.g. no possible mismatches). */
function extractSection(markdown: string, heading: string): string | null {
  const pattern = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, "m");
  const match = markdown.match(pattern);
  if (!match) return null;
  return `## ${heading}\n${match[1]}`.trim();
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "meeting"
  );
}

export default function ExportPanel({
  meetingId,
  meetingName,
}: {
  meetingId: string;
  meetingName: string;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ label: string; text: string } | null>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/meetings/${meetingId}/export/markdown`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Failed to build export");
        }
        if (!cancelled) setMarkdown(result.markdown as string);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build export");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (fallback && fallbackRef.current) {
      fallbackRef.current.focus();
      fallbackRef.current.select();
    }
  }, [fallback]);

  async function copyText(text: string, label: string) {
    setFallback(null);
    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopiedLabel(null), COPY_MESSAGE_MS);
    } catch {
      // Clipboard API unavailable/denied (e.g. non-HTTPS, permission
      // blocked) - never a dead end, fall back to selectable text.
      setFallback({ label, text });
    }
  }

  function handleDownload() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `discoveryos-${slugify(meetingName)}-review.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const sections = markdown
    ? {
        executiveSummary: extractSection(markdown, "Executive Summary"),
        followups: extractSection(markdown, "Recommended Follow-Ups"),
        stillUnclear: extractSection(markdown, "Still Unclear"),
        possibleMismatches: extractSection(markdown, "Possible Mismatches"),
      }
    : null;

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Export / Copy
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Copyable Markdown built from the current process model, evidence, and (if generated) the
        latest post-meeting review. Resolved/dismissed items are never included as open.
      </p>

      {loading && <p className="mt-3 text-sm text-neutral-400">Building export…</p>}
      {error && (
        <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {markdown && sections && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(markdown, "Full Markdown")}
              className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Copy full Markdown
            </button>
            {sections.executiveSummary && (
              <button
                type="button"
                onClick={() => copyText(sections.executiveSummary!, "Executive summary")}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
              >
                Copy executive summary
              </button>
            )}
            {sections.followups && (
              <button
                type="button"
                onClick={() => copyText(sections.followups!, "Follow-up questions")}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
              >
                Copy follow-up questions
              </button>
            )}
            {sections.stillUnclear && (
              <button
                type="button"
                onClick={() => copyText(sections.stillUnclear!, "Still unclear")}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
              >
                Copy still unclear
              </button>
            )}
            {sections.possibleMismatches && (
              <button
                type="button"
                onClick={() => copyText(sections.possibleMismatches!, "Possible mismatches")}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium dark:border-neutral-700"
              >
                Copy possible mismatches
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={`/meetings/${meetingId}/share`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Open print/share view
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <button
              type="button"
              onClick={handleDownload}
              className="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Download Markdown
            </button>
          </div>

          {copiedLabel && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400">
              Copied ✓ {copiedLabel}
            </p>
          )}

          {fallback && (
            <div className="mt-3">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Clipboard access wasn&apos;t available for &ldquo;{fallback.label}&rdquo; - the text
                below is selected, press Ctrl/Cmd+C to copy it.
              </p>
              <textarea
                ref={fallbackRef}
                readOnly
                value={fallback.text}
                rows={6}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

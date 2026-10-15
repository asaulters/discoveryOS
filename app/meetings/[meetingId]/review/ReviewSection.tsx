"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import type {
  AssumptionUpdateStatus,
  BuildDirectionAssessment,
  BuildDirectionStatus,
  PostMeetingReview,
  ReviewEvidenceType,
  ReviewPriority,
  RiskSeverity,
} from "@/lib/types/database";

type Status = "idle" | "generating" | "success" | "error";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: ReviewPriority }) {
  const styles: Record<ReviewPriority, string> = {
    low: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    medium: "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400",
    high: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    critical: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[priority]}`}>
      {priority}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  return <PriorityBadge priority={severity} />;
}

function EvidenceTypeBadge({ evidenceType }: { evidenceType: ReviewEvidenceType }) {
  const styles: Record<ReviewEvidenceType, string> = {
    known: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    inferred: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[evidenceType]}`}>
      {evidenceType}
    </span>
  );
}

function AssumptionStatusBadge({ status }: { status: AssumptionUpdateStatus }) {
  const styles: Record<AssumptionUpdateStatus, string> = {
    supported: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    weakened: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    changed: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    unresolved: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function BuildDirectionStatusBadge({ status }: { status: BuildDirectionStatus }) {
  const styles: Record<BuildDirectionStatus, string> = {
    supported: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    partially_supported: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    weakened: "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
    needs_reframing: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  };
  const labels: Record<BuildDirectionStatus, string> = {
    supported: "Supported",
    partially_supported: "Partially supported",
    weakened: "Weakened",
    needs_reframing: "Needs reframing",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/** Rendered as its own bordered card, separate from the uniform section list below - Part D of Sprint 8 asks for this to be visually prominent since it's the headline takeaway of the review. */
function BuildDirectionCard({ assessment }: { assessment: BuildDirectionAssessment }) {
  const borderStyles: Record<BuildDirectionStatus, string> = {
    supported: "border-green-400 dark:border-green-700",
    partially_supported: "border-amber-400 dark:border-amber-700",
    weakened: "border-amber-500 dark:border-amber-600",
    needs_reframing: "border-red-400 dark:border-red-700",
  };
  return (
    <div
      className={`rounded border-2 bg-white p-4 dark:bg-neutral-900 ${borderStyles[assessment.status]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Build direction assessment
        </h3>
        <BuildDirectionStatusBadge status={assessment.status} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{assessment.assessment}</p>
      {assessment.recommendedReframe && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Recommended reframe: {assessment.recommendedReframe}
        </p>
      )}
    </div>
  );
}

function formatTimestamp(isoString: string) {
  return new Date(isoString).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReviewSection({
  meetingId,
  initialReview,
}: {
  meetingId: string;
  initialReview: PostMeetingReview | null;
}) {
  const [review, setReview] = useState<PostMeetingReview | null>(initialReview);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setStatus("generating");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/generate-review`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to generate review");
      }

      setReview(result.review as PostMeetingReview);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to generate review");
    }
  }

  const generating = status === "generating";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Post-meeting review
          </h2>
          {review ? (
            <p className="mt-1 text-xs text-neutral-500">
              Latest review generated {formatTimestamp(review.generated_at)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">No review generated yet.</p>
          )}
        </div>
        <WriteButton
          onClick={handleGenerate}
          disabled={generating}
          className={
            review
              ? "shrink-0 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
              : "shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          }
        >
          {generating ? "Generating..." : review ? "Regenerate review" : "Generate review"}
        </WriteButton>
      </div>

      {status === "error" && error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-400">
            Meeting data is intact, but review generation failed. Try again.
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
        </div>
      )}

      {!review ? (
        <p className="text-sm text-neutral-400">
          No review yet. Click &ldquo;Generate review&rdquo; to summarize what this meeting has
          revealed so far.
        </p>
      ) : (
        <div className="space-y-5">
          <BuildDirectionCard assessment={review.build_direction_assessment} />

          <div className="space-y-5 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <Section title="Executive summary">
              <p className="whitespace-pre-wrap text-sm">{review.summary}</p>
            </Section>

            <Section title="What we learned">
              {review.key_learnings.length > 0 ? (
                <ul className="space-y-2">
                  {review.key_learnings.map((k, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <EvidenceTypeBadge evidenceType={k.evidenceType} />
                        {k.supportingWorkflowItem && (
                          <span className="text-xs text-neutral-500">
                            from: {k.supportingWorkflowItem}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5">{k.learning}</p>
                      {k.sourceQuote && (
                        <p className="mt-0.5 italic text-neutral-500">&ldquo;{k.sourceQuote}&rdquo;</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">None yet.</p>
              )}
            </Section>

            <Section title="Workflow that emerged">
              <p className="whitespace-pre-wrap text-sm">{review.workflow_summary}</p>
            </Section>

            <Section title="Known facts">
              {review.known_facts.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {review.known_facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">None yet.</p>
              )}
            </Section>

            <Section title="Inferences">
              {review.inferences.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {review.inferences.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">None yet.</p>
              )}
            </Section>

            <Section title="Open questions">
              {review.open_questions.length > 0 ? (
                <ul className="space-y-2">
                  {review.open_questions.map((q, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={q.priority} />
                        <span className="font-medium">{q.question}</span>
                      </div>
                      <p className="mt-0.5 text-neutral-500">{q.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">No open unknowns recorded.</p>
              )}
            </Section>

            <Section title="Assumption updates">
              {review.assumption_updates.length > 0 ? (
                <ul className="space-y-2">
                  {review.assumption_updates.map((a, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <AssumptionStatusBadge status={a.status} />
                        <span className="font-medium">{a.assumption}</span>
                      </div>
                      <p className="mt-0.5 text-neutral-500">{a.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">No starting assumptions recorded.</p>
              )}
            </Section>

            <Section title="Recommended follow-ups">
              {review.recommended_followups.length > 0 ? (
                <ul className="space-y-2">
                  {review.recommended_followups.map((f, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={f.priority} />
                        <span className="font-medium">{f.topic}</span>
                      </div>
                      <p className="mt-0.5 text-neutral-500">{f.question}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">None yet.</p>
              )}
            </Section>

            <Section title="Risks">
              {review.risks.length > 0 ? (
                <ul className="space-y-2">
                  {review.risks.map((r, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={r.severity} />
                        <span className="font-medium">{r.risk}</span>
                      </div>
                      <p className="mt-0.5 text-neutral-500">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-400">None yet.</p>
              )}
            </Section>
          </div>
        </div>
      )}
    </section>
  );
}

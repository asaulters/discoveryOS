"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import type { AppliedAiOpportunityAssessment } from "@/lib/services/appliedAiOpportunityAssessment";
import {
  APPLIED_AI_RECOMMENDATION_DESCRIPTIONS,
  APPLIED_AI_RECOMMENDATION_LABELS,
  type AppliedAiRecommendationType,
} from "@/lib/lenses/appliedAiOpportunityLens";
import AppliedAiPatternFitSection from "./AppliedAiPatternFitSection";

type Status = "idle" | "generating" | "success" | "error";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

const RECOMMENDATION_BORDER_STYLES: Record<AppliedAiRecommendationType, string> = {
  ai_assist: "border-green-400 dark:border-green-700",
  rules_automation: "border-blue-400 dark:border-blue-700",
  workflow_redesign: "border-purple-400 dark:border-purple-700",
  reporting_visibility: "border-cyan-400 dark:border-cyan-700",
  human_process_change: "border-teal-400 dark:border-teal-700",
  not_ready: "border-amber-400 dark:border-amber-700",
  no_build: "border-neutral-400 dark:border-neutral-600",
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    low: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    medium: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    high: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[confidence] ?? styles.low}`}>
      {confidence} confidence
    </span>
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

/** Builds the copyable internal/client-friendly opportunity summary (Part G) from the current assessment plus the meeting's own current_understanding - no extra AI call. */
function buildOpportunitySummary(
  assessment: AppliedAiOpportunityAssessment,
  currentUnderstanding: string | null
): string {
  const recommendationLabel = APPLIED_AI_RECOMMENDATION_LABELS[assessment.recommendationType];
  const recommendationDescription = APPLIED_AI_RECOMMENDATION_DESCRIPTIONS[assessment.recommendationType];
  const needsAutomationCaveat = assessment.recommendationType !== "rules_automation";

  const lines: string[] = [
    "Applied AI opportunity summary",
    "",
    "1. Workflow/problem observed",
    currentUnderstanding?.trim() || "(not yet described)",
    "",
    "2. Opportunity type",
    recommendationLabel,
    "",
    "3. Recommended approach",
    recommendationDescription,
    ...assessment.reasoning.map((r) => `- ${r}`),
    "",
  ];

  if (needsAutomationCaveat) {
    lines.push(
      "4. Why not full automation yet",
      ...(assessment.risks.length > 0 || assessment.missingInformation.length > 0
        ? [...assessment.risks.map((r) => `- ${r}`), ...assessment.missingInformation.map((m) => `- ${m}`)]
        : ["- No specific blocker identified beyond normal caution."]),
      ""
    );
  }

  lines.push(
    "5. Risks and guardrails",
    ...(assessment.risks.length > 0 ? assessment.risks.map((r) => `- ${r}`) : ["- None identified yet."]),
    "",
    "6. Missing information",
    ...(assessment.missingInformation.length > 0
      ? assessment.missingInformation.map((m) => `- ${m}`)
      : ["- None identified yet."]),
    "",
    "7. Smallest useful experiment",
    assessment.smallestUsefulExperiment,
    "",
    "8. Success metrics to validate",
    ...assessment.successMetricCandidates.map((m) => `- ${m}`),
    "",
    "9. Suggested next step",
    assessment.suggestedNextQuestions[0] ?? "Confirm the open questions above before proceeding.",
    ""
  );

  return lines.join("\n");
}

export default function AppliedAiAssessmentSection({
  meetingId,
  currentUnderstanding,
  initialAssessment,
}: {
  meetingId: string;
  currentUnderstanding: string | null;
  initialAssessment: AppliedAiOpportunityAssessment | null;
}) {
  const [assessment, setAssessment] = useState<AppliedAiOpportunityAssessment | null>(initialAssessment);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setError(null);
    setStatus("generating");
    try {
      const response = await fetch(`/api/meetings/${meetingId}/applied-ai-assessment`, {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to generate Applied AI opportunity assessment");
      }

      setAssessment(result.assessment as AppliedAiOpportunityAssessment);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to generate Applied AI opportunity assessment");
    }
  }

  async function handleCopy() {
    if (!assessment) return;
    const summary = buildOpportunitySummary(assessment, currentUnderstanding);
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permissions/non-secure context) - silently no-op, the button label communicates the result either way.
    }
  }

  const generating = status === "generating";

  return (
    <section className="space-y-4 rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Applied AI opportunity assessment
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Working guidance only - cautious and evidence-grounded, never a claim that AI is definitely the
            answer. Not included in Share/export.
          </p>
          {assessment && (
            <p className="mt-1 text-xs text-neutral-500">
              Latest assessment generated {formatTimestamp(assessment.generatedAt)}
            </p>
          )}
        </div>
        <WriteButton
          onClick={handleGenerate}
          disabled={generating}
          className={
            assessment
              ? "shrink-0 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
              : "shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          }
        >
          {generating ? "Generating..." : assessment ? "Regenerate Applied AI assessment" : "Generate Applied AI assessment"}
        </WriteButton>
      </div>

      {status === "error" && error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm text-red-700 dark:text-red-400">
            Assessment generation failed. The review page is unaffected - try again.
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
        </div>
      )}

      {!assessment ? (
        <p className="text-sm text-neutral-400">
          No assessment generated yet. Click &ldquo;Generate Applied AI assessment&rdquo; to get a cautious
          recommendation (AI assist, rules automation, workflow redesign, reporting/visibility, human process
          change, not-ready, or no-build) grounded in what this meeting has actually captured so far.
        </p>
      ) : (
        <div className="space-y-5">
          <div
            className={`rounded border-2 bg-white p-4 dark:bg-neutral-900 ${RECOMMENDATION_BORDER_STYLES[assessment.recommendationType]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Recommendation</h3>
              <ConfidenceBadge confidence={assessment.confidence} />
            </div>
            <p className="mt-2 text-base font-semibold">
              {APPLIED_AI_RECOMMENDATION_LABELS[assessment.recommendationType]}
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {APPLIED_AI_RECOMMENDATION_DESCRIPTIONS[assessment.recommendationType]}
            </p>
          </div>

          <Section title="Why this recommendation">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {assessment.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Section>

          <Section title="Supporting evidence">
            {assessment.supportingEvidence.length > 0 ? (
              <ul className="space-y-2">
                {assessment.supportingEvidence.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{e.label}</span>
                    {e.quote && <p className="mt-0.5 italic text-neutral-500">&ldquo;{e.quote}&rdquo;</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">No specific evidence cited.</p>
            )}
          </Section>

          <Section title="Risks">
            {assessment.risks.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {assessment.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-400">None identified.</p>
            )}
          </Section>

          <Section title="Missing information">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {assessment.missingInformation.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>

          <Section title="Smallest useful experiment">
            <p className="text-sm">{assessment.smallestUsefulExperiment}</p>
          </Section>

          <Section title="Suggested next questions">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {assessment.suggestedNextQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </Section>

          <Section title="Success metric candidates">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {assessment.successMetricCandidates.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>

          <AppliedAiPatternFitSection
            patternFits={assessment.patternFits}
            topRecommendedPatternIds={assessment.topRecommendedPatternIds}
          />

          <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  Internal/client-friendly opportunity summary
                </h3>
                <p className="mt-1 text-xs text-neutral-500">
                  A copyable summary built from the assessment above - safe to paste into internal notes or a
                  client-facing recap. Not automatically shared or exported.
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
              >
                {copied ? "Copied!" : "Copy summary"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

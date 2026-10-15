"use client";

import { WriteInput, WriteButton, WriteTextarea } from "@/app/RoleControls";

import { useState } from "react";
import { EVALUATION_CATEGORIES, EVALUATION_RUBRIC, type EvaluationCategory } from "@/lib/evaluationRubric";
import type { EvaluationRunView } from "@/lib/services/evaluations";
import type { DiscoveryScenario } from "@/lib/scenarios";

type Status = "idle" | "saving" | "success" | "error";

function itemKey(category: string, label: string): string {
  return `${category}::${label}`;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-neutral-400">—</span>;
  }
  const styles =
    score >= 4
      ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
      : score >= 2.5
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
        : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}>{score}/5</span>
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

const SCORE_COLUMNS: { key: keyof EvaluationRunView["run"]; label: string }[] = [
  { key: "question_direction_score", label: "Question directions" },
  { key: "workflow_extraction_score", label: "Workflow extraction" },
  { key: "evidence_quality_score", label: "Evidence quality" },
  { key: "gap_quality_score", label: "Gap quality" },
  { key: "review_quality_score", label: "Review usefulness" },
  { key: "hallucination_risk_score", label: "Hallucination checks" },
  { key: "contradiction_quality_score", label: "Clarification quality" },
  { key: "conversation_state_score", label: "Conversation state quality" },
];

/**
 * Sprint 10, Part E: which scenario.expectedOutputs fields are relevant
 * reference material for each rubric category - shown as a hint under the
 * category heading so the evaluator doesn't have to cross-reference the
 * fixture file by hand. Not every category has an obvious mapping (e.g.
 * "Question direction quality" has no expectedOutputs field), and that's
 * fine - the hint just doesn't render for those.
 */
function scenarioHintsForCategory(
  category: EvaluationCategory,
  scenario: DiscoveryScenario
): string[] {
  const { expectedOutputs } = scenario;
  switch (category) {
    case "Workflow extraction accuracy":
      return [
        `Expected steps: ${expectedOutputs.expectedWorkflowSteps.join("; ")}`,
        `Expected actors: ${expectedOutputs.expectedActors.join(", ") || "(none)"}`,
        `Expected systems: ${expectedOutputs.expectedSystems.join(", ") || "(none named)"}`,
      ];
    case "Evidence correctness":
      return expectedOutputs.expectedEvidenceChecks;
    case "Gap quality":
      return expectedOutputs.expectedGaps.map((g) => `Expected open gap: ${g}`);
    case "Review usefulness":
      return [`Expected review assessment: ${expectedOutputs.expectedReviewAssessment}`];
    case "Hallucination checks":
      return [
        `Only these actors/systems should appear: ${[
          ...expectedOutputs.expectedActors,
          ...expectedOutputs.expectedSystems,
        ].join(", ") || "(none named in this scenario)"}`,
      ];
    case "Clarification / contradiction detection quality":
      return (expectedOutputs.expectedClarifications ?? []).map((c) => `Expected clarification need: ${c}`);
    case "Conversation state / speaker role quality":
      return (expectedOutputs.expectedSpeakerRoleNotes ?? []).map((n) => `Expected speaker-role behavior: ${n}`);
    case "Demo readiness":
      return expectedOutputs.expectedAmbiguities ?? [];
    default:
      return [];
  }
}

export default function EvaluateForm({
  meetingId,
  initialLatest,
  scenario,
}: {
  meetingId: string;
  initialLatest: EvaluationRunView | null;
  scenario: DiscoveryScenario | null;
}) {
  const [latest, setLatest] = useState<EvaluationRunView | null>(initialLatest);
  const [scenarioName, setScenarioName] = useState(scenario?.name ?? "");
  const [notes, setNotes] = useState("");
  const [itemStates, setItemStates] = useState<Record<string, boolean | null>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function setItemPassed(category: string, label: string, passed: boolean | null) {
    setItemStates((prev) => {
      const key = itemKey(category, label);
      const next = prev[key] === passed ? null : passed;
      return { ...prev, [key]: next };
    });
  }

  async function handleSave() {
    setError(null);
    setStatus("saving");
    try {
      const items = EVALUATION_RUBRIC.map((item) => ({
        category: item.category,
        label: item.label,
        passed: itemStates[itemKey(item.category, item.label)] ?? null,
      }));

      const response = await fetch(`/api/meetings/${meetingId}/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioName: scenarioName.trim() || undefined,
          notes: notes.trim() || undefined,
          items,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save evaluation");
      }

      setLatest(result.evaluation as EvaluationRunView);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save evaluation");
    }
  }

  const saving = status === "saving";

  return (
    <div className="space-y-6">
      {scenario && (
        <section className="rounded border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Scenario: {scenario.name}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {scenario.description}
          </p>
          <details className="mt-3 text-sm" open>
            <summary className="cursor-pointer text-xs font-medium text-neutral-500">
              Expected outputs (reference while scoring)
            </summary>
            <div className="mt-2 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <p>
                <span className="font-medium">Steps:</span>{" "}
                {scenario.expectedOutputs.expectedWorkflowSteps.join("; ")}
              </p>
              <p>
                <span className="font-medium">Actors:</span>{" "}
                {scenario.expectedOutputs.expectedActors.join(", ") || "(none)"}
              </p>
              <p>
                <span className="font-medium">Systems:</span>{" "}
                {scenario.expectedOutputs.expectedSystems.join(", ") || "(none named)"}
              </p>
              <p>
                <span className="font-medium">Gaps:</span>{" "}
                {scenario.expectedOutputs.expectedGaps.join("; ")}
              </p>
              <p>
                <span className="font-medium">Evidence checks:</span>{" "}
                {scenario.expectedOutputs.expectedEvidenceChecks.join("; ")}
              </p>
              <p>
                <span className="font-medium">Review assessment:</span>{" "}
                {scenario.expectedOutputs.expectedReviewAssessment}
              </p>
              {scenario.expectedOutputs.expectedAmbiguities && (
                <p>
                  <span className="font-medium">Ambiguities:</span>{" "}
                  {scenario.expectedOutputs.expectedAmbiguities.join("; ")}
                </p>
              )}
              {scenario.expectedOutputs.expectedClarifications && (
                <p>
                  <span className="font-medium">Clarification needs:</span>{" "}
                  {scenario.expectedOutputs.expectedClarifications.join("; ")}
                </p>
              )}
              {scenario.evaluationNotes.length > 0 && (
                <div>
                  <span className="font-medium">Evaluation notes:</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {scenario.evaluationNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </section>
      )}

      {latest && (
        <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Latest evaluation
            </h2>
            <ScoreBadge score={latest.run.overall_score} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {latest.run.scenario_name ? `${latest.run.scenario_name} — ` : ""}
            saved {formatTimestamp(latest.run.created_at)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SCORE_COLUMNS.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-500">{col.label}</span>
                <ScoreBadge score={latest.run[col.key] as number | null} />
              </div>
            ))}
          </div>
          {latest.run.notes && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
              {latest.run.notes}
            </p>
          )}
        </section>
      )}

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {latest ? "Save a new scorecard" : "Create manual scorecard"}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Go through the checklist below against what you actually see in this meeting&apos;s
          brief, live HUD, workflow diagram, and review. Saving creates a new scorecard - past
          scorecards are kept, not overwritten.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium" htmlFor="scenarioName">
            Scenario name (optional)
          </label>
          <WriteInput
            id="scenarioName"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            placeholder="e.g. Employee Onboarding Access Request Demo"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="mt-6 space-y-6">
          {EVALUATION_CATEGORIES.map((category) => {
            const hints = scenario ? scenarioHintsForCategory(category, scenario) : [];
            return (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {category}
              </h3>
              {hints.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs italic text-neutral-500">
                  {hints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-2 space-y-2">
                {EVALUATION_RUBRIC.filter((item) => item.category === category).map((item) => {
                  const key = itemKey(item.category, item.label);
                  const value = itemStates[key] ?? null;
                  return (
                    <li key={key} className="flex items-center justify-between gap-3 text-sm">
                      <span>{item.label}</span>
                      <div className="flex shrink-0 gap-1">
                        <WriteButton
                          type="button"
                          onClick={() => setItemPassed(item.category, item.label, true)}
                          disabled={saving}
                          className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            value === true
                              ? "border-green-400 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
                              : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                          }`}
                        >
                          Pass
                        </WriteButton>
                        <WriteButton
                          type="button"
                          onClick={() => setItemPassed(item.category, item.label, false)}
                          disabled={saving}
                          className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            value === false
                              ? "border-red-400 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
                              : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                          }`}
                        >
                          Fail
                        </WriteButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium" htmlFor="notes">
            Notes
          </label>
          <WriteTextarea
            id="notes"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            rows={3}
            placeholder="Anything worth remembering about this run - what worked, what didn't"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
        </div>

        {status === "error" && error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {status === "success" && (
          <p className="mt-3 text-sm text-green-600 dark:text-green-400">Evaluation saved.</p>
        )}

        <WriteButton
          onClick={handleSave}
          disabled={saving}
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {saving ? "Saving..." : "Save evaluation"}
        </WriteButton>
      </section>
    </div>
  );
}

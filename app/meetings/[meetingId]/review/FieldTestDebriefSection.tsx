"use client";

import { WriteSelect, WriteInput, WriteTextarea } from "@/app/RoleControls";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FieldTestView, UpsertFieldTestInput } from "@/lib/services/fieldTests";
import { computeFieldTestSummary } from "@/lib/fieldTestSummary";
import type {
  FieldTest,
  FieldTestStatus,
  FieldTestSuccessDecision,
  HudDistractionLevel,
  ManualNotesNeededLevel,
  RemoteCaptureSetup,
} from "@/lib/types/database";

type Status = "idle" | "saving" | "saved" | "error";

const SAVED_MESSAGE_MS = 2500;

const STATUS_OPTIONS: { value: FieldTestStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

const SUCCESS_DECISION_OPTIONS: { value: FieldTestSuccessDecision; label: string; helper: string }[] = [
  { value: "strong_signal", label: "Strong signal", helper: "Product clearly helped and should be used again." },
  { value: "mixed_signal", label: "Mixed signal", helper: "Useful moments but clear issues to fix." },
  { value: "weak_signal", label: "Weak signal", helper: "Not enough value yet." },
  { value: "not_enough_data", label: "Not enough data", helper: "Meeting/test wasn't representative." },
];

type ScoreField =
  | "helped_ask_better_questions"
  | "reduced_missed_followups"
  | "improved_workflow_understanding"
  | "stayed_non_distracting"
  | "evidence_trustworthy"
  | "applied_ai_judgment_useful"
  | "overall_usefulness";

const SCORE_ROWS: { field: ScoreField; label: string }[] = [
  { field: "helped_ask_better_questions", label: "Helped ask better questions" },
  { field: "reduced_missed_followups", label: "Reduced missed follow-ups" },
  { field: "improved_workflow_understanding", label: "Improved workflow understanding" },
  { field: "stayed_non_distracting", label: "Stayed non-distracting" },
  { field: "evidence_trustworthy", label: "Evidence felt trustworthy" },
  { field: "applied_ai_judgment_useful", label: "Applied AI judgment was useful" },
  { field: "overall_usefulness", label: "Overall usefulness" },
];

type CaptureScoreField = "remote_audio_clarity_score" | "user_voice_balance_score" | "transcript_usefulness_score";

const CAPTURE_SCORE_ROWS: { field: CaptureScoreField; label: string }[] = [
  { field: "remote_audio_clarity_score", label: "Remote audio clarity" },
  { field: "user_voice_balance_score", label: "User voice balance (5 = balanced/remote clearly captured)" },
  { field: "transcript_usefulness_score", label: "Transcript usefulness" },
];

const LEVEL_OPTIONS: { value: ManualNotesNeededLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const CAPTURE_SETUP_USED_OPTIONS: { value: RemoteCaptureSetup; label: string }[] = [
  { value: "unknown", label: "Not recorded" },
  { value: "blackhole_virtual_audio", label: "BlackHole / virtual audio routing" },
  { value: "two_laptop_external_mic", label: "Two laptops + external mic near speaker" },
  { value: "two_laptop_builtin_mic", label: "Two laptops + built-in mic" },
  { value: "same_laptop_speakers", label: "Same laptop + speakers + browser mic" },
  { value: "browser_mic_room_audio", label: "Same laptop + browser mic (in-room audio)" },
  { value: "manual_notes_primary", label: "Manual notes only (no live capture)" },
];

function toPayload(fieldTest: FieldTestView): UpsertFieldTestInput {
  return {
    status: fieldTest.status,
    testContext: fieldTest.test_context,
    selectedScenarioReference: fieldTest.selected_scenario_reference,
    facilitatorGoal: fieldTest.facilitator_goal,
    participantDisclosureUsed: fieldTest.participant_disclosure_used,
    liveCaptureUsed: fieldTest.live_capture_used,
    manualTranscriptUsed: fieldTest.manual_transcript_used,
    observerNotes: fieldTest.observer_notes,
    facilitatorNotes: fieldTest.facilitator_notes,
    debriefNotes: fieldTest.debrief_notes,
    helpedAskBetterQuestions: fieldTest.helped_ask_better_questions,
    reducedMissedFollowups: fieldTest.reduced_missed_followups,
    improvedWorkflowUnderstanding: fieldTest.improved_workflow_understanding,
    stayedNonDistracting: fieldTest.stayed_non_distracting,
    evidenceTrustworthy: fieldTest.evidence_trustworthy,
    appliedAiJudgmentUseful: fieldTest.applied_ai_judgment_useful,
    overallUsefulness: fieldTest.overall_usefulness,
    successDecision: fieldTest.success_decision,
    nextIterationNotes: fieldTest.next_iteration_notes,
    remoteAudioClarityScore: fieldTest.remote_audio_clarity_score,
    userVoiceBalanceScore: fieldTest.user_voice_balance_score,
    transcriptUsefulnessScore: fieldTest.transcript_usefulness_score,
    manualNotesNeeded: fieldTest.manual_notes_needed,
    hudDistractionLevel: fieldTest.hud_distraction_level,
    captureSetupUsed: fieldTest.capture_setup_used,
  };
}

function ScoreSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <WriteSelect
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
    >
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </WriteSelect>
  );
}

/**
 * Sprint 28 Part D: internal-only field-test planning/debrief/scoring
 * section for a real (non-scenario) meeting - deliberately lives only on
 * this page, not in meetingExportBuilder/share, same guardrail as
 * PilotChecklistSection.tsx. Orthogonal to pilot readiness/tracked
 * issues: a field test can exist regardless of pilot_mode.
 */
export default function FieldTestDebriefSection({
  meetingId,
  initialFieldTest,
}: {
  meetingId: string;
  initialFieldTest: FieldTestView;
}) {
  const [fieldTest, setFieldTest] = useState<FieldTestView>(initialFieldTest);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  async function save(overrides: Partial<FieldTestView> = {}) {
    setError(null);
    setStatus("saving");
    const next = { ...fieldTest, ...overrides };
    setFieldTest(next);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/field-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(next)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save field test");
      }
      const saved = result as FieldTest;
      setFieldTest({ ...saved });
      setStatus("saved");
      savedTimeoutRef.current = setTimeout(() => setStatus("idle"), SAVED_MESSAGE_MS);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save field test");
    }
  }

  const summary = computeFieldTestSummary(fieldTest);

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Field test debrief (internal)
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Facilitator-only. Evaluates whether DiscoveryOS actually helped in this real applied-AI
        discovery conversation. Never included in export/share output. See{" "}
        <code className="text-[11px]">docs/real-applied-ai-field-test-guide.md</code> for the full
        rubric and process.
      </p>

      {status === "saved" && <p className="mt-2 text-xs text-green-600 dark:text-green-400">Saved.</p>}
      {status === "error" && error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</label>
          <WriteSelect
            value={fieldTest.status}
            onChange={(e) => save({ status: e.target.value as FieldTestStatus })}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WriteSelect>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Selected scenario reference
          </label>
          <WriteInput
            value={fieldTest.selected_scenario_reference ?? ""}
            onChange={(e) => setFieldTest((f) => ({ ...f, selected_scenario_reference: e.target.value }))}
            onBlur={() => save({ selected_scenario_reference: fieldTest.selected_scenario_reference })}
            placeholder="e.g. SMB Lead Intake Triage Demo (as a template)"
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Test context</label>
        <WriteTextarea
          value={fieldTest.test_context ?? ""}
          onChange={(e) => setFieldTest((f) => ({ ...f, test_context: e.target.value }))}
          onBlur={() => save({ test_context: fieldTest.test_context })}
          placeholder="What real meeting is this? Internal ops conversation, freelance/client call, mock interview, etc."
          rows={2}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Facilitator goal</label>
        <WriteTextarea
          value={fieldTest.facilitator_goal ?? ""}
          onChange={(e) => setFieldTest((f) => ({ ...f, facilitator_goal: e.target.value }))}
          onBlur={() => save({ facilitator_goal: fieldTest.facilitator_goal })}
          placeholder="What are you personally trying to learn from running this field test?"
          rows={2}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <WriteInput
            type="checkbox"
            checked={fieldTest.participant_disclosure_used}
            onChange={(e) => save({ participant_disclosure_used: e.target.checked })}
          />
          Participant disclosure used
        </label>
        <label className="flex items-center gap-2 text-sm">
          <WriteInput
            type="checkbox"
            checked={fieldTest.live_capture_used}
            onChange={(e) => save({ live_capture_used: e.target.checked })}
          />
          Live capture used
        </label>
        <label className="flex items-center gap-2 text-sm">
          <WriteInput
            type="checkbox"
            checked={fieldTest.manual_transcript_used}
            onChange={(e) => save({ manual_transcript_used: e.target.checked })}
          />
          Manual transcript used
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Facilitator notes
          </label>
          <WriteTextarea
            value={fieldTest.facilitator_notes ?? ""}
            onChange={(e) => setFieldTest((f) => ({ ...f, facilitator_notes: e.target.value }))}
            onBlur={() => save({ facilitator_notes: fieldTest.facilitator_notes })}
            rows={3}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Observer notes</label>
          <WriteTextarea
            value={fieldTest.observer_notes ?? ""}
            onChange={(e) => setFieldTest((f) => ({ ...f, observer_notes: e.target.value }))}
            onBlur={() => save({ observer_notes: fieldTest.observer_notes })}
            rows={3}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Debrief notes</label>
        <WriteTextarea
          value={fieldTest.debrief_notes ?? ""}
          onChange={(e) => setFieldTest((f) => ({ ...f, debrief_notes: e.target.value }))}
          onBlur={() => save({ debrief_notes: fieldTest.debrief_notes })}
          placeholder="What did DiscoveryOS catch that you may have missed? What was distracting/generic/wrong?"
          rows={3}
          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>

      <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Scoring rubric (1-5)
        </h3>
        <p className="mt-1 text-[11px] text-neutral-400">
          1 = harmful/confusing · 2 = mostly not useful · 3 = mixed but promising · 4 = useful with
          minor issues · 5 = clearly useful
        </p>
        <div className="mt-2 space-y-1.5">
          {SCORE_ROWS.map((row) => (
            <div key={row.field} className="flex items-center justify-between gap-3 text-sm">
              <span>{row.label}</span>
              <ScoreSelect
                value={fieldTest[row.field]}
                onChange={(next) => save({ [row.field]: next } as Partial<FieldTestView>)}
              />
            </div>
          ))}
        </div>
        {summary.averageScore !== null && (
          <p className="mt-2 text-xs text-neutral-500">
            Average of {summary.scoredCount}/7 scores: {summary.averageScore.toFixed(1)}
          </p>
        )}
      </div>

      {/* Sprint 32 Part E: only relevant for remote calls - kept as its own optional block rather than mixed into the 7-question rubric above, since in-person field tests will simply leave this blank. See docs/remote-conversation-capture-guide.md's scoring section. */}
      <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Capture quality (remote calls)
        </h3>
        <p className="mt-1 text-[11px] text-neutral-400">
          Only relevant if this was a remote call - leave blank for in-person field tests. Pre-call
          setup lives on the{" "}
          <Link href={`/meetings/${meetingId}/live`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Live page&apos;s Remote capture setup panel
          </Link>
          . See <code className="text-[11px]">docs/remote-conversation-capture-guide.md</code>.
        </p>
        <div className="mt-2 space-y-1.5">
          {CAPTURE_SCORE_ROWS.map((row) => (
            <div key={row.field} className="flex items-center justify-between gap-3 text-sm">
              <span>{row.label}</span>
              <ScoreSelect
                value={fieldTest[row.field]}
                onChange={(next) => save({ [row.field]: next } as Partial<FieldTestView>)}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Manual notes needed
            </label>
            <WriteSelect
              value={fieldTest.manual_notes_needed ?? ""}
              onChange={(e) =>
                save({ manual_notes_needed: (e.target.value || null) as ManualNotesNeededLevel | null })
              }
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">—</option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WriteSelect>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              HUD distraction level
            </label>
            <WriteSelect
              value={fieldTest.hud_distraction_level ?? ""}
              onChange={(e) =>
                save({ hud_distraction_level: (e.target.value || null) as HudDistractionLevel | null })
              }
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">—</option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WriteSelect>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Capture setup used
            </label>
            <WriteSelect
              value={fieldTest.capture_setup_used ?? ""}
              onChange={(e) =>
                save({ capture_setup_used: (e.target.value || null) as RemoteCaptureSetup | null })
              }
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              <option value="">—</option>
              {CAPTURE_SETUP_USED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WriteSelect>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Success decision
          </label>
          <WriteSelect
            value={fieldTest.success_decision ?? ""}
            onChange={(e) => save({ success_decision: (e.target.value || null) as FieldTestSuccessDecision | null })}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          >
            <option value="">Not decided yet</option>
            {SUCCESS_DECISION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WriteSelect>
          {fieldTest.success_decision && (
            <p className="mt-1 text-[11px] text-neutral-400">
              {SUCCESS_DECISION_OPTIONS.find((o) => o.value === fieldTest.success_decision)?.helper}
            </p>
          )}
          {summary.needsNextIteration && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              Flagged as needing another iteration before the next field test.
            </p>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Next iteration notes
          </label>
          <WriteTextarea
            value={fieldTest.next_iteration_notes ?? ""}
            onChange={(e) => setFieldTest((f) => ({ ...f, next_iteration_notes: e.target.value }))}
            onBlur={() => save({ next_iteration_notes: fieldTest.next_iteration_notes })}
            placeholder="What should change before the next field test?"
            rows={2}
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </div>
      </div>
    </section>
  );
}

"use client";

import { WriteButton } from "@/app/RoleControls";

import { Fragment, useState } from "react";
import type { WorkflowView } from "@/lib/services/workflows";
import type {
  AmbiguityFlag,
  ContradictionCandidate,
  ThreadPriority,
  TranscriptSegment,
  WorkflowComponent,
  WorkflowGap,
  WorkflowStep,
} from "@/lib/types/database";
import EvidenceDrawer, { EvidenceBadge, type EvidenceSelection } from "../live/EvidenceDrawer";
import { ConfidenceBadge, LockedBadge, SourceOriginBadge, VerifiedBadge } from "../WorkflowBadges";

function ArrowDown() {
  return (
    <div aria-hidden className="text-lg leading-none text-neutral-300 dark:text-neutral-700">
      ↓
    </div>
  );
}

function FlowMarker({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-neutral-300 bg-neutral-50 px-4 py-1 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950">
      {children}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: ThreadPriority }) {
  const styles: Record<ThreadPriority, string> = {
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

function AmbiguityStatusBadge({ status }: { status: AmbiguityFlag["status"] }) {
  const styles: Record<AmbiguityFlag["status"], string> = {
    open: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    resolved: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    dismissed: "border-neutral-300 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900",
  };
  const labels: Record<AmbiguityFlag["status"], string> = {
    open: "Needs clarification",
    resolved: "Resolved",
    dismissed: "Dismissed",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

/** Severity uses the same low/medium/high/critical scale as ThreadPriority, so it reuses PriorityBadge's styling rather than duplicating it. */
function SeverityBadge({ severity }: { severity: ContradictionCandidate["severity"] }) {
  return <PriorityBadge priority={severity} />;
}

/**
 * Status uses the same open/resolved/dismissed scale and colors as
 * AmbiguityFlag, but its own label text - reusing AmbiguityStatusBadge's
 * "Needs clarification" open-label here would read as a duplicate of the
 * separate "Needs clarification" (ambiguity flags) section above, so this
 * one says "Open" instead.
 */
function ClarificationStatusBadge({ status }: { status: ContradictionCandidate["status"] }) {
  const styles: Record<ContradictionCandidate["status"], string> = {
    open: "border-neutral-300 text-neutral-500 dark:border-neutral-700",
    resolved: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400",
    dismissed: "border-neutral-300 bg-neutral-50 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900",
  };
  const labels: Record<ContradictionCandidate["status"], string> = {
    open: "Open",
    resolved: "Resolved",
    dismissed: "Dismissed",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function contradictionTypeLabel(type: ContradictionCandidate["contradiction_type"]): string {
  return type.replace(/_/g, " ");
}

export default function WorkflowDiagram({
  meetingId,
  workflow,
  evidenceTranscriptSegments,
  initialAmbiguityFlags,
  initialContradictionCandidates,
}: {
  meetingId: string;
  workflow: WorkflowView | null;
  evidenceTranscriptSegments: Record<string, TranscriptSegment>;
  initialAmbiguityFlags: AmbiguityFlag[];
  initialContradictionCandidates: ContradictionCandidate[];
}) {
  const [selection, setSelection] = useState<EvidenceSelection | null>(null);
  const [ambiguityFlags, setAmbiguityFlags] = useState<AmbiguityFlag[]>(initialAmbiguityFlags);
  const [pendingFlagId, setPendingFlagId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [contradictionCandidates, setContradictionCandidates] = useState<ContradictionCandidate[]>(
    initialContradictionCandidates
  );
  const [pendingCandidateId, setPendingCandidateId] = useState<string | null>(null);
  const [candidateActionError, setCandidateActionError] = useState<string | null>(null);

  function segmentFor(id: string | null): TranscriptSegment | null {
    return id ? evidenceTranscriptSegments[id] ?? null : null;
  }

  function viewStepEvidence(step: WorkflowStep) {
    setSelection({
      title: step.title,
      kind: "step",
      evidenceType: step.evidence_type,
      confidenceLevel: step.confidence_level,
      confidenceReason: step.confidence_reason,
      sourceQuote: step.source_quote,
      segment: segmentFor(step.source_transcript_segment_id),
      sourceOrigin: step.source_origin,
      humanVerified: step.human_verified,
      lockedByUser: step.locked_by_user,
      humanNote: step.human_note,
    });
  }

  function viewComponentEvidence(component: WorkflowComponent) {
    setSelection({
      title: component.label,
      kind: "component",
      evidenceType: component.evidence_type,
      confidenceLevel: component.confidence_level,
      confidenceReason: component.confidence_reason,
      sourceQuote: component.source_quote,
      segment: segmentFor(component.source_transcript_segment_id),
      sourceOrigin: component.source_origin,
      humanVerified: component.human_verified,
      lockedByUser: component.locked_by_user,
      humanNote: component.human_note,
    });
  }

  function viewGapEvidence(gap: WorkflowGap) {
    setSelection({
      title: gap.label,
      kind: "gap",
      evidenceType: gap.evidence_type,
      confidenceLevel: null,
      confidenceReason: gap.confidence_reason,
      sourceQuote: gap.source_quote,
      segment: segmentFor(gap.source_transcript_segment_id),
      sourceOrigin: gap.source_origin,
      humanVerified: gap.human_verified,
      lockedByUser: gap.locked_by_user,
      humanNote: gap.human_note,
    });
  }

  async function runAmbiguityAction(flagId: string, action: "resolve" | "dismiss") {
    setActionError(null);
    setPendingFlagId(flagId);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/ambiguity-flags/${flagId}/${action}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Action failed");
      }
      setAmbiguityFlags(result.ambiguityFlags as AmbiguityFlag[]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingFlagId(null);
    }
  }

  async function runContradictionAction(candidateId: string, action: "resolve" | "dismiss") {
    setCandidateActionError(null);
    setPendingCandidateId(candidateId);
    try {
      const response = await fetch(
        `/api/meetings/${meetingId}/contradiction-candidates/${candidateId}/${action}`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Action failed");
      }
      setContradictionCandidates(result.contradictionCandidates as ContradictionCandidate[]);
    } catch (err) {
      setCandidateActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingCandidateId(null);
    }
  }

  if (!workflow) {
    return (
      <p className="rounded border border-neutral-200 bg-white p-4 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        Process details will appear after the conversation reveals workflow steps. Add a
        transcript segment or use live capture on the Live page to start.
      </p>
    );
  }

  const actors = workflow.components.filter((c) => c.component_type === "actor");
  const systems = workflow.components.filter((c) => c.component_type === "system");
  const openGaps = workflow.gaps.filter((g) => g.gap_status === "open");
  const openAmbiguities = ambiguityFlags.filter((f) => f.status === "open");
  const resolvedAmbiguities = ambiguityFlags.filter((f) => f.status !== "open");
  const openContradictionCandidates = contradictionCandidates.filter((c) => c.status === "open");
  const resolvedContradictionCandidates = contradictionCandidates.filter((c) => c.status !== "open");

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Process flow
          </h2>
          {workflow.steps.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">No steps identified yet.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2">
              <FlowMarker>Start</FlowMarker>
              <ArrowDown />
              {workflow.steps.map((step, index) => (
                <Fragment key={step.id}>
                  <div className="w-full max-w-md rounded border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {index + 1}. {step.title}
                      </span>
                      <ConfidenceBadge level={step.confidence_level} />
                      <EvidenceBadge evidenceType={step.evidence_type} />
                      <SourceOriginBadge sourceOrigin={step.source_origin} />
                      {step.human_verified && <VerifiedBadge />}
                      {step.locked_by_user && <LockedBadge />}
                    </div>
                    {step.description && (
                      <p className="mt-1 text-xs text-neutral-500">{step.description}</p>
                    )}
                    <button
                      onClick={() => viewStepEvidence(step)}
                      className="mt-2 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      View evidence
                    </button>
                  </div>
                  <ArrowDown />
                </Fragment>
              ))}
              <FlowMarker>Still unclear ({openGaps.length})</FlowMarker>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Actors</h3>
            {actors.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {actors.map((actor) => (
                  <li key={actor.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{actor.label}</span>
                      <EvidenceBadge evidenceType={actor.evidence_type} />
                      {actor.human_verified && <VerifiedBadge />}
                      {actor.locked_by_user && <LockedBadge />}
                    </div>
                    <button
                      onClick={() => viewComponentEvidence(actor)}
                      className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      View evidence
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">None identified yet.</p>
            )}
          </section>

          <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Systems / tools
            </h3>
            {systems.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {systems.map((system) => (
                  <li key={system.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{system.label}</span>
                      <EvidenceBadge evidenceType={system.evidence_type} />
                      {system.human_verified && <VerifiedBadge />}
                      {system.locked_by_user && <LockedBadge />}
                    </div>
                    <button
                      onClick={() => viewComponentEvidence(system)}
                      className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      View evidence
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">
                None named yet - generic queues/processes don&apos;t count until a concrete tool
                is named.
              </p>
            )}
          </section>

          <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Still unclear
            </h3>
            {openGaps.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {openGaps.map((gap) => (
                  <li key={gap.id} className="text-xs">
                    <span className="font-medium">{gap.label}</span>
                    {gap.description && <p className="mt-0.5 text-neutral-500">{gap.description}</p>}
                    <button
                      onClick={() => viewGapEvidence(gap)}
                      className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      View evidence
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-neutral-400">No open gaps yet.</p>
            )}
          </section>
        </aside>
      </div>

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Needs clarification
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Fuzzy language, informal terms, or unclear ownership/criteria noticed in the
          transcript - potential follow-ups, not contradictions or alerts.
        </p>

        {actionError && (
          <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {actionError}
          </p>
        )}

        {openAmbiguities.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {openAmbiguities.map((flag) => (
              <li key={flag.id} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{flag.label}</span>
                  <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                    {flag.ambiguity_type.replace(/_/g, " ")}
                  </span>
                  <PriorityBadge priority={flag.priority} />
                  <AmbiguityStatusBadge status={flag.status} />
                </div>
                {flag.description && <p className="mt-0.5 text-neutral-500">{flag.description}</p>}
                {flag.source_quote && (
                  <p className="mt-0.5 italic text-neutral-500">&ldquo;{flag.source_quote}&rdquo;</p>
                )}
                <div className="mt-1 flex flex-wrap gap-3">
                  <WriteButton
                    onClick={() => runAmbiguityAction(flag.id, "resolve")}
                    disabled={pendingFlagId !== null}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
                  >
                    {pendingFlagId === flag.id ? "Saving..." : "Mark resolved"}
                  </WriteButton>
                  <WriteButton
                    onClick={() => runAmbiguityAction(flag.id, "dismiss")}
                    disabled={pendingFlagId !== null}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
                  >
                    {pendingFlagId === flag.id ? "Saving..." : "Dismiss"}
                  </WriteButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-neutral-400">No clarification needs found yet.</p>
        )}

        {resolvedAmbiguities.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer font-semibold uppercase tracking-wide text-neutral-500">
              Resolved / dismissed ({resolvedAmbiguities.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {resolvedAmbiguities.map((flag) => (
                <li key={flag.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{flag.label}</span>
                    <AmbiguityStatusBadge status={flag.status} />
                  </div>
                  {flag.description && <p className="mt-0.5 text-neutral-500">{flag.description}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Possible mismatches
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Two separately-evidenced claims that may be in tension - shown as calm clarification
          needs, never as alerts or accusations. Most conflicts should be treated as ambiguity
          until confirmed.
        </p>

        {candidateActionError && (
          <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {candidateActionError}
          </p>
        )}

        {openContradictionCandidates.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {openContradictionCandidates.map((candidate) => (
              <li key={candidate.id} className="rounded border border-neutral-200 p-3 text-xs dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{candidate.label}</span>
                  <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                    {contradictionTypeLabel(candidate.contradiction_type)}
                  </span>
                  <SeverityBadge severity={candidate.severity} />
                  <ClarificationStatusBadge status={candidate.status} />
                </div>
                {candidate.description && (
                  <p className="mt-1 text-neutral-500">{candidate.description}</p>
                )}

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      Claim A
                    </p>
                    <p className="mt-0.5">{candidate.claim_a}</p>
                    {candidate.source_quote_a && (
                      <p className="mt-0.5 italic text-neutral-500">
                        &ldquo;{candidate.source_quote_a}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                      Claim B
                    </p>
                    <p className="mt-0.5">{candidate.claim_b}</p>
                    {candidate.source_quote_b && (
                      <p className="mt-0.5 italic text-neutral-500">
                        &ldquo;{candidate.source_quote_b}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {candidate.suggested_clarification_question && (
                  <p className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-2 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
                    Suggested question: {candidate.suggested_clarification_question}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap gap-3">
                  <WriteButton
                    onClick={() => runContradictionAction(candidate.id, "resolve")}
                    disabled={pendingCandidateId !== null}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
                  >
                    {pendingCandidateId === candidate.id ? "Saving..." : "Mark resolved"}
                  </WriteButton>
                  <WriteButton
                    onClick={() => runContradictionAction(candidate.id, "dismiss")}
                    disabled={pendingCandidateId !== null}
                    className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
                  >
                    {pendingCandidateId === candidate.id ? "Saving..." : "Dismiss"}
                  </WriteButton>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-neutral-400">No evidence-backed mismatches found yet.</p>
        )}

        {resolvedContradictionCandidates.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer font-semibold uppercase tracking-wide text-neutral-500">
              Resolved mismatches ({resolvedContradictionCandidates.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {resolvedContradictionCandidates.map((candidate) => (
                <li key={candidate.id} className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{candidate.label}</span>
                    <ClarificationStatusBadge status={candidate.status} />
                  </div>
                  {candidate.description && (
                    <p className="mt-0.5 text-neutral-500">{candidate.description}</p>
                  )}
                  {candidate.resolution_note && (
                    <p className="mt-0.5 text-neutral-500">Note: {candidate.resolution_note}</p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <EvidenceDrawer selection={selection} onClose={() => setSelection(null)} />
    </div>
  );
}

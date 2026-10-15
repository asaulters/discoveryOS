"use client";

import { WriteButton } from "@/app/RoleControls";

import { useState } from "react";
import Link from "next/link";
import type { HudState } from "@/lib/services/hudState";
import type { WorkflowItemType, WorkflowView } from "@/lib/services/workflows";
import type {
  TranscriptSegment,
  WorkflowComponent,
  WorkflowGap,
  WorkflowSourceOrigin,
  WorkflowStep,
} from "@/lib/types/database";
import EvidenceDrawer, {
  EvidenceBadge,
  type EvidenceSelection,
} from "./EvidenceDrawer";
import WorkflowItemEditModal, {
  type EditableWorkflowItem,
  type WorkflowItemEditPatch,
} from "./WorkflowItemEditModal";
import {
  ConfidenceBadge,
  componentTypeLabel,
  GapStatusBadge,
  LockedBadge,
  SourceOriginBadge,
  VerifiedBadge,
} from "../WorkflowBadges";

const ITEM_TYPE_PATH: Record<WorkflowItemType, string> = {
  step: "steps",
  component: "components",
  gap: "gaps",
};

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * Deterministic, UI-only "current model state" line derived directly from
 * the structured child rows - never from the model's own known_summary/
 * unknown_summary prose, which can lag behind reconciliation on a
 * long-running meeting (see the AI summary section below, which is where
 * that prose still lives, de-emphasized). This line can't drift out of
 * sync with what's actually on screen because it's computed from the same
 * data the lists below render.
 */
function deriveCurrentModelStateSummary(workflow: WorkflowView): string {
  const actorCount = workflow.components.filter(
    (c) => c.component_type === "actor",
  ).length;
  const systemCount = workflow.components.filter(
    (c) => c.component_type === "system",
  ).length;
  const openGapCount = workflow.gaps.filter(
    (g) => g.gap_status === "open",
  ).length;
  const resolvedGapCount = workflow.gaps.length - openGapCount;

  const componentDetail =
    workflow.components.length > 0
      ? ` (${pluralize(actorCount, "actor")}, ${pluralize(systemCount, "system")})`
      : "";
  const resolvedDetail =
    resolvedGapCount > 0
      ? `, ${pluralize(resolvedGapCount, "resolved unclear point")}`
      : "";

  return `Current model: ${pluralize(workflow.steps.length, "step")}, ${pluralize(workflow.components.length, "component")}${componentDetail}, ${pluralize(openGapCount, "still-unclear point")}${resolvedDetail}.`;
}

function SourceQuote({ quote }: { quote: string | null }) {
  if (!quote) return null;
  return (
    <p className="mt-0.5 italic text-neutral-500">&ldquo;{quote}&rdquo;</p>
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
  readOnly = false,
}: {
  readOnly?: boolean;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const Button = readOnly ? "button" : WriteButton;
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50 dark:hover:text-neutral-100"
    >
      {children}
    </Button>
  );
}

interface WorkflowItemBase {
  id: string;
  evidence_type: WorkflowStep["evidence_type"];
  source_quote: string | null;
  source_transcript_segment_id: string | null;
  confidence_reason: string;
  source_origin: WorkflowSourceOrigin;
  human_verified: boolean;
  human_note: string | null;
  locked_by_user: boolean;
}

export default function WorkflowPanel({
  meetingId,
  workflow,
  warning,
  openContradictionCount,
  evidenceTranscriptSegments,
  onUpdated,
}: {
  meetingId: string;
  workflow: WorkflowView | null;
  warning?: string | null;
  openContradictionCount?: number;
  evidenceTranscriptSegments: Record<string, TranscriptSegment>;
  onUpdated: (hudState: HudState) => void;
}) {
  const [selection, setSelection] = useState<EvidenceSelection | null>(null);
  const [editItem, setEditItem] = useState<EditableWorkflowItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Sprint 30 Part A/G: the Live HUD wants "Process so far" as a compact
  // preview, not the primary surface - collapsed by default here, with
  // just a one-line summary and a calm "N need clarification" count
  // always visible. The full step/component/gap detail (and all of its
  // edit/lock/verify actions) is exactly what it always was, just tucked
  // behind this toggle instead of always rendered.
  const [expanded, setExpanded] = useState(false);

  function segmentFor(id: string | null): TranscriptSegment | null {
    return id ? (evidenceTranscriptSegments[id] ?? null) : null;
  }

  function viewEvidence(
    title: string,
    kind: EvidenceSelection["kind"],
    confidenceLevel: EvidenceSelection["confidenceLevel"],
    item: WorkflowItemBase,
  ) {
    setSelection({
      title,
      kind,
      evidenceType: item.evidence_type,
      confidenceLevel,
      confidenceReason: item.confidence_reason,
      sourceQuote: item.source_quote,
      segment: segmentFor(item.source_transcript_segment_id),
      sourceOrigin: item.source_origin,
      humanVerified: item.human_verified,
      lockedByUser: item.locked_by_user,
      humanNote: item.human_note,
    });
  }

  async function runAction(key: string, path: string) {
    setActionError(null);
    setPendingKey(key);
    try {
      const response = await fetch(path, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Action failed");
      }
      onUpdated(result as HudState);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingKey(null);
    }
  }

  function verifyItem(itemType: WorkflowItemType, itemId: string) {
    runAction(
      `verify:${itemType}:${itemId}`,
      `/api/meetings/${meetingId}/workflow/${ITEM_TYPE_PATH[itemType]}/${itemId}/verify`,
    );
  }

  function toggleLock(
    itemType: WorkflowItemType,
    itemId: string,
    currentlyLocked: boolean,
  ) {
    const action = currentlyLocked ? "unlock" : "lock";
    runAction(
      `${action}:${itemType}:${itemId}`,
      `/api/meetings/${meetingId}/workflow/${ITEM_TYPE_PATH[itemType]}/${itemId}/${action}`,
    );
  }

  function markGapAnswered(gapId: string) {
    runAction(
      `answer:gap:${gapId}`,
      `/api/meetings/${meetingId}/workflow/gaps/${gapId}/mark-answered`,
    );
  }

  function dismissGap(gapId: string) {
    runAction(
      `dismiss:gap:${gapId}`,
      `/api/meetings/${meetingId}/workflow/gaps/${gapId}/dismiss`,
    );
  }

  function openEdit(item: EditableWorkflowItem) {
    setEditError(null);
    setEditItem(item);
  }

  async function handleEditSave(patch: WorkflowItemEditPatch) {
    if (!editItem) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const bodyKey = editItem.itemType === "step" ? "title" : "label";
      const response = await fetch(
        `/api/meetings/${meetingId}/workflow/${ITEM_TYPE_PATH[editItem.itemType]}/${editItem.itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [bodyKey]: patch.text,
            description: patch.description,
            humanNote: patch.humanNote,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to save edit");
      }
      onUpdated(result as HudState);
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save edit");
    } finally {
      setEditSaving(false);
    }
  }

  const disabled = pendingKey !== null;

  const openGaps = workflow?.gaps.filter((g) => g.gap_status === "open") ?? [];
  const resolvedGaps =
    workflow?.gaps.filter((g) => g.gap_status !== "open") ?? [];

  function renderGapItem(gap: WorkflowGap) {
    return (
      <li key={gap.id} className="text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{gap.label}</span>
          <EvidenceBadge evidenceType={gap.evidence_type} />
          <SourceOriginBadge sourceOrigin={gap.source_origin} />
          {gap.human_verified && <VerifiedBadge />}
          {gap.locked_by_user && <LockedBadge />}
          {gap.gap_status !== "open" && (
            <GapStatusBadge status={gap.gap_status} />
          )}
        </div>
        {gap.description && (
          <p className="mt-0.5 text-neutral-500">{gap.description}</p>
        )}
        <SourceQuote quote={gap.source_quote} />
        {gap.human_note && (
          <p className="mt-0.5 text-neutral-500">Note: {gap.human_note}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-3">
          <ActionButton readOnly
            disabled={disabled}
            onClick={() => viewEvidence(gap.label, "gap", null, gap)}
          >
            View evidence
          </ActionButton>
          <ActionButton
            disabled={disabled}
            onClick={() =>
              openEdit({
                itemType: "gap",
                itemId: gap.id,
                textFieldLabel: "Label",
                text: gap.label,
                description: gap.description,
                humanNote: gap.human_note,
              })
            }
          >
            Edit
          </ActionButton>
          {!gap.human_verified && (
            <ActionButton
              disabled={disabled}
              onClick={() => verifyItem("gap", gap.id)}
            >
              {pendingKey === `verify:gap:${gap.id}`
                ? "Verifying..."
                : "Mark verified"}
            </ActionButton>
          )}
          <ActionButton
            disabled={disabled}
            onClick={() => toggleLock("gap", gap.id, gap.locked_by_user)}
          >
            {pendingKey === `lock:gap:${gap.id}` ||
            pendingKey === `unlock:gap:${gap.id}`
              ? "Saving..."
              : gap.locked_by_user
                ? "Unlock"
                : "Lock"}
          </ActionButton>
          {gap.gap_status === "open" && (
            <>
              <ActionButton
                disabled={disabled}
                onClick={() => markGapAnswered(gap.id)}
              >
                {pendingKey === `answer:gap:${gap.id}`
                  ? "Saving..."
                  : "Mark answered"}
              </ActionButton>
              <ActionButton
                disabled={disabled}
                onClick={() => dismissGap(gap.id)}
              >
                {pendingKey === `dismiss:gap:${gap.id}`
                  ? "Saving..."
                  : "Dismiss"}
              </ActionButton>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <section className="rounded border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Process so far
        </h2>
        {!!openContradictionCount && openContradictionCount > 0 && (
          <Link
            href={`/meetings/${meetingId}/workflow`}
            className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400"
            title="Soft, evidence-linked possible mismatches - not alerts. See the Workflow page for detail."
          >
            {openContradictionCount} possible{" "}
            {openContradictionCount === 1 ? "mismatch" : "mismatches"}
          </Link>
        )}
      </div>

      {warning && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Workflow extraction had an issue on the latest chunk: {warning}
        </p>
      )}

      {actionError && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {actionError}
        </p>
      )}

      {!workflow ? (
        <p className="mt-3 text-sm text-neutral-400">
          Process details will appear after the conversation reveals workflow
          steps.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{workflow.workflow.name}</h3>
            <ConfidenceBadge level={workflow.workflow.confidence_level} />
          </div>

          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {deriveCurrentModelStateSummary(workflow)}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {openGaps.length > 0 && (
              <span
                className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                title="Calm, non-alarming count of open unknowns - see below for detail."
              >
                {openGaps.length} need clarification
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {expanded ? "Hide process details" : "Show process details"}
            </button>
          </div>

          {expanded && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-400">
                Structured items are interpretations grounded in transcript
                evidence. Transcript text remains the source of truth.
              </p>

              {(workflow.workflow.known_summary ||
                workflow.workflow.unknown_summary) && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold uppercase tracking-wide text-neutral-500">
                    AI summary
                  </summary>
                  <div className="mt-2 space-y-2">
                    {workflow.workflow.known_summary && (
                      <p className="text-neutral-600 dark:text-neutral-400">
                        {workflow.workflow.known_summary}
                      </p>
                    )}
                    {workflow.workflow.unknown_summary && (
                      <p className="italic text-neutral-500">
                        Still unknown: {workflow.workflow.unknown_summary}
                      </p>
                    )}
                  </div>
                </details>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Known steps
                </h4>
                {workflow.steps.length > 0 ? (
                  <ol className="mt-2 space-y-1.5">
                    {workflow.steps.map((step: WorkflowStep, index: number) => (
                      <li key={step.id} className="text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {index + 1}. {step.title}
                          </span>
                          <ConfidenceBadge level={step.confidence_level} />
                          <EvidenceBadge evidenceType={step.evidence_type} />
                          <SourceOriginBadge
                            sourceOrigin={step.source_origin}
                          />
                          {step.human_verified && <VerifiedBadge />}
                          {step.locked_by_user && <LockedBadge />}
                        </div>
                        {step.description && (
                          <p className="mt-0.5 text-neutral-500">
                            {step.description}
                          </p>
                        )}
                        <SourceQuote quote={step.source_quote} />
                        {step.human_note && (
                          <p className="mt-0.5 text-neutral-500">
                            Note: {step.human_note}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-3">
                          <ActionButton readOnly
                            disabled={disabled}
                            onClick={() =>
                              viewEvidence(
                                step.title,
                                "step",
                                step.confidence_level,
                                step,
                              )
                            }
                          >
                            View evidence
                          </ActionButton>
                          <ActionButton
                            disabled={disabled}
                            onClick={() =>
                              openEdit({
                                itemType: "step",
                                itemId: step.id,
                                textFieldLabel: "Title",
                                text: step.title,
                                description: step.description,
                                humanNote: step.human_note,
                              })
                            }
                          >
                            Edit
                          </ActionButton>
                          {!step.human_verified && (
                            <ActionButton
                              disabled={disabled}
                              onClick={() => verifyItem("step", step.id)}
                            >
                              {pendingKey === `verify:step:${step.id}`
                                ? "Verifying..."
                                : "Mark verified"}
                            </ActionButton>
                          )}
                          <ActionButton
                            disabled={disabled}
                            onClick={() =>
                              toggleLock("step", step.id, step.locked_by_user)
                            }
                          >
                            {pendingKey === `lock:step:${step.id}` ||
                            pendingKey === `unlock:step:${step.id}`
                              ? "Saving..."
                              : step.locked_by_user
                                ? "Unlock"
                                : "Lock"}
                          </ActionButton>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">
                    No steps identified yet.
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Key components
                </h4>
                {workflow.components.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {workflow.components.map((component: WorkflowComponent) => (
                      <li key={component.id} className="text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-700">
                            {componentTypeLabel(component.component_type)}
                          </span>
                          <span className="font-medium">{component.label}</span>
                          <ConfidenceBadge level={component.confidence_level} />
                          <EvidenceBadge
                            evidenceType={component.evidence_type}
                          />
                          <SourceOriginBadge
                            sourceOrigin={component.source_origin}
                          />
                          {component.human_verified && <VerifiedBadge />}
                          {component.locked_by_user && <LockedBadge />}
                        </div>
                        {component.description && (
                          <p className="mt-0.5 text-neutral-500">
                            {component.description}
                          </p>
                        )}
                        <SourceQuote quote={component.source_quote} />
                        {component.human_note && (
                          <p className="mt-0.5 text-neutral-500">
                            Note: {component.human_note}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-3">
                          <ActionButton readOnly
                            disabled={disabled}
                            onClick={() =>
                              viewEvidence(
                                component.label,
                                "component",
                                component.confidence_level,
                                component,
                              )
                            }
                          >
                            View evidence
                          </ActionButton>
                          <ActionButton
                            disabled={disabled}
                            onClick={() =>
                              openEdit({
                                itemType: "component",
                                itemId: component.id,
                                textFieldLabel: "Label",
                                text: component.label,
                                description: component.description,
                                humanNote: component.human_note,
                              })
                            }
                          >
                            Edit
                          </ActionButton>
                          {!component.human_verified && (
                            <ActionButton
                              disabled={disabled}
                              onClick={() =>
                                verifyItem("component", component.id)
                              }
                            >
                              {pendingKey === `verify:component:${component.id}`
                                ? "Verifying..."
                                : "Mark verified"}
                            </ActionButton>
                          )}
                          <ActionButton
                            disabled={disabled}
                            onClick={() =>
                              toggleLock(
                                "component",
                                component.id,
                                component.locked_by_user,
                              )
                            }
                          >
                            {pendingKey === `lock:component:${component.id}` ||
                            pendingKey === `unlock:component:${component.id}`
                              ? "Saving..."
                              : component.locked_by_user
                                ? "Unlock"
                                : "Lock"}
                          </ActionButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">
                    No components identified yet.
                  </p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Needs clarification
                </h4>
                {openGaps.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {openGaps.map((gap) => renderGapItem(gap))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">
                    Nothing needs clarification yet.
                  </p>
                )}
              </div>

              {resolvedGaps.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Resolved ({resolvedGaps.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {resolvedGaps.map((gap) => renderGapItem(gap))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <EvidenceDrawer
        selection={selection}
        onClose={() => setSelection(null)}
      />

      {editItem && (
        <WorkflowItemEditModal
          key={editItem.itemId}
          item={editItem}
          saving={editSaving}
          error={editError}
          onSave={handleEditSave}
          onCancel={() => setEditItem(null)}
        />
      )}
    </section>
  );
}

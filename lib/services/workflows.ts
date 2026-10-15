import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isConfidenceDowngrade } from "@/lib/confidence";
import type {
  ConfidenceLevel,
  EvidenceType,
  Workflow,
  WorkflowComponent,
  WorkflowComponentType,
  WorkflowGap,
  WorkflowGapStatus,
  WorkflowSourceOrigin,
  WorkflowStep,
} from "@/lib/types/database";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

const EVIDENCE_STRENGTH: Record<EvidenceType, number> = { unknown: 0, inferred: 1, known: 2 };

export interface EvidenceDraft {
  sourceTranscriptSegmentId: string | null;
  sourceQuote: string | null;
  evidenceType: EvidenceType;
  confidenceReason: string;
}

interface EvidenceRow {
  source_transcript_segment_id: string | null;
  source_quote: string | null;
  evidence_type: EvidenceType;
  confidence_reason: string;
}

/**
 * Simple evidence-strength precedence: known beats inferred beats unknown.
 * A later extraction run's weaker evidence for an already-reconciled item
 * must never downgrade or overwrite stronger evidence a prior run already
 * established - only evidence at least as strong replaces it (so a fresher
 * citation of the same strength can still refresh the quote/reason).
 */
function pickEvidence(existing: EvidenceRow, draft: EvidenceDraft): EvidenceRow {
  if (EVIDENCE_STRENGTH[draft.evidenceType] >= EVIDENCE_STRENGTH[existing.evidence_type]) {
    return {
      source_transcript_segment_id: draft.sourceTranscriptSegmentId,
      source_quote: draft.sourceQuote,
      evidence_type: draft.evidenceType,
      confidence_reason: draft.confidenceReason,
    };
  }
  return existing;
}

interface EditMetaRow {
  source_origin: WorkflowSourceOrigin;
  locked_by_user: boolean;
}

/**
 * Sprint 6 human-correction guardrail: once a human has touched an item's
 * text (source_origin no longer 'ai') or explicitly locked it, the AI may
 * keep enriching its evidence (see pickEvidence, which is independent of
 * this) but must never overwrite its title/label/description again.
 * Locking is an orthogonal, explicit "freeze this" action a user can apply
 * even without editing text; either condition is enough to protect it.
 */
function protectsHumanText(existing: EditMetaRow): boolean {
  return existing.locked_by_user || existing.source_origin !== "ai";
}

/**
 * A later AI run must never lower the ordinal confidence of an item the
 * human has explicitly verified as accurate - it may still raise it (or
 * leave it as-is) if stronger evidence shows up.
 */
function pickConfidenceLevel(
  existing: { confidence_level: ConfidenceLevel; human_verified: boolean },
  draftLevel: ConfidenceLevel
): ConfidenceLevel {
  if (existing.human_verified && isConfidenceDowngrade(draftLevel, existing.confidence_level)) {
    return existing.confidence_level;
  }
  return draftLevel;
}

const FUZZY_PROTECTED_MATCH_THRESHOLD = 0.6;

function tokenize(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((token) => token.length > 2)
  );
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  return shared / Math.min(a.size, b.size);
}

function comparableText(title: string, description: string | null, quote: string | null): string {
  return [title, description ?? "", quote ?? ""].join(" ");
}

export interface DuplicateSuppressionNote {
  itemType: "step" | "component" | "gap";
  draftTitle: string;
  matchedId: string;
  matchedTitle: string;
  score: number;
}

/**
 * Fallback for when a draft's exact normalized title/label doesn't match
 * any existing row: a human renaming a step/component means the AI's next
 * proposal for "the same" real-world thing often won't normalize-match the
 * new title exactly, and without this an exact-match-only reconcile would
 * silently insert a confusing duplicate. Only ever applied against
 * protected (locked/human-edited) candidates, and only as a last resort
 * after the exact match fails - pure-AI items keep the original strict
 * matching untouched, so this doesn't loosen matching in general, only for
 * the case that actually causes duplicates (see the Sprint 6.5 fix).
 */
function findFuzzyProtectedMatch<T>(
  candidates: T[],
  getText: (item: T) => string,
  draftText: string
): { item: T; score: number } | null {
  const draftTokens = tokenize(draftText);
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = tokenOverlapRatio(draftTokens, tokenize(getText(candidate)));
    if (score >= FUZZY_PROTECTED_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item: candidate, score };
    }
  }
  return best;
}

export interface WorkflowView {
  workflow: Workflow;
  steps: WorkflowStep[];
  components: WorkflowComponent[];
  gaps: WorkflowGap[];
}

export async function getWorkflowForMeeting(meetingId: string): Promise<Workflow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load workflow: ${error.message}`);
  }

  return data;
}

export async function getWorkflowView(meetingId: string): Promise<WorkflowView | null> {
  const workflow = await getWorkflowForMeeting(meetingId);
  if (!workflow) {
    return null;
  }

  const supabase = await createServerSupabaseClient();

  const [
    { data: steps, error: stepsError },
    { data: components, error: componentsError },
    { data: gaps, error: gapsError },
  ] = await Promise.all([
    supabase
      .from("workflow_steps")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("workflow_components")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("component_type", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("workflow_gaps")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("created_at", { ascending: true }),
  ]);

  if (stepsError) {
    throw new Error(`Failed to load workflow steps: ${stepsError.message}`);
  }
  if (componentsError) {
    throw new Error(`Failed to load workflow components: ${componentsError.message}`);
  }
  if (gapsError) {
    throw new Error(`Failed to load workflow gaps: ${gapsError.message}`);
  }

  return {
    workflow,
    steps: steps ?? [],
    components: components ?? [],
    gaps: gaps ?? [],
  };
}

export interface WorkflowDraft {
  name: string;
  confidenceLevel: ConfidenceLevel;
  knownSummary: string;
  unknownSummary: string;
}

/** Persists the meeting's one primary workflow: updates it in place if it already exists, otherwise creates it. */
export async function upsertWorkflow(meetingId: string, draft: WorkflowDraft): Promise<Workflow> {
  const supabase = await createServerSupabaseClient();
  const existing = await getWorkflowForMeeting(meetingId);

  if (existing) {
    const { data, error } = await supabase
      .from("workflows")
      .update({
        name: draft.name,
        confidence_level: draft.confidenceLevel,
        known_summary: draft.knownSummary,
        unknown_summary: draft.unknownSummary,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update workflow: ${error?.message}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      meeting_id: meetingId,
      name: draft.name,
      confidence_level: draft.confidenceLevel,
      known_summary: draft.knownSummary,
      unknown_summary: draft.unknownSummary,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create workflow: ${error?.message}`);
  }
  return data;
}

export interface WorkflowStepDraft extends EvidenceDraft {
  title: string;
  description: string | null;
  confidenceLevel: ConfidenceLevel;
}

/**
 * Persists/updates workflow steps by normalized title - matched steps are
 * updated in place (description, confidence) but keep their original
 * position; new steps are appended in the order the extractor returned
 * them. Nothing is ever deleted, matching reconcileHypotheses/
 * reconcileInitialQueue elsewhere in the app.
 */
export async function reconcileWorkflowSteps(
  workflowId: string,
  drafts: WorkflowStepDraft[]
): Promise<DuplicateSuppressionNote[]> {
  const supabase = await createServerSupabaseClient();
  const suppressions: DuplicateSuppressionNote[] = [];

  const { data: existing, error: existingError } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId);

  if (existingError) {
    throw new Error(`Failed to load existing workflow steps: ${existingError.message}`);
  }

  const existingByNormalized = new Map((existing ?? []).map((s) => [s.normalized_title, s]));
  const protectedCandidates = (existing ?? []).filter(protectsHumanText);
  let nextSortOrder =
    (existing ?? []).reduce((max, s) => Math.max(max, s.sort_order), -1) + 1;

  for (const draft of drafts) {
    const normalizedTitle = normalize(draft.title);
    let match = existingByNormalized.get(normalizedTitle);

    if (!match) {
      const fuzzy = findFuzzyProtectedMatch(
        protectedCandidates,
        (s) => comparableText(s.title, s.description, s.source_quote),
        comparableText(draft.title, draft.description, draft.sourceQuote)
      );
      if (fuzzy) {
        match = fuzzy.item;
        suppressions.push({
          itemType: "step",
          draftTitle: draft.title,
          matchedId: fuzzy.item.id,
          matchedTitle: fuzzy.item.title,
          score: fuzzy.score,
        });
        console.info(
          `[workflow-reconcile] suppressed AI duplicate step "${draft.title}" - matched existing human-protected step "${fuzzy.item.title}" (id=${fuzzy.item.id}, score=${fuzzy.score.toFixed(2)})`
        );
      }
    }

    if (match) {
      const evidence = pickEvidence(match, draft);
      const confidenceLevel = pickConfidenceLevel(match, draft.confidenceLevel);
      const textFields = protectsHumanText(match)
        ? {}
        : { title: draft.title, description: draft.description };

      const { error } = await supabase
        .from("workflow_steps")
        .update({
          ...textFields,
          confidence_level: confidenceLevel,
          ...evidence,
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update workflow step: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("workflow_steps").insert({
      workflow_id: workflowId,
      title: draft.title,
      normalized_title: normalizedTitle,
      description: draft.description,
      confidence_level: draft.confidenceLevel,
      sort_order: nextSortOrder++,
      source_transcript_segment_id: draft.sourceTranscriptSegmentId,
      source_quote: draft.sourceQuote,
      evidence_type: draft.evidenceType,
      confidence_reason: draft.confidenceReason,
    });

    if (error) {
      throw new Error(`Failed to create workflow step: ${error.message}`);
    }
  }

  return suppressions;
}

export interface WorkflowComponentDraft extends EvidenceDraft {
  componentType: WorkflowComponentType;
  label: string;
  description: string | null;
  confidenceLevel: ConfidenceLevel;
}

/** Persists/updates workflow components by component_type + normalized label. Nothing is ever deleted. */
export async function reconcileWorkflowComponents(
  workflowId: string,
  drafts: WorkflowComponentDraft[]
): Promise<DuplicateSuppressionNote[]> {
  const supabase = await createServerSupabaseClient();
  const suppressions: DuplicateSuppressionNote[] = [];

  const { data: existing, error: existingError } = await supabase
    .from("workflow_components")
    .select("*")
    .eq("workflow_id", workflowId);

  if (existingError) {
    throw new Error(`Failed to load existing workflow components: ${existingError.message}`);
  }

  const existingByKey = new Map(
    (existing ?? []).map((c) => [`${c.component_type}::${c.normalized_label}`, c])
  );
  const protectedByType = new Map<WorkflowComponentType, WorkflowComponent[]>();
  for (const c of existing ?? []) {
    if (!protectsHumanText(c)) continue;
    const bucket = protectedByType.get(c.component_type) ?? [];
    bucket.push(c);
    protectedByType.set(c.component_type, bucket);
  }

  for (const draft of drafts) {
    const normalizedLabel = normalize(draft.label);
    const key = `${draft.componentType}::${normalizedLabel}`;
    let match = existingByKey.get(key);

    if (!match) {
      // Fuzzy fallback is gated on matching component_type too - similar
      // wording across two different types (e.g. an "actor" and a
      // "system") should never merge, only a same-typed near-miss should.
      const fuzzy = findFuzzyProtectedMatch(
        protectedByType.get(draft.componentType) ?? [],
        (c) => comparableText(c.label, c.description, c.source_quote),
        comparableText(draft.label, draft.description, draft.sourceQuote)
      );
      if (fuzzy) {
        match = fuzzy.item;
        suppressions.push({
          itemType: "component",
          draftTitle: draft.label,
          matchedId: fuzzy.item.id,
          matchedTitle: fuzzy.item.label,
          score: fuzzy.score,
        });
        console.info(
          `[workflow-reconcile] suppressed AI duplicate component "${draft.label}" - matched existing human-protected component "${fuzzy.item.label}" (id=${fuzzy.item.id}, score=${fuzzy.score.toFixed(2)})`
        );
      }
    }

    if (match) {
      const evidence = pickEvidence(match, draft);
      const confidenceLevel = pickConfidenceLevel(match, draft.confidenceLevel);
      const textFields = protectsHumanText(match)
        ? {}
        : { label: draft.label, description: draft.description };

      const { error } = await supabase
        .from("workflow_components")
        .update({
          ...textFields,
          confidence_level: confidenceLevel,
          ...evidence,
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update workflow component: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("workflow_components").insert({
      workflow_id: workflowId,
      component_type: draft.componentType,
      label: draft.label,
      normalized_label: normalizedLabel,
      description: draft.description,
      confidence_level: draft.confidenceLevel,
      source_transcript_segment_id: draft.sourceTranscriptSegmentId,
      source_quote: draft.sourceQuote,
      evidence_type: draft.evidenceType,
      confidence_reason: draft.confidenceReason,
    });

    if (error) {
      throw new Error(`Failed to create workflow component: ${error.message}`);
    }
  }

  return suppressions;
}

export interface WorkflowGapDraft extends EvidenceDraft {
  label: string;
  description: string | null;
}

/** Persists/updates workflow gaps by normalized label. Nothing is ever deleted. */
export async function reconcileWorkflowGaps(
  workflowId: string,
  drafts: WorkflowGapDraft[]
): Promise<DuplicateSuppressionNote[]> {
  const supabase = await createServerSupabaseClient();
  const suppressions: DuplicateSuppressionNote[] = [];

  const { data: existing, error: existingError } = await supabase
    .from("workflow_gaps")
    .select("*")
    .eq("workflow_id", workflowId);

  if (existingError) {
    throw new Error(`Failed to load existing workflow gaps: ${existingError.message}`);
  }

  const existingByNormalized = new Map((existing ?? []).map((g) => [g.normalized_label, g]));
  const protectedCandidates = (existing ?? []).filter(protectsHumanText);

  for (const draft of drafts) {
    const normalizedLabel = normalize(draft.label);
    let match = existingByNormalized.get(normalizedLabel);

    if (!match) {
      const fuzzy = findFuzzyProtectedMatch(
        protectedCandidates,
        (g) => comparableText(g.label, g.description, g.source_quote),
        comparableText(draft.label, draft.description, draft.sourceQuote)
      );
      if (fuzzy) {
        match = fuzzy.item;
        suppressions.push({
          itemType: "gap",
          draftTitle: draft.label,
          matchedId: fuzzy.item.id,
          matchedTitle: fuzzy.item.label,
          score: fuzzy.score,
        });
        console.info(
          `[workflow-reconcile] suppressed AI duplicate gap "${draft.label}" - matched existing human-protected gap "${fuzzy.item.label}" (id=${fuzzy.item.id}, score=${fuzzy.score.toFixed(2)})`
        );
      }
    }

    if (match) {
      const evidence = pickEvidence(match, draft);
      const textFields = protectsHumanText(match)
        ? {}
        : { label: draft.label, description: draft.description };

      const { error } = await supabase
        .from("workflow_gaps")
        .update({
          ...textFields,
          ...evidence,
        })
        .eq("id", match.id);

      if (error) {
        throw new Error(`Failed to update workflow gap: ${error.message}`);
      }
      continue;
    }

    const { error } = await supabase.from("workflow_gaps").insert({
      workflow_id: workflowId,
      label: draft.label,
      normalized_label: normalizedLabel,
      description: draft.description,
      source_transcript_segment_id: draft.sourceTranscriptSegmentId,
      source_quote: draft.sourceQuote,
      evidence_type: draft.evidenceType,
      confidence_reason: draft.confidenceReason,
    });

    if (error) {
      throw new Error(`Failed to create workflow gap: ${error.message}`);
    }
  }

  return suppressions;
}

// ---------------------------------------------------------------------------
// Sprint 6: human correction + workflow editing.
//
// Lookup-with-meeting-id helpers (for the API layer to 404 on cross-meeting
// access, matching getDirectionWithMeeting's pattern), plus the edit/verify/
// lock/gap-status mutations themselves. None of these ever delete a row -
// only the reconcile* functions above insert, and nothing here does either.
// ---------------------------------------------------------------------------

export type WorkflowItemType = "step" | "component" | "gap";

export async function getWorkflowStepWithMeeting(
  stepId: string
): Promise<{ step: WorkflowStep; meetingId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: step, error } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workflow step: ${error.message}`);
  if (!step) return null;

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("meeting_id")
    .eq("id", step.workflow_id)
    .maybeSingle();
  if (workflowError) throw new Error(`Failed to load workflow: ${workflowError.message}`);
  if (!workflow) return null;

  return { step, meetingId: workflow.meeting_id };
}

export async function getWorkflowComponentWithMeeting(
  componentId: string
): Promise<{ component: WorkflowComponent; meetingId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: component, error } = await supabase
    .from("workflow_components")
    .select("*")
    .eq("id", componentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workflow component: ${error.message}`);
  if (!component) return null;

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("meeting_id")
    .eq("id", component.workflow_id)
    .maybeSingle();
  if (workflowError) throw new Error(`Failed to load workflow: ${workflowError.message}`);
  if (!workflow) return null;

  return { component, meetingId: workflow.meeting_id };
}

export async function getWorkflowGapWithMeeting(
  gapId: string
): Promise<{ gap: WorkflowGap; meetingId: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: gap, error } = await supabase
    .from("workflow_gaps")
    .select("*")
    .eq("id", gapId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load workflow gap: ${error.message}`);
  if (!gap) return null;

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("meeting_id")
    .eq("id", gap.workflow_id)
    .maybeSingle();
  if (workflowError) throw new Error(`Failed to load workflow: ${workflowError.message}`);
  if (!workflow) return null;

  return { gap, meetingId: workflow.meeting_id };
}

/** Looks up any workflow item's owning meeting id, for the verify/lock/unlock actions that are generic across item types. */
export async function getWorkflowItemMeetingId(
  itemType: WorkflowItemType,
  itemId: string
): Promise<string | null> {
  switch (itemType) {
    case "step":
      return (await getWorkflowStepWithMeeting(itemId))?.meetingId ?? null;
    case "component":
      return (await getWorkflowComponentWithMeeting(itemId))?.meetingId ?? null;
    case "gap":
      return (await getWorkflowGapWithMeeting(itemId))?.meetingId ?? null;
  }
}

export interface WorkflowStepEditInput {
  title?: string;
  description?: string | null;
  humanNote?: string | null;
}

export interface WorkflowComponentEditInput {
  label?: string;
  description?: string | null;
  humanNote?: string | null;
}

export interface WorkflowGapEditInput {
  label?: string;
  description?: string | null;
  humanNote?: string | null;
}

/**
 * A human edit is what actually flips source_origin from 'ai' to
 * 'ai_human_edited' (verify/lock/gap-status actions below do not touch
 * source_origin - only a text/note edit counts as "the human wrote this").
 * Once flipped, it stays 'ai_human_edited' (or 'human') on further edits.
 */
function nextSourceOrigin(current: WorkflowSourceOrigin): WorkflowSourceOrigin {
  return current === "ai" ? "ai_human_edited" : current;
}

export async function updateWorkflowStep(
  stepId: string,
  input: WorkflowStepEditInput
): Promise<WorkflowStep> {
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("workflow_steps")
    .select("*")
    .eq("id", stepId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load workflow step: ${existingError.message}`);
  if (!existing) throw new Error("Workflow step not found");

  const patch: Partial<WorkflowStep> = {
    source_origin: nextSourceOrigin(existing.source_origin),
    last_edited_by_user_at: new Date().toISOString(),
  };
  if (input.title !== undefined) {
    patch.title = input.title;
    patch.normalized_title = normalize(input.title);
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.humanNote !== undefined) {
    patch.human_note = input.humanNote;
  }

  const { data, error } = await supabase
    .from("workflow_steps")
    .update(patch)
    .eq("id", stepId)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update workflow step: ${error?.message}`);
  return data;
}

export async function updateWorkflowComponent(
  componentId: string,
  input: WorkflowComponentEditInput
): Promise<WorkflowComponent> {
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("workflow_components")
    .select("*")
    .eq("id", componentId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load workflow component: ${existingError.message}`);
  if (!existing) throw new Error("Workflow component not found");

  const patch: Partial<WorkflowComponent> = {
    source_origin: nextSourceOrigin(existing.source_origin),
    last_edited_by_user_at: new Date().toISOString(),
  };
  if (input.label !== undefined) {
    patch.label = input.label;
    patch.normalized_label = normalize(input.label);
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.humanNote !== undefined) {
    patch.human_note = input.humanNote;
  }

  const { data, error } = await supabase
    .from("workflow_components")
    .update(patch)
    .eq("id", componentId)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update workflow component: ${error?.message}`);
  return data;
}

export async function updateWorkflowGap(
  gapId: string,
  input: WorkflowGapEditInput
): Promise<WorkflowGap> {
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("workflow_gaps")
    .select("*")
    .eq("id", gapId)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to load workflow gap: ${existingError.message}`);
  if (!existing) throw new Error("Workflow gap not found");

  const patch: Partial<WorkflowGap> = {
    source_origin: nextSourceOrigin(existing.source_origin),
    last_edited_by_user_at: new Date().toISOString(),
  };
  if (input.label !== undefined) {
    patch.label = input.label;
    patch.normalized_label = normalize(input.label);
  }
  if (input.description !== undefined) {
    patch.description = input.description;
  }
  if (input.humanNote !== undefined) {
    patch.human_note = input.humanNote;
  }

  const { data, error } = await supabase
    .from("workflow_gaps")
    .update(patch)
    .eq("id", gapId)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update workflow gap: ${error?.message}`);
  return data;
}

type WorkflowItemFlagPatch = { human_verified: boolean } | { locked_by_user: boolean };

async function updateWorkflowItemFlags(
  itemType: WorkflowItemType,
  itemId: string,
  patch: WorkflowItemFlagPatch
): Promise<WorkflowStep | WorkflowComponent | WorkflowGap> {
  const supabase = await createServerSupabaseClient();
  switch (itemType) {
    case "step": {
      const { data, error } = await supabase
        .from("workflow_steps")
        .update(patch)
        .eq("id", itemId)
        .select()
        .maybeSingle();
      if (error) throw new Error(`Failed to update workflow step: ${error.message}`);
      if (!data) throw new Error("Workflow step not found");
      return data;
    }
    case "component": {
      const { data, error } = await supabase
        .from("workflow_components")
        .update(patch)
        .eq("id", itemId)
        .select()
        .maybeSingle();
      if (error) throw new Error(`Failed to update workflow component: ${error.message}`);
      if (!data) throw new Error("Workflow component not found");
      return data;
    }
    case "gap": {
      const { data, error } = await supabase
        .from("workflow_gaps")
        .update(patch)
        .eq("id", itemId)
        .select()
        .maybeSingle();
      if (error) throw new Error(`Failed to update workflow gap: ${error.message}`);
      if (!data) throw new Error("Workflow gap not found");
      return data;
    }
  }
}

/** Marks any workflow item (step, component, or gap) as human-confirmed accurate - protects its confidence_level from being downgraded by a later AI run (see pickConfidenceLevel above). */
export async function markWorkflowItemVerified(
  itemType: WorkflowItemType,
  itemId: string
): Promise<WorkflowStep | WorkflowComponent | WorkflowGap> {
  return updateWorkflowItemFlags(itemType, itemId, { human_verified: true });
}

/** Freezes an item's title/label/description against future AI overwrites (see protectsHumanText above) without requiring the human to actually edit its text. */
export async function lockWorkflowItem(
  itemType: WorkflowItemType,
  itemId: string
): Promise<WorkflowStep | WorkflowComponent | WorkflowGap> {
  return updateWorkflowItemFlags(itemType, itemId, { locked_by_user: true });
}

export async function unlockWorkflowItem(
  itemType: WorkflowItemType,
  itemId: string
): Promise<WorkflowStep | WorkflowComponent | WorkflowGap> {
  return updateWorkflowItemFlags(itemType, itemId, { locked_by_user: false });
}

async function setGapStatus(gapId: string, status: WorkflowGapStatus): Promise<WorkflowGap> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("workflow_gaps")
    .update({ gap_status: status })
    .eq("id", gapId)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Failed to update workflow gap: ${error.message}`);
  if (!data) throw new Error("Workflow gap not found");
  return data;
}

/** The facilitator has since learned the answer to this gap outside the AI's view (e.g. asked directly) - resolves it without deleting the record of what was unknown. */
export async function markGapAnswered(gapId: string): Promise<WorkflowGap> {
  return setGapStatus(gapId, "answered");
}

/** The facilitator has decided this gap isn't worth pursuing - sets it aside without deleting it. */
export async function dismissGap(gapId: string): Promise<WorkflowGap> {
  return setGapStatus(gapId, "dismissed");
}

// ---------------------------------------------------------------------------
// Sprint 6.5: reconciliation polish - AI-driven gap auto-resolution.
// ---------------------------------------------------------------------------

export interface GapAutoAnswerNote {
  gapId: string;
  gapLabel: string;
}

// ---------------------------------------------------------------------------
// Sprint 8: gap narrowing - a gap that's only partially resolved shouldn't
// stay at its original broad label (misleadingly implying nothing is known)
// or get fully closed via autoAnswerGaps (which would misleadingly imply
// nothing is left to ask). narrowGaps rewrites the label/description to name
// the remaining unknown while keeping gap_status "open".
// ---------------------------------------------------------------------------

export interface NarrowedGapDraft {
  originalLabel: string;
  newLabel: string;
  newDescription: string;
}

export interface GapNarrowingNote {
  gapId: string;
  oldLabel: string;
  newLabel: string;
}

/**
 * Like autoAnswerGaps, matches by the model's echoed original gap label
 * (exact, normalized) rather than a lexical heuristic - narrowing requires
 * the same semantic judgment auto-answering does. Only ever touches a gap
 * that is still 'open' and not protectsHumanText-protected (locked or
 * human-edited) - a human-owned gap's wording is never rewritten out from
 * under them, matching the same guardrail the reconcile* functions use for
 * steps/components. Never changes gap_status - narrowing keeps a gap open,
 * just with tighter wording; use autoAnswerGaps for full resolution.
 */
export async function narrowGaps(
  workflowId: string,
  drafts: NarrowedGapDraft[]
): Promise<GapNarrowingNote[]> {
  if (drafts.length === 0) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data: gaps, error } = await supabase
    .from("workflow_gaps")
    .select("*")
    .eq("workflow_id", workflowId);
  if (error) {
    throw new Error(`Failed to load workflow gaps: ${error.message}`);
  }

  const byNormalizedLabel = new Map((gaps ?? []).map((g) => [g.normalized_label, g]));
  const notes: GapNarrowingNote[] = [];

  for (const draft of drafts) {
    const gap = byNormalizedLabel.get(normalize(draft.originalLabel));
    if (!gap) continue;
    if (gap.gap_status !== "open" || protectsHumanText(gap)) continue;

    const newNormalizedLabel = normalize(draft.newLabel);
    const { error: updateError } = await supabase
      .from("workflow_gaps")
      .update({
        label: draft.newLabel,
        normalized_label: newNormalizedLabel,
        description: draft.newDescription,
      })
      .eq("id", gap.id);
    if (updateError) {
      throw new Error(`Failed to narrow workflow gap: ${updateError.message}`);
    }

    notes.push({ gapId: gap.id, oldLabel: gap.label, newLabel: draft.newLabel });
    console.info(
      `[workflow-reconcile] narrowed gap "${gap.label}" -> "${draft.newLabel}" (id=${gap.id}) - partially resolved, remaining unknown narrowed`
    );
  }

  return notes;
}

/**
 * AI-driven gap resolution: the workflow extractor tells us (via
 * answered_gap_labels in its structured output) which currently-open gaps
 * this run's transcript now directly answers - matching by label requires
 * real semantic judgment (e.g. a "Detect Misrouted Document" step
 * resolving a "Failure Detection Mechanisms" gap share no common words),
 * which is why this is model-driven rather than a lexical heuristic like
 * findFuzzyProtectedMatch above. Only applies to gaps still 'open' and not
 * locked - a lock means "hands off entirely," including its status.
 */
export async function autoAnswerGaps(
  workflowId: string,
  answeredLabels: string[]
): Promise<GapAutoAnswerNote[]> {
  if (answeredLabels.length === 0) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  const { data: gaps, error } = await supabase
    .from("workflow_gaps")
    .select("*")
    .eq("workflow_id", workflowId);
  if (error) {
    throw new Error(`Failed to load workflow gaps: ${error.message}`);
  }

  const normalizedTargets = new Set(answeredLabels.map(normalize));
  const resolved: GapAutoAnswerNote[] = [];

  for (const gap of gaps ?? []) {
    if (gap.gap_status !== "open" || gap.locked_by_user) continue;
    if (!normalizedTargets.has(gap.normalized_label)) continue;

    const { error: updateError } = await supabase
      .from("workflow_gaps")
      .update({ gap_status: "answered" })
      .eq("id", gap.id);
    if (updateError) {
      throw new Error(`Failed to auto-answer workflow gap: ${updateError.message}`);
    }

    resolved.push({ gapId: gap.id, gapLabel: gap.label });
    console.info(`[workflow-reconcile] auto-answered gap "${gap.label}" (id=${gap.id}) - now directly resolved by evidence in this run`);
  }

  return resolved;
}

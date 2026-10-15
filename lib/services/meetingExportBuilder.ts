import { getMeetingWithDetails } from "@/lib/services/meetings";
import { getWorkflowView } from "@/lib/services/workflows";
import { getAmbiguityFlagsForMeeting } from "@/lib/services/ambiguityFlags";
import { listContradictionCandidates } from "@/lib/services/contradictionCandidates";
import { getLatestPostMeetingReview } from "@/lib/services/postMeetingReviews";
import { getScenarioById } from "@/lib/scenarios";
import { formatEnumLabel } from "@/lib/format";
import type {
  BuildDirectionAssessment,
  ConfidenceLevel,
  EvidenceType,
  RecommendedFollowup,
} from "@/lib/types/database";

/** "rule_conflict" -> "rule conflict", "high" -> "high" - shared enum-to-prose formatter for export text. */
function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

const MAX_QUOTE_LENGTH = 220;

/** Caps a quote's length for export - evidence highlights are meant to be short pointers back to the transcript, never a transcript dump. */
function trimQuote(quote: string): string {
  const trimmed = quote.trim();
  if (trimmed.length <= MAX_QUOTE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_QUOTE_LENGTH - 1).trimEnd()}…`;
}

export interface ExportEvidenceRef {
  evidenceType: EvidenceType;
  confidenceLevel: ConfidenceLevel;
  sourceQuote: string | null;
  humanVerified: boolean;
  lockedByUser: boolean;
  humanEdited: boolean;
}

export interface ExportStepItem extends ExportEvidenceRef {
  title: string;
  description: string | null;
}

export interface ExportComponentItem extends ExportEvidenceRef {
  componentType: string;
  label: string;
  description: string | null;
}

export interface ExportGapItem extends Omit<ExportEvidenceRef, "confidenceLevel"> {
  label: string;
  description: string | null;
}

export interface ExportAmbiguityItem {
  label: string;
  description: string | null;
  ambiguityType: string;
  priority: string;
  sourceQuote: string | null;
}

export interface ExportMismatchItem {
  label: string;
  description: string;
  contradictionType: string;
  severity: string;
  claimA: string;
  claimB: string;
  quoteA: string | null;
  quoteB: string | null;
  suggestedQuestion: string | null;
}

export interface ExportEvidenceQuote {
  label: string;
  quote: string;
}

export interface MeetingExportModel {
  meeting: {
    id: string;
    name: string;
    company: string | null;
    meetingType: string;
    discoveryStrategy: string | null;
    goal: string | null;
    date: string;
    scenarioName: string | null;
  };
  hasReview: boolean;
  reviewGeneratedAt: string | null;
  executiveSummary: string | null;
  knownFacts: string[];
  inferences: string[];
  buildDirectionAssessment: BuildDirectionAssessment | null;
  processSummary: string | null;
  processSteps: ExportStepItem[];
  peopleAndSystems: ExportComponentItem[];
  stillUnclear: ExportGapItem[];
  reviewOpenQuestions: { question: string; whyItMatters: string; priority: string }[];
  needsClarification: ExportAmbiguityItem[];
  possibleMismatches: ExportMismatchItem[];
  recommendedFollowups: RecommendedFollowup[];
  evidenceHighlights: ExportEvidenceQuote[];
  knownLimitations: string[];
  generatedAt: string;
}

const TRUST_MODEL_LINES = [
  "Transcript text is the source of truth.",
  "Structured items are grounded interpretations, not the raw record.",
  "Human edits and locks are preserved and never overwritten by later AI runs.",
  "DiscoveryOS prefers uncertainty over unsupported claims.",
];

/**
 * Builds a display-safe export model for a meeting from current database
 * state - no raw ids/foreign keys anywhere in the returned shape. Prefers
 * current structured state (workflow rows, open gaps/flags/candidates)
 * over the post-meeting review's prose, which can lag behind reconciliation
 * (same reasoning WorkflowPanel.tsx already applies to its own "Current
 * model" summary line). The review is still used for the executive
 * summary/build-direction narrative and known facts/inferences/follow-ups,
 * since those are review-specific content with no structured-table
 * equivalent. Returns null only when the meeting itself doesn't exist -
 * every other missing piece (no workflow yet, no review yet) degrades to
 * an empty/null field rather than an error, per Sprint 14's "do not invent
 * missing sections" requirement.
 */
export async function buildMeetingExport(meetingId: string): Promise<MeetingExportModel | null> {
  const details = await getMeetingWithDetails(meetingId);
  if (!details) {
    return null;
  }
  const { meeting } = details;

  const [workflowView, ambiguityFlags, contradictionCandidates, review] = await Promise.all([
    getWorkflowView(meetingId),
    getAmbiguityFlagsForMeeting(meetingId),
    listContradictionCandidates(meetingId),
    getLatestPostMeetingReview(meetingId),
  ]);

  const scenarioName = meeting.scenario_id ? getScenarioById(meeting.scenario_id)?.name ?? null : null;

  const openGaps = (workflowView?.gaps ?? []).filter((g) => g.gap_status === "open");
  const openAmbiguityFlags = ambiguityFlags.filter((f) => f.status === "open");
  const openContradictionCandidates = contradictionCandidates.filter((c) => c.status === "open");

  const processSteps: ExportStepItem[] = (workflowView?.steps ?? []).map((step) => ({
    title: step.title,
    description: step.description,
    evidenceType: step.evidence_type,
    confidenceLevel: step.confidence_level,
    sourceQuote: step.source_quote,
    humanVerified: step.human_verified,
    lockedByUser: step.locked_by_user,
    humanEdited: step.source_origin !== "ai",
  }));

  const peopleAndSystems: ExportComponentItem[] = (workflowView?.components ?? []).map((component) => ({
    componentType: humanize(component.component_type),
    label: component.label,
    description: component.description,
    evidenceType: component.evidence_type,
    confidenceLevel: component.confidence_level,
    sourceQuote: component.source_quote,
    humanVerified: component.human_verified,
    lockedByUser: component.locked_by_user,
    humanEdited: component.source_origin !== "ai",
  }));

  const stillUnclear: ExportGapItem[] = openGaps.map((gap) => ({
    label: gap.label,
    description: gap.description,
    evidenceType: gap.evidence_type,
    sourceQuote: gap.source_quote,
    humanVerified: gap.human_verified,
    lockedByUser: gap.locked_by_user,
    humanEdited: gap.source_origin !== "ai",
  }));

  const needsClarification: ExportAmbiguityItem[] = openAmbiguityFlags.map((flag) => ({
    label: flag.label,
    description: flag.description,
    ambiguityType: humanize(flag.ambiguity_type),
    priority: flag.priority,
    sourceQuote: flag.source_quote,
  }));

  const possibleMismatches: ExportMismatchItem[] = openContradictionCandidates.map((candidate) => ({
    label: candidate.label,
    description: candidate.description,
    contradictionType: humanize(candidate.contradiction_type),
    severity: candidate.severity,
    claimA: candidate.claim_a,
    claimB: candidate.claim_b,
    quoteA: candidate.source_quote_a,
    quoteB: candidate.source_quote_b,
    suggestedQuestion: candidate.suggested_clarification_question,
  }));

  // Up to ~6 short, deduplicated quotes, preferring steps, then open gaps,
  // then open mismatches - a curated pointer back to the transcript, never
  // a transcript dump.
  const evidenceHighlights: ExportEvidenceQuote[] = [];
  const seenQuotes = new Set<string>();
  function addHighlight(label: string, quote: string | null) {
    if (!quote || evidenceHighlights.length >= 6) return;
    const trimmed = trimQuote(quote);
    const key = trimmed.toLowerCase();
    if (seenQuotes.has(key)) return;
    seenQuotes.add(key);
    evidenceHighlights.push({ label, quote: trimmed });
  }
  for (const step of processSteps) addHighlight(step.title, step.sourceQuote);
  for (const gap of stillUnclear) addHighlight(gap.label, gap.sourceQuote);
  for (const mismatch of possibleMismatches) {
    addHighlight(`${mismatch.label} (claim A)`, mismatch.quoteA);
    addHighlight(`${mismatch.label} (claim B)`, mismatch.quoteB);
  }

  const knownLimitations = [...TRUST_MODEL_LINES];
  if (!review) {
    knownLimitations.push(
      "No post-meeting review has been generated yet - this reflects structured workflow data only."
    );
  }

  return {
    meeting: {
      id: meeting.id,
      name: meeting.name,
      company: meeting.company,
      meetingType: formatEnumLabel(meeting.meeting_type),
      discoveryStrategy: meeting.discovery_strategy ? formatEnumLabel(meeting.discovery_strategy) : null,
      goal: meeting.goal,
      date: meeting.started_at ?? meeting.created_at,
      scenarioName,
    },
    hasReview: !!review,
    reviewGeneratedAt: review?.generated_at ?? null,
    executiveSummary: review?.summary ?? null,
    knownFacts: review?.known_facts ?? [],
    inferences: review?.inferences ?? [],
    buildDirectionAssessment: review?.build_direction_assessment ?? null,
    processSummary: workflowView?.workflow.known_summary || review?.workflow_summary || null,
    processSteps,
    peopleAndSystems,
    stillUnclear,
    reviewOpenQuestions: (review?.open_questions ?? []).map((q) => ({
      question: q.question,
      whyItMatters: q.whyItMatters,
      priority: q.priority,
    })),
    needsClarification,
    possibleMismatches,
    recommendedFollowups: review?.recommended_followups ?? [],
    evidenceHighlights,
    knownLimitations,
    generatedAt: new Date().toISOString(),
  };
}

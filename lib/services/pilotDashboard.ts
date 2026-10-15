import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getLatestEvaluationScores } from "@/lib/services/evaluations";
import { listPilotIssues } from "@/lib/services/pilotIssues";
import {
  PRE_MEETING_CHECKLIST_ITEMS,
  POST_MEETING_CHECKLIST_ITEMS,
} from "@/lib/pilotReadinessConstants";
import { categorizeIssueText, type IssueCategory } from "@/lib/pilotIssueCategories";
import type {
  DiscoveryStrategy,
  MeetingStatus,
  MeetingType,
  PilotIssueCategory,
  PilotIssueSeverity,
  PilotIssueStatus,
  RecordingMode,
  RegressionResult,
} from "@/lib/types/database";

export type PilotReadinessStatus =
  | "ready"
  | "incomplete"
  | "missing_consent"
  | "missing_limitations";

export type PilotPostMeetingStatus = "complete" | "incomplete" | "not_started";

export interface PilotMeetingSummary {
  id: string;
  name: string;
  status: MeetingStatus;
  scenarioId: string | null;
  meetingType: MeetingType;
  discoveryStrategy: DiscoveryStrategy | null;
  createdAt: string;
  updatedAt: string;

  consentConfirmed: boolean;
  knownLimitationsAcknowledged: boolean;
  recordingMode: RecordingMode | null;
  preMeetingChecklist: Record<string, boolean> | null;
  postMeetingChecklist: Record<string, boolean> | null;
  pilotNotes: string | null;
  issuesObserved: string | null;
  followupActions: string | null;

  preChecklistCompleteCount: number;
  preChecklistTotalCount: number;
  postChecklistCompleteCount: number;
  postChecklistTotalCount: number;
  hasIssues: boolean;
  hasFollowupActions: boolean;
  readinessStatus: PilotReadinessStatus;
  postMeetingStatus: PilotPostMeetingStatus;
  issueCategories: IssueCategory[];

  /** Optional, best-effort - null if never run, never a reason the row fails to load. */
  latestEvaluationScore: number | null;
  latestRegressionResult: RegressionResult | null;
}

export interface PilotDashboardSummary {
  pilotMeetingCount: number;
  readyCount: number;
  meetingsWithIssuesCount: number;
  openFollowupCount: number;
  /** 0-1 fraction, null if there's nothing to average (no pilot meetings). */
  avgPreChecklistCompletion: number | null;
  avgPostChecklistCompletion: number | null;

  /** Sprint 20: tracked pilot issues (pilot_issues table) - separate from the raw issuesObserved free text above. */
  openTrackedIssueCount: number;
  highOrCriticalOpenIssueCount: number;
  resolvedIssueCount: number;
  meetingsWithOpenIssuesCount: number;
}

/** Sprint 20: one tracked pilot_issues row, with the meeting name joined in for display - never the source of export/share content. */
export interface PilotIssueSummary {
  id: string;
  meetingId: string;
  meetingName: string;
  title: string;
  description: string | null;
  category: PilotIssueCategory;
  severity: PilotIssueSeverity;
  status: PilotIssueStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface PilotDashboardData {
  meetings: PilotMeetingSummary[];
  issues: PilotIssueSummary[];
  summary: PilotDashboardSummary;
}

function countComplete(checklist: Record<string, boolean> | null, total: number): number {
  if (!checklist) return 0;
  const count = Object.values(checklist).filter(Boolean).length;
  return Math.min(count, total);
}

function computeReadinessStatus(
  consentConfirmed: boolean,
  knownLimitationsAcknowledged: boolean,
  preComplete: number,
  preTotal: number
): PilotReadinessStatus {
  if (!consentConfirmed) return "missing_consent";
  if (!knownLimitationsAcknowledged) return "missing_limitations";
  if (preComplete < preTotal) return "incomplete";
  return "ready";
}

function computePostMeetingStatus(
  postChecklist: Record<string, boolean> | null,
  postComplete: number,
  postTotal: number
): PilotPostMeetingStatus {
  if (!postChecklist) return "not_started";
  if (postComplete >= postTotal) return "complete";
  return "incomplete";
}

/** Latest regression_runs row per meeting - same batched "one query for all meetings, not N+1" shape as getLatestEvaluationScores. */
async function getLatestRegressionResults(
  meetingIds: string[]
): Promise<Map<string, RegressionResult>> {
  if (meetingIds.length === 0) return new Map();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("regression_runs")
    .select("meeting_id, overall_result, created_at")
    .in("meeting_id", meetingIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load regression runs: ${error.message}`);
  }

  const latestByMeeting = new Map<string, RegressionResult>();
  for (const run of data ?? []) {
    if (!latestByMeeting.has(run.meeting_id)) {
      latestByMeeting.set(run.meeting_id, run.overall_result);
    }
  }
  return latestByMeeting;
}

/**
 * Sprint 19/20: every real pilot meeting (meeting_pilot_notes.pilot_mode
 * = true) with its readiness/completion state, plus every tracked pilot
 * issue (pilot_issues, Sprint 20) regardless of the owning meeting's
 * current pilot_mode - a tracked issue never disappears just because
 * pilot mode was later turned off. Evaluation/regression summaries and
 * tracked issues are all optional, best-effort extras - fetched
 * independently so a failure in any one of them never blocks the rest of
 * the dashboard from loading.
 */
export async function getPilotDashboardData(): Promise<PilotDashboardData> {
  const supabase = await createServerSupabaseClient();

  const { data: pilotNotes, error: pilotNotesError } = await supabase
    .from("meeting_pilot_notes")
    .select("*")
    .eq("pilot_mode", true);

  if (pilotNotesError) {
    throw new Error(`Failed to load pilot notes: ${pilotNotesError.message}`);
  }

  const notes = pilotNotes ?? [];
  const issueRows = await listPilotIssues().catch(() => []);

  const meetingIds = Array.from(
    new Set([...notes.map((n) => n.meeting_id), ...issueRows.map((i) => i.meeting_id)])
  );

  if (meetingIds.length === 0) {
    return {
      meetings: [],
      issues: [],
      summary: {
        pilotMeetingCount: 0,
        readyCount: 0,
        meetingsWithIssuesCount: 0,
        openFollowupCount: 0,
        avgPreChecklistCompletion: null,
        avgPostChecklistCompletion: null,
        openTrackedIssueCount: 0,
        highOrCriticalOpenIssueCount: 0,
        resolvedIssueCount: 0,
        meetingsWithOpenIssuesCount: 0,
      },
    };
  }

  const { data: meetingRows, error: meetingsError } = await supabase
    .from("meetings")
    .select("id, name, status, scenario_id, meeting_type, discovery_strategy, created_at, updated_at")
    .in("id", meetingIds);

  if (meetingsError) {
    throw new Error(`Failed to load meetings: ${meetingsError.message}`);
  }

  const meetingsById = new Map((meetingRows ?? []).map((m) => [m.id, m]));

  const pilotMeetingIds = notes.map((n) => n.meeting_id);

  // Best-effort extras - never let a failure here block pilot data.
  const [evaluationScores, regressionResults] = await Promise.all([
    getLatestEvaluationScores(pilotMeetingIds).catch(() => new Map()),
    getLatestRegressionResults(pilotMeetingIds).catch(() => new Map()),
  ]);

  const preTotal = PRE_MEETING_CHECKLIST_ITEMS.length;
  const postTotal = POST_MEETING_CHECKLIST_ITEMS.length;

  const meetings: PilotMeetingSummary[] = [];
  for (const note of notes) {
    const meeting = meetingsById.get(note.meeting_id);
    // Should be impossible (meeting_pilot_notes.meeting_id cascades on
    // meeting delete), but skip defensively rather than render a broken row.
    if (!meeting) continue;

    const preComplete = countComplete(note.pre_meeting_checklist, preTotal);
    const postComplete = countComplete(note.post_meeting_checklist, postTotal);
    const hasIssues = Boolean(note.issues_observed?.trim());
    const hasFollowupActions = Boolean(note.followup_actions?.trim());

    meetings.push({
      id: meeting.id,
      name: meeting.name,
      status: meeting.status,
      scenarioId: meeting.scenario_id,
      meetingType: meeting.meeting_type,
      discoveryStrategy: meeting.discovery_strategy,
      createdAt: meeting.created_at,
      updatedAt: meeting.updated_at,

      consentConfirmed: note.consent_confirmed,
      knownLimitationsAcknowledged: note.known_limitations_acknowledged,
      recordingMode: note.recording_mode,
      preMeetingChecklist: note.pre_meeting_checklist,
      postMeetingChecklist: note.post_meeting_checklist,
      pilotNotes: note.pilot_notes,
      issuesObserved: note.issues_observed,
      followupActions: note.followup_actions,

      preChecklistCompleteCount: preComplete,
      preChecklistTotalCount: preTotal,
      postChecklistCompleteCount: postComplete,
      postChecklistTotalCount: postTotal,
      hasIssues,
      hasFollowupActions,
      readinessStatus: computeReadinessStatus(
        note.consent_confirmed,
        note.known_limitations_acknowledged,
        preComplete,
        preTotal
      ),
      postMeetingStatus: computePostMeetingStatus(note.post_meeting_checklist, postComplete, postTotal),
      issueCategories: categorizeIssueText(note.issues_observed),

      latestEvaluationScore: evaluationScores.get(meeting.id)?.overall_score ?? null,
      latestRegressionResult: regressionResults.get(meeting.id) ?? null,
    });
  }

  // Most recently updated pilot meeting first - matches the main dashboard's ordering.
  meetings.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const readyCount = meetings.filter((m) => m.readinessStatus === "ready").length;
  const meetingsWithIssuesCount = meetings.filter((m) => m.hasIssues).length;
  const openFollowupCount = meetings.filter((m) => m.hasFollowupActions).length;
  const avgPreChecklistCompletion =
    meetings.length === 0
      ? null
      : meetings.reduce((sum, m) => sum + m.preChecklistCompleteCount / m.preChecklistTotalCount, 0) /
        meetings.length;
  const avgPostChecklistCompletion =
    meetings.length === 0
      ? null
      : meetings.reduce((sum, m) => sum + m.postChecklistCompleteCount / m.postChecklistTotalCount, 0) /
        meetings.length;

  const issues: PilotIssueSummary[] = issueRows.map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    meetingName: meetingsById.get(row.meeting_id)?.name ?? "Unknown meeting",
    title: row.title,
    description: row.description,
    category: row.category,
    severity: row.severity,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }));

  const openIssues = issues.filter((i) => i.status === "open");
  const openTrackedIssueCount = openIssues.length;
  const highOrCriticalOpenIssueCount = openIssues.filter(
    (i) => i.severity === "high" || i.severity === "critical"
  ).length;
  const resolvedIssueCount = issues.filter((i) => i.status === "resolved").length;
  const meetingsWithOpenIssuesCount = new Set(openIssues.map((i) => i.meetingId)).size;

  return {
    meetings,
    issues,
    summary: {
      pilotMeetingCount: meetings.length,
      readyCount,
      meetingsWithIssuesCount,
      openFollowupCount,
      avgPreChecklistCompletion,
      avgPostChecklistCompletion,
      openTrackedIssueCount,
      highOrCriticalOpenIssueCount,
      resolvedIssueCount,
      meetingsWithOpenIssuesCount,
    },
  };
}

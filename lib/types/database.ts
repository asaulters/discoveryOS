import type { Project, WorkPackage, Task, ProjectEvent } from "@/lib/tracker/types";
import type { IssueCategory } from "@/lib/pilotIssueCategories";

export type MeetingStatus = "prepared" | "live" | "paused" | "completed" | "archived";

export type ConfidenceLevel = "unclear" | "emerging" | "likely" | "confirmed";

export type ThreadStatus =
  | "active"
  | "open"
  | "deferred"
  | "covered"
  | "contradicted"
  | "stale"
  | "dismissed";

export type ThreadPriority = "low" | "medium" | "high" | "critical";

export type DirectionStatus = "active" | "used" | "dismissed" | "deferred" | "stale";

export type MeetingType =
  | "automation_discovery"
  | "product_discovery"
  | "technical_feasibility"
  | "requirements_gathering"
  | "business_case"
  | "ux_research"
  /** Sprint 25: applied AI / automation opportunity discovery - assessing whether a workflow is a good candidate for AI assist, rules automation, workflow redesign, reporting/visibility, human process change, not-ready, or no-build. Supports internal AI Labs work, freelance discovery calls, and applied AI consulting - not internal-only. */
  | "applied_ai_discovery";

export type DiscoveryStrategy =
  | "broad_exploration"
  | "deep_validation"
  | "requirements_gathering"
  | "technical_feasibility"
  | "business_case";

export type WorkflowComponentType =
  | "actor"
  | "system"
  | "data"
  | "decision_rule"
  | "approval"
  | "handoff"
  | "exception"
  | "failure_detection"
  | "failure_recovery"
  | "output";

export type EvidenceType = "known" | "inferred" | "unknown";

export type WorkflowSourceOrigin = "ai" | "human" | "ai_human_edited";

export type WorkflowGapStatus = "open" | "answered" | "dismissed";

export type ReviewEvidenceType = "known" | "inferred";

export type ReviewPriority = "low" | "medium" | "high" | "critical";

export type AssumptionUpdateStatus = "supported" | "weakened" | "unresolved" | "changed";

export type BuildDirectionStatus = "supported" | "partially_supported" | "weakened" | "needs_reframing";

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type AmbiguityType =
  | "unclear_owner"
  | "unclear_rule"
  | "informal_term"
  | "inconsistent_process"
  | "missing_criteria"
  | "ambiguous_system"
  | "exception_case"
  | "other";

export type AmbiguityStatus = "open" | "resolved" | "dismissed";

export type ContradictionType =
  | "ownership_conflict"
  | "rule_conflict"
  | "approval_conflict"
  | "system_conflict"
  | "timing_conflict"
  | "exception_conflict"
  | "build_assumption_conflict"
  | "terminology_conflict"
  | "status_conflict"
  | "other";

export type ContradictionSeverity = "low" | "medium" | "high" | "critical";

export type ContradictionStatus = "open" | "resolved" | "dismissed";

// NOTE: these are `type` aliases, not `interface`s. Interfaces don't get
// TypeScript's implicit index signature, so they fail the
// `extends Record<string, unknown>` checks supabase-js's generic client
// relies on to type `.from(...)` calls — silently degrading everything to
// `never`.
export type Meeting = {
  id: string;
  name: string;
  company: string | null;
  meeting_type: MeetingType;
  discovery_strategy: DiscoveryStrategy | null;
  goal: string | null;
  current_understanding: string | null;
  tentative_build_direction: string | null;
  risks_unknowns: unknown[];
  status: MeetingStatus;
  /** Sprint 10: DiscoveryScenario.id from lib/scenarios/ if this meeting was created via "Load demo scenario" - null otherwise. Not a foreign key. */
  scenario_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Assumption = {
  id: string;
  meeting_id: string;
  text: string;
  confidence_level: ConfidenceLevel;
  created_at: string;
  updated_at: string;
};

export type MeetingContextItem = {
  id: string;
  meeting_id: string;
  content: string;
  source: string | null;
  created_at: string;
};

export type DiscoveryThread = {
  id: string;
  meeting_id: string;
  title: string;
  status: ThreadStatus;
  priority: ThreadPriority;
  in_queue: boolean;
  sort_order: number;
  locked_until_release: boolean;
  confidence_level: ConfidenceLevel;
  why_it_matters: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionDirection = {
  id: string;
  discovery_thread_id: string;
  text: string;
  questions: string[];
  status: DirectionStatus;
  reason: string | null;
  created_at: string;
};

export type Hypothesis = {
  id: string;
  meeting_id: string;
  statement: string;
  confidence_level: ConfidenceLevel;
  created_at: string;
  updated_at: string;
};

/**
 * Sprint 25: Applied AI Discovery-specific pre-meeting brief content - only
 * populated when the meeting's meeting_type is "applied_ai_discovery" (null
 * otherwise). Doesn't duplicate assumptions_to_validate - those still flow
 * through the generic assumptions table like every other meeting type.
 */
export type AppliedAiBrief = {
  suspectedWorkflowPain: string[];
  likelyTaskInterventionTypes: string[];
  dataReadinessQuestions: string[];
  riskConstraintQuestions: string[];
  humanReviewQuestions: string[];
  implementationReadinessQuestions: string[];
  smallestUsefulExperimentHypothesis: string;
  noBuildNotReadyRisk: string;
  /** Sprint 26 Part E: applied-AI patterns (from lib/patterns/appliedAiPatterns.ts) worth validating in this meeting - hypotheses, never recommendations. Always includes at least one non-AI/no-build option alongside any AI patterns. */
  patternsToValidate: string[];
};

export type PreMeetingBrief = {
  id: string;
  meeting_id: string;
  brief_summary: string;
  suggested_opening: string;
  recommended_focus: string;
  must_learn: string[];
  risk_focus: string[];
  build_direction_warning: string | null;
  /** Sprint 25: null for every non-applied_ai_discovery meeting. */
  applied_ai_brief: AppliedAiBrief | null;
  created_at: string;
};

export type Workflow = {
  id: string;
  meeting_id: string;
  name: string;
  confidence_level: ConfidenceLevel;
  known_summary: string;
  unknown_summary: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowStep = {
  id: string;
  workflow_id: string;
  title: string;
  normalized_title: string;
  description: string | null;
  confidence_level: ConfidenceLevel;
  sort_order: number;
  source_transcript_segment_id: string | null;
  source_quote: string | null;
  evidence_type: EvidenceType;
  confidence_reason: string;
  source_origin: WorkflowSourceOrigin;
  human_verified: boolean;
  human_note: string | null;
  locked_by_user: boolean;
  last_edited_by_user_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowComponent = {
  id: string;
  workflow_id: string;
  component_type: WorkflowComponentType;
  label: string;
  normalized_label: string;
  description: string | null;
  confidence_level: ConfidenceLevel;
  source_transcript_segment_id: string | null;
  source_quote: string | null;
  evidence_type: EvidenceType;
  confidence_reason: string;
  source_origin: WorkflowSourceOrigin;
  human_verified: boolean;
  human_note: string | null;
  locked_by_user: boolean;
  last_edited_by_user_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowGap = {
  id: string;
  workflow_id: string;
  label: string;
  normalized_label: string;
  description: string | null;
  source_transcript_segment_id: string | null;
  source_quote: string | null;
  evidence_type: EvidenceType;
  confidence_reason: string;
  source_origin: WorkflowSourceOrigin;
  human_verified: boolean;
  human_note: string | null;
  locked_by_user: boolean;
  last_edited_by_user_at: string | null;
  gap_status: WorkflowGapStatus;
  created_at: string;
  updated_at: string;
};

export type KeyLearning = {
  learning: string;
  evidenceType: ReviewEvidenceType;
  supportingWorkflowItem?: string;
  sourceQuote?: string;
};

export type OpenQuestionItem = {
  question: string;
  whyItMatters: string;
  priority: ReviewPriority;
};

export type AssumptionUpdateItem = {
  assumption: string;
  status: AssumptionUpdateStatus;
  reason: string;
};

export type BuildDirectionAssessment = {
  status: BuildDirectionStatus;
  assessment: string;
  recommendedReframe?: string;
};

export type RecommendedFollowup = {
  topic: string;
  question: string;
  priority: ReviewPriority;
};

export type RiskItem = {
  risk: string;
  severity: RiskSeverity;
  reason: string;
};

export type PostMeetingReview = {
  id: string;
  meeting_id: string;
  summary: string;
  key_learnings: KeyLearning[];
  open_questions: OpenQuestionItem[];
  workflow_summary: string;
  known_facts: string[];
  inferences: string[];
  assumption_updates: AssumptionUpdateItem[];
  build_direction_assessment: BuildDirectionAssessment;
  recommended_followups: RecommendedFollowup[];
  risks: RiskItem[];
  generated_at: string;
  created_at: string;
  updated_at: string;
};

export type TranscriptSourceType = "manual" | "live_audio";

export type TranscriptionMetadata = {
  duration_ms?: number;
  mime_type?: string;
  model?: string;
  chunk_index?: number;
  analysis_paused_at_creation?: boolean;
  /** Sprint 13: set on segments created from the continuous-mode live buffer. */
  source?: "live_audio_continuous";
  /** Sprint 13: how many transcribed chunks were merged into this one segment. */
  chunk_count?: number;
  /** Sprint 13: which meaningfulSegments.ts rule triggered analysis (or "manual_force"). */
  detection_reason?: string;
  /** Sprint 13: high-signal terms matched at detection time. */
  signal_terms?: string[];
  /** Sprint 13: meaningfulSegments.ts's rough token-count estimate at detection time. */
  token_estimate?: number;
  /** Sprint 13: true when this segment came from the buffered continuous-mode flow (vs. Sprint 11's one-chunk-per-segment path). */
  analyzed_from_buffer?: boolean;
};

export type TranscriptSegment = {
  id: string;
  meeting_id: string;
  discovery_thread_id: string | null;
  raw_text: string;
  source_type: TranscriptSourceType;
  transcription_metadata: TranscriptionMetadata | null;
  created_at: string;
};

export type EvaluationRun = {
  id: string;
  meeting_id: string;
  scenario_name: string | null;
  evaluator_type: string;
  overall_score: number | null;
  question_direction_score: number | null;
  workflow_extraction_score: number | null;
  evidence_quality_score: number | null;
  gap_quality_score: number | null;
  review_quality_score: number | null;
  hallucination_risk_score: number | null;
  /** Sprint 12: "Clarification / contradiction detection quality" category score. */
  contradiction_quality_score: number | null;
  /** Sprint 15: "Conversation state / speaker role quality" category score. */
  conversation_state_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EvaluationItem = {
  id: string;
  evaluation_run_id: string;
  category: string;
  label: string;
  score: number | null;
  passed: boolean | null;
  notes: string | null;
  created_at: string;
};

export type AmbiguityFlag = {
  id: string;
  meeting_id: string;
  label: string;
  normalized_label: string;
  description: string | null;
  ambiguity_type: AmbiguityType;
  source_transcript_segment_id: string | null;
  source_quote: string | null;
  priority: ThreadPriority;
  status: AmbiguityStatus;
  created_at: string;
  updated_at: string;
};

/**
 * Sprint 12: a "possible inconsistency" between two separately-evidenced
 * claims - distinct from AmbiguityFlag, which is "something was said, but
 * vaguely/informally/without a clear owner". Never rendered as an alert;
 * always soft, evidence-linked, non-accusatory language (see
 * lib/ai/contradictionDetectorService.ts).
 */
export type ContradictionCandidate = {
  id: string;
  meeting_id: string;
  label: string;
  description: string;
  contradiction_type: ContradictionType;
  severity: ContradictionSeverity;
  status: ContradictionStatus;
  claim_a: string;
  claim_b: string;
  source_transcript_segment_id_a: string | null;
  source_transcript_segment_id_b: string | null;
  source_quote_a: string | null;
  source_quote_b: string | null;
  suggested_clarification_question: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationEventType =
  | "facilitator_question"
  | "facilitator_hypothesis"
  | "facilitator_focus_shift"
  | "stakeholder_fact"
  | "stakeholder_uncertainty"
  | "stakeholder_exception"
  | "stakeholder_correction"
  | "topic_signal"
  | "glossed_over_topic";

export type ConversationEventSourceRole = "facilitator" | "stakeholder" | "mixed" | "unknown";

export type ConversationEventConfidence = "low" | "medium" | "high";

/**
 * Sprint 15: a lightweight, advisory log of what the conversation-state
 * analyzer noticed per transcript segment - never a source for
 * workflow_steps/workflow_components (the extractor remains the only
 * writer for those). See lib/ai/conversationStateAnalyzerService.ts.
 */
export type ConversationEvent = {
  id: string;
  meeting_id: string;
  transcript_segment_id: string | null;
  event_type: ConversationEventType;
  source_role: ConversationEventSourceRole;
  label: string;
  normalized_label: string;
  description: string | null;
  evidence_excerpt: string | null;
  confidence_level: ConversationEventConfidence;
  created_at: string;
  updated_at: string;
};

export type RegressionRunStatus = "completed" | "failed";

export type RegressionResult = "pass" | "warn" | "fail";

/**
 * Sprint 16: one execution of the deterministic regression runner
 * against a scenario-created meeting - see
 * lib/services/regressionRunner.ts. Not an LLM judge and not tied to
 * automated transcript replay; a run always compares whatever the
 * meeting's *current* structured state is against its scenario's
 * expectedOutputs.
 */
export type RegressionRun = {
  id: string;
  meeting_id: string;
  /** DiscoveryScenario.id (lib/scenarios/) - not a foreign key, scenarios are static fixtures. */
  scenario_id: string;
  status: RegressionRunStatus;
  overall_result: RegressionResult;
  summary: string | null;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegressionCheck = {
  id: string;
  regression_run_id: string;
  category: string;
  label: string;
  expected: string | null;
  actual: string | null;
  result: RegressionResult;
  notes: string | null;
  created_at: string;
};

export type ScenarioReplayStatus = "running" | "completed" | "failed";

/**
 * Sprint 17: one automated scenario-replay attempt - creates a fresh
 * meeting, drives it through the real transcript pipeline, then runs a
 * Sprint 16 regression check. See lib/services/scenarioReplayRunner.ts.
 */
export type ScenarioReplayRun = {
  id: string;
  /** DiscoveryScenario.id (lib/scenarios/) - not a foreign key. */
  scenario_id: string;
  meeting_id: string | null;
  regression_run_id: string | null;
  status: ScenarioReplayStatus;
  chunk_count: number;
  chunks_submitted: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BatchRegressionRunStatus = "running" | "completed" | "failed" | "partial";

/**
 * Sprint 22: one row per "run these scenarios" batch click - aggregates
 * results from real, sequential scenario replays. See
 * lib/services/batchRegressionRunner.ts.
 */
export type BatchRegressionRun = {
  id: string;
  status: BatchRegressionRunStatus;
  scenario_count: number;
  completed_count: number;
  failed_count: number;
  total_checks: number;
  total_pass: number;
  total_warn: number;
  total_fail: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BatchRegressionRunItemStatus = "pending" | "running" | "completed" | "failed";

/** Sprint 22: one scenario within a batch_regression_runs batch. */
export type BatchRegressionRunItem = {
  id: string;
  batch_run_id: string;
  /** DiscoveryScenario.id (lib/scenarios/) - not a foreign key. */
  scenario_id: string;
  meeting_id: string | null;
  replay_run_id: string | null;
  regression_run_id: string | null;
  status: BatchRegressionRunItemStatus;
  checks_total: number;
  checks_pass: number;
  checks_warn: number;
  checks_fail: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordingMode = "manual_transcript" | "browser_mic" | "mixed" | "none";

/**
 * Sprint 18: one row per meeting - real-meeting pilot readiness/consent/
 * checklist state. Facilitator-entered only, never written by any AI
 * pipeline. See lib/services/pilotReadiness.ts.
 */
export type MeetingPilotNotes = {
  id: string;
  meeting_id: string;
  pilot_mode: boolean;
  consent_confirmed: boolean;
  consent_note: string | null;
  recording_mode: RecordingMode | null;
  known_limitations_acknowledged: boolean;
  pre_meeting_checklist: Record<string, boolean> | null;
  post_meeting_checklist: Record<string, boolean> | null;
  pilot_notes: string | null;
  issues_observed: string | null;
  followup_actions: string | null;
  created_at: string;
  updated_at: string;
};

/** Mirrors lib/pilotIssueCategories.ts's IssueCategory exactly - same source of truth used for issues_observed chip categorization (Sprint 19) and tracked pilot issues (Sprint 20). */
export type PilotIssueCategory = IssueCategory;

export type PilotIssueSeverity = "low" | "medium" | "high" | "critical";

export type PilotIssueStatus = "open" | "resolved" | "dismissed";

/**
 * Sprint 20: one row per manually-created, lightweight pilot feedback
 * item - open/resolved/dismissed only, no assignments/due dates/comments.
 * Never auto-created from meeting_pilot_notes.issues_observed, no AI
 * extraction. See lib/services/pilotIssues.ts.
 */
export type PilotIssue = {
  id: string;
  meeting_id: string;
  source_pilot_note_id: string | null;
  title: string;
  description: string | null;
  category: PilotIssueCategory;
  severity: PilotIssueSeverity;
  status: PilotIssueStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type Alert = {
  id: string;
  meeting_id: string;
  message: string;
  severity: string;
  created_at: string;
};

export type UserAction = {
  id: string;
  meeting_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type AiRunLog = {
  id: string;
  meeting_id: string | null;
  run_type: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type FieldTestStatus = "planned" | "completed" | "abandoned";

export type FieldTestSuccessDecision = "strong_signal" | "mixed_signal" | "weak_signal" | "not_enough_data";

/**
 * Sprint 32: the capture approach a facilitator planned/used for a
 * remote call - shared between remote_capture_readiness (pre-call plan)
 * and field_tests.capture_setup_used (post-call record), so the two
 * always speak the same vocabulary. See
 * docs/remote-conversation-capture-guide.md for what each option means.
 */
export type RemoteCaptureSetup =
  | "browser_mic_room_audio"
  | "blackhole_virtual_audio"
  | "two_laptop_external_mic"
  | "two_laptop_builtin_mic"
  | "same_laptop_speakers"
  | "manual_notes_primary"
  | "unknown";

export type ManualNotesNeededLevel = "low" | "medium" | "high";

export type HudDistractionLevel = "low" | "medium" | "high";

/**
 * Sprint 28: one row per meeting - real applied-AI field-test planning/
 * debrief/scoring state. Facilitator-entered only, never written by any
 * AI pipeline, never read by export/share. See lib/services/fieldTests.ts.
 * Scores are ordinal 1-5 (see docs/real-applied-ai-field-test-guide.md's
 * scoring rubric), nullable until the facilitator actually scores them.
 * Sprint 32 adds 6 post-call capture-quality columns (remote calls only -
 * null/unused for in-person field tests).
 */
export type FieldTest = {
  id: string;
  meeting_id: string;
  status: FieldTestStatus;
  test_context: string | null;
  selected_scenario_reference: string | null;
  facilitator_goal: string | null;
  participant_disclosure_used: boolean;
  live_capture_used: boolean;
  manual_transcript_used: boolean;
  observer_notes: string | null;
  facilitator_notes: string | null;
  debrief_notes: string | null;
  helped_ask_better_questions: number | null;
  reduced_missed_followups: number | null;
  improved_workflow_understanding: number | null;
  stayed_non_distracting: number | null;
  evidence_trustworthy: number | null;
  applied_ai_judgment_useful: number | null;
  overall_usefulness: number | null;
  success_decision: FieldTestSuccessDecision | null;
  next_iteration_notes: string | null;
  remote_audio_clarity_score: number | null;
  user_voice_balance_score: number | null;
  transcript_usefulness_score: number | null;
  manual_notes_needed: ManualNotesNeededLevel | null;
  hud_distraction_level: HudDistractionLevel | null;
  capture_setup_used: RemoteCaptureSetup | null;
  created_at: string;
  updated_at: string;
};

/**
 * Sprint 32: one row per meeting - the *pre-call* remote-capture setup
 * checklist (which approach the facilitator plans to use, whether it was
 * tested beforehand). Facilitator-entered only, never written by any AI
 * pipeline, never read by export/share. See
 * lib/services/remoteCaptureReadiness.ts and
 * docs/remote-conversation-capture-guide.md.
 */
export type RemoteCaptureReadiness = {
  id: string;
  meeting_id: string;
  capture_setup: RemoteCaptureSetup;
  pre_call_test_completed: boolean;
  remote_audio_captured_clearly: boolean;
  user_voice_dominated: boolean;
  manual_backup_ready: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Partial<Project> & Pick<Project, "name">;
        Update: Partial<Project>;
        Relationships: [];
      };
      work_packages: {
        Row: WorkPackage;
        Insert: Partial<WorkPackage> & Pick<WorkPackage, "project_id" | "name">;
        Update: Partial<WorkPackage>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & Pick<Task, "work_package_id" | "title">;
        Update: Partial<Task>;
        Relationships: [];
      };
      project_events: {
        Row: ProjectEvent;
        Insert: Partial<ProjectEvent> & Pick<ProjectEvent, "project_id" | "entity_type" | "entity_id" | "action">;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; role: "owner" | "viewer"; created_at: string };
        Insert: { id: string; role: "owner" | "viewer"; created_at?: string };
        Update: { role?: "owner" | "viewer" };
        Relationships: [];
      };
      meetings: {
        Row: Meeting;
        Insert: Partial<Meeting> & Pick<Meeting, "name" | "meeting_type">;
        Update: Partial<Meeting>;
        Relationships: [];
      };
      assumptions: {
        Row: Assumption;
        Insert: Partial<Assumption> & Pick<Assumption, "meeting_id" | "text">;
        Update: Partial<Assumption>;
        Relationships: [];
      };
      meeting_context_items: {
        Row: MeetingContextItem;
        Insert: Partial<MeetingContextItem> &
          Pick<MeetingContextItem, "meeting_id" | "content">;
        Update: Partial<MeetingContextItem>;
        Relationships: [];
      };
      discovery_threads: {
        Row: DiscoveryThread;
        Insert: Partial<DiscoveryThread> & Pick<DiscoveryThread, "meeting_id" | "title">;
        Update: Partial<DiscoveryThread>;
        Relationships: [];
      };
      question_directions: {
        Row: QuestionDirection;
        Insert: Partial<QuestionDirection> &
          Pick<QuestionDirection, "discovery_thread_id" | "text">;
        Update: Partial<QuestionDirection>;
        Relationships: [];
      };
      transcript_segments: {
        Row: TranscriptSegment;
        Insert: Partial<TranscriptSegment> & Pick<TranscriptSegment, "meeting_id" | "raw_text">;
        Update: Partial<TranscriptSegment>;
        Relationships: [];
      };
      hypotheses: {
        Row: Hypothesis;
        Insert: Partial<Hypothesis> & Pick<Hypothesis, "meeting_id" | "statement">;
        Update: Partial<Hypothesis>;
        Relationships: [];
      };
      pre_meeting_briefs: {
        Row: PreMeetingBrief;
        Insert: Partial<PreMeetingBrief> &
          Pick<
            PreMeetingBrief,
            "meeting_id" | "brief_summary" | "suggested_opening" | "recommended_focus"
          >;
        Update: Partial<PreMeetingBrief>;
        Relationships: [];
      };
      alerts: {
        Row: Alert;
        Insert: Partial<Alert> & Pick<Alert, "meeting_id" | "message">;
        Update: Partial<Alert>;
        Relationships: [];
      };
      user_actions: {
        Row: UserAction;
        Insert: Partial<UserAction> & Pick<UserAction, "meeting_id" | "action_type">;
        Update: Partial<UserAction>;
        Relationships: [];
      };
      ai_run_logs: {
        Row: AiRunLog;
        Insert: Partial<AiRunLog> & Pick<AiRunLog, "run_type">;
        Update: Partial<AiRunLog>;
        Relationships: [];
      };
      workflows: {
        Row: Workflow;
        Insert: Partial<Workflow> & Pick<Workflow, "meeting_id" | "name">;
        Update: Partial<Workflow>;
        Relationships: [];
      };
      workflow_steps: {
        Row: WorkflowStep;
        Insert: Partial<WorkflowStep> &
          Pick<WorkflowStep, "workflow_id" | "title" | "normalized_title">;
        Update: Partial<WorkflowStep>;
        Relationships: [];
      };
      workflow_components: {
        Row: WorkflowComponent;
        Insert: Partial<WorkflowComponent> &
          Pick<WorkflowComponent, "workflow_id" | "component_type" | "label" | "normalized_label">;
        Update: Partial<WorkflowComponent>;
        Relationships: [];
      };
      workflow_gaps: {
        Row: WorkflowGap;
        Insert: Partial<WorkflowGap> & Pick<WorkflowGap, "workflow_id" | "label" | "normalized_label">;
        Update: Partial<WorkflowGap>;
        Relationships: [];
      };
      post_meeting_reviews: {
        Row: PostMeetingReview;
        Insert: Partial<PostMeetingReview> & Pick<PostMeetingReview, "meeting_id">;
        Update: Partial<PostMeetingReview>;
        Relationships: [];
      };
      evaluation_runs: {
        Row: EvaluationRun;
        Insert: Partial<EvaluationRun> & Pick<EvaluationRun, "meeting_id">;
        Update: Partial<EvaluationRun>;
        Relationships: [];
      };
      evaluation_items: {
        Row: EvaluationItem;
        Insert: Partial<EvaluationItem> &
          Pick<EvaluationItem, "evaluation_run_id" | "category" | "label">;
        Update: Partial<EvaluationItem>;
        Relationships: [];
      };
      ambiguity_flags: {
        Row: AmbiguityFlag;
        Insert: Partial<AmbiguityFlag> &
          Pick<AmbiguityFlag, "meeting_id" | "label" | "normalized_label" | "ambiguity_type">;
        Update: Partial<AmbiguityFlag>;
        Relationships: [];
      };
      contradiction_candidates: {
        Row: ContradictionCandidate;
        Insert: Partial<ContradictionCandidate> &
          Pick<
            ContradictionCandidate,
            "meeting_id" | "label" | "description" | "contradiction_type" | "claim_a" | "claim_b"
          >;
        Update: Partial<ContradictionCandidate>;
        Relationships: [];
      };
      conversation_events: {
        Row: ConversationEvent;
        Insert: Partial<ConversationEvent> &
          Pick<ConversationEvent, "meeting_id" | "event_type" | "source_role" | "label" | "normalized_label">;
        Update: Partial<ConversationEvent>;
        Relationships: [];
      };
      regression_runs: {
        Row: RegressionRun;
        Insert: Partial<RegressionRun> & Pick<RegressionRun, "meeting_id" | "scenario_id">;
        Update: Partial<RegressionRun>;
        Relationships: [];
      };
      regression_checks: {
        Row: RegressionCheck;
        Insert: Partial<RegressionCheck> & Pick<RegressionCheck, "regression_run_id" | "category" | "label">;
        Update: Partial<RegressionCheck>;
        Relationships: [];
      };
      scenario_replay_runs: {
        Row: ScenarioReplayRun;
        Insert: Partial<ScenarioReplayRun> & Pick<ScenarioReplayRun, "scenario_id">;
        Update: Partial<ScenarioReplayRun>;
        Relationships: [];
      };
      meeting_pilot_notes: {
        Row: MeetingPilotNotes;
        Insert: Partial<MeetingPilotNotes> & Pick<MeetingPilotNotes, "meeting_id">;
        Update: Partial<MeetingPilotNotes>;
        Relationships: [];
      };
      pilot_issues: {
        Row: PilotIssue;
        Insert: Partial<PilotIssue> & Pick<PilotIssue, "meeting_id" | "title">;
        Update: Partial<PilotIssue>;
        Relationships: [];
      };
      batch_regression_runs: {
        Row: BatchRegressionRun;
        Insert: Partial<BatchRegressionRun>;
        Update: Partial<BatchRegressionRun>;
        Relationships: [];
      };
      batch_regression_run_items: {
        Row: BatchRegressionRunItem;
        Insert: Partial<BatchRegressionRunItem> & Pick<BatchRegressionRunItem, "batch_run_id" | "scenario_id">;
        Update: Partial<BatchRegressionRunItem>;
        Relationships: [];
      };
      field_tests: {
        Row: FieldTest;
        Insert: Partial<FieldTest> & Pick<FieldTest, "meeting_id">;
        Update: Partial<FieldTest>;
        Relationships: [];
      };
      remote_capture_readiness: {
        Row: RemoteCaptureReadiness;
        Insert: Partial<RemoteCaptureReadiness> & Pick<RemoteCaptureReadiness, "meeting_id">;
        Update: Partial<RemoteCaptureReadiness>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string | null };
    };
  };
};

-- Sprint 25 Part C: Setup Analyst enhancement for Applied AI Discovery.
--
-- One nullable jsonb column on pre_meeting_briefs, populated only when the
-- meeting's meeting_type is 'applied_ai_discovery' (null for every other
-- meeting type, and null for every pre-existing brief row). Holds the
-- applied-AI-specific pre-meeting brief content (suspected workflow pain,
-- likely task/intervention type, data-readiness/risk/human-review/
-- implementation-readiness questions, a smallest-useful-experiment
-- hypothesis, and no-build/not-ready risk) that doesn't fit the existing
-- generic brief fields (must_learn/risk_focus are shared across every
-- meeting type and are capped too small to hold all of this distinctly).
-- See lib/services/setupAnalystService.ts and lib/lenses/appliedAiOpportunityLens.ts.

alter table pre_meeting_briefs add column applied_ai_brief jsonb;

comment on column pre_meeting_briefs.applied_ai_brief is
  'Sprint 25: structured Applied AI Discovery brief content - null for every non-applied_ai_discovery meeting.';

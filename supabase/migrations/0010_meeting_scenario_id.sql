-- Sprint 10: Scenario/Eval Expansion + Live Audio Readiness.
--
-- scenario_id is a plain text pointer into the code-defined scenario
-- fixtures in lib/scenarios/ (DiscoveryScenario.id, e.g.
-- "employee-onboarding-access") - not a foreign key, since scenarios live
-- as fixtures in code rather than as their own database table. Nullable
-- and optional: only set when a meeting is created via "Load demo
-- scenario" on the New Meeting page; every existing meeting and every
-- blank-created meeting keeps this null and behaves exactly as before.

alter table meetings add column scenario_id text;

comment on column meetings.scenario_id is
  'Optional pointer to a DiscoveryScenario.id from lib/scenarios/ - set only when the meeting was created via "Load demo scenario". Not a foreign key; scenarios are code fixtures, not a database table.';

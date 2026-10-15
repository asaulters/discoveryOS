/**
 * Sprint 26 Part B/J (QA1): scriptable assertions for
 * lib/patterns/patternFit.ts - no AI, no database, no test framework
 * dependency added to the project.
 * Run with: npx tsx lib/patterns/patternFit.selftest.ts
 */
import {
  scoreAllPatternFits,
  type PatternFitInput,
  type PatternFitLevel,
} from "./patternFit";
import type { Meeting } from "@/lib/types/database";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passCount++;
  } else {
    failCount++;
    console.error(`FAIL: ${name}`, detail !== undefined ? detail : "");
  }
}

const RANK: Record<PatternFitLevel, number> = {
  not_fit: 0,
  not_enough_info: 1,
  weak: 2,
  possible: 3,
  strong: 4,
};

function atLeast(level: PatternFitLevel, min: PatternFitLevel): boolean {
  return RANK[level] >= RANK[min];
}
function atMost(level: PatternFitLevel, max: PatternFitLevel): boolean {
  return RANK[level] <= RANK[max];
}

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    name: "Test meeting",
    company: null,
    project_id: null,
    meeting_type: "applied_ai_discovery",
    discovery_strategy: "deep_validation",
    goal: null,
    current_understanding: null,
    tentative_build_direction: null,
    risks_unknowns: [],
    status: "live",
    scenario_id: null,
    started_at: null,
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function baseInput(overrides: Partial<PatternFitInput> = {}): PatternFitInput {
  return {
    meeting: makeMeeting(),
    workflowView: null,
    ambiguityFlags: [],
    contradictionCandidates: [],
    appliedAiAssessment: null,
    ...overrides,
  };
}

function fitFor(
  results: ReturnType<typeof scoreAllPatternFits>,
  patternId: string,
) {
  const found = results.find((r) => r.patternId === patternId);
  if (!found) throw new Error(`No result for pattern ${patternId}`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Intake triage / missing info / routing signals
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({
      current_understanding:
        "Requests arrive from multiple channels and are inconsistent. A coordinator manually determines category, owner, and priority for each incoming item, and often has to chase people down because information is missing or incomplete - that back-and-forth to collect missing details is a recurring cause of delay.",
    }),
  });
  const results = scoreAllPatternFits(input);
  const intake = fitFor(results, "intake_triage_assistant");
  const completeness = fitFor(results, "completeness_checker");
  check(
    "1. intake_triage_assistant ranks possible/strong",
    atLeast(intake.fitLevel, "possible"),
    intake,
  );
  check(
    "1. completeness_checker ranks possible/strong",
    atLeast(completeness.fitLevel, "possible"),
    completeness,
  );
}

// ---------------------------------------------------------------------------
// 2. Clear thresholds/rules
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({
      current_understanding:
        "There is a documented rule and a clear threshold for approval - if the amount is over the threshold, it always routes to a second approver. This is a stable, rule-based policy that doesn't change case by case.",
    }),
  });
  const results = scoreAllPatternFits(input);
  const rules = fitFor(results, "rules_automation");
  check(
    "2. rules_automation ranks possible/strong",
    atLeast(rules.fitLevel, "possible"),
    rules,
  );
}

// ---------------------------------------------------------------------------
// 3. Missing visibility/status problem
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({
      current_understanding:
        "Nobody has clear visibility into the status of in-flight work. There's no shared tracking, so the same status question gets asked repeatedly and nobody knows who owns what at any given moment.",
    }),
  });
  const results = scoreAllPatternFits(input);
  const reporting = fitFor(results, "reporting_visibility_layer");
  check(
    "3. reporting_visibility_layer ranks possible/strong",
    atLeast(reporting.fitLevel, "possible"),
    reporting,
  );
}

// ---------------------------------------------------------------------------
// 4. Unclear data, sensitive info, no permissions
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({
      current_understanding:
        "The workflow sometimes involves sensitive customer financial information. It's not yet clear what systems would be touched or what a system would be allowed to do on its own.",
    }),
  });
  const results = scoreAllPatternFits(input);
  const toolAgent = fitFor(results, "tool_using_agent");
  check(
    "4. tool_using_agent is weak or not_enough_info",
    atMost(toolAgent.fitLevel, "weak"),
    toolAgent,
  );
  check(
    "4. tool_using_agent never reaches possible/strong without explicit permissions",
    !atLeast(toolAgent.fitLevel, "possible"),
    toolAgent,
  );
}

// ---------------------------------------------------------------------------
// 5. Ownership/SOP issue with no real AI need
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({
      current_understanding:
        "The real issue seems to be unclear ownership and an undocumented process - nobody agreed on who owns this step, and the intake form itself is inconsistent. A clearer SOP or an updated form might resolve most of the pain.",
    }),
  });
  const results = scoreAllPatternFits(input);
  const noBuild = fitFor(results, "no_build_process_fix");
  check(
    "5. no_build_process_fix ranks possible/strong",
    atLeast(noBuild.fitLevel, "possible"),
    noBuild,
  );
}

// ---------------------------------------------------------------------------
// 6. Thin evidence should never produce a "strong" verdict
// ---------------------------------------------------------------------------
{
  const input = baseInput({
    meeting: makeMeeting({ goal: "Explore automation." }),
  });
  const results = scoreAllPatternFits(input);
  check(
    "6. no pattern reaches 'strong' from near-empty discovery evidence",
    results.every((r) => r.fitLevel !== "strong"),
    results.map((r) => `${r.patternId}:${r.fitLevel}`),
  );
}

console.log(`\n${passCount} passed, ${failCount} failed.`);
if (failCount > 0) {
  process.exit(1);
}

import type { DiscoveryScenario } from "./types";

/**
 * Sprint 10. Tests manual reporting workflows, spreadsheet/multi-source
 * systems, data quality, recurring cadence, and failure consequences. The
 * scenario deliberately contains a "the easy part is X, the risky part is
 * Y" framing (chunk 3) to check the extractor doesn't over-weight the part
 * called "not hard" the way the easy/hard rule intends.
 */
export const spreadsheetReportingAutomationScenario: DiscoveryScenario = {
  id: "spreadsheet-reporting-automation",
  name: "Spreadsheet Reporting Automation Demo",
  description:
    "Weekly manual reporting pulled from Salesforce, a billing CSV export, and a regional-manager spreadsheet, cleaned by hand, reviewed by a manager, and only caught when wrong after the fact by a VP question.",
  meetingSetup: {
    meetingName: "Spreadsheet Reporting Automation Demo",
    meetingType: "automation_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Validate whether a recurring spreadsheet-based reporting process is a good candidate for automation, and identify where data quality, manual cleanup, ownership, and review steps create risk.",
    currentUnderstanding:
      "A team manually gathers data from several sources, cleans it in spreadsheets, and sends a weekly report to leadership.",
    tentativeBuildDirection: "AI-assisted report preparation and summary generation.",
    assumptions: [
      "Report inputs are available in predictable formats each week.",
      "Most manual effort comes from cleanup and summarization.",
    ],
    risks: [
      "Source data may be inconsistent or incomplete.",
      "Leadership may rely on manual review before the report is sent.",
    ],
    pastedContext:
      "This scenario tests manual reporting automation. The current idea is AI-assisted report preparation and summarization, but discovery should validate whether the hard part is summarization, data cleanup, source reliability, review ownership, or exception handling.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — data sources",
      text: "Every Monday, the operations analyst pulls numbers from Salesforce, a CSV export from the billing system, and a shared spreadsheet maintained by the regional managers.",
      expectedSignals: ["operations analyst actor", "regional managers actor", "Salesforce/billing CSV/spreadsheet systems"],
    },
    {
      label: "Chunk 2 — manual cleanup",
      text: "The analyst spends most of the time cleaning up mismatched account names and removing duplicate rows before the report can be trusted.",
      expectedSignals: ["cleanup step", "data-quality gap"],
    },
    {
      label: "Chunk 3 — easy vs risky framing",
      text: "The summary itself is not that hard. The risky part is catching weird outliers, like a region showing zero revenue because someone forgot to upload their spreadsheet.",
      expectedSignals: [
        "outlier-detection step/gap",
        "'summary not hard' is prioritization signal, not proof summarization needs no step",
      ],
    },
    {
      label: "Chunk 4 — review step",
      text: "Before the report goes to leadership, the operations manager reviews the numbers and sometimes asks the analyst to rerun parts of it.",
      expectedSignals: ["operations manager actor", "review/approval step"],
    },
    {
      label: "Chunk 5 — failure detection",
      text: "If the report is wrong, we usually find out when a VP questions the numbers later, which is embarrassing and causes a manual recheck.",
      expectedSignals: ["failure-detection component - no automated check, discovered externally"],
    },
    {
      label: "Chunk 6 — facilitator hypothesis + stakeholder confirmation (Sprint 15 speaker-role test)",
      text: 'Facilitator: "Maybe the opportunity is less about writing the summary and more about validating the source data."\nStakeholder: "Yes, that is right. The summary is easy. The cleanup and outlier detection are the hard parts."',
      expectedSignals: [
        "facilitator_hypothesis tracked (should_track), never itself confirmed evidence",
        "stakeholder confirmation strengthens cleanup/outlier-detection as known evidence, sourced to the stakeholder's own words",
      ],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Pull data from Salesforce, billing export, and regional spreadsheet",
      "Clean mismatched account names",
      "Remove duplicate rows",
      "Check for outliers",
      "Manager review of report",
      "Send report to leadership",
      "Handle post-send error / recheck",
    ],
    expectedActors: ["Operations analyst", "Regional managers", "Operations manager", "Leadership / VP"],
    expectedSystems: ["Salesforce", "Billing system CSV export", "Shared spreadsheet"],
    expectedGaps: [
      "Data validation rules",
      "Source ownership when a region's data is missing",
      "Outlier detection criteria",
      "Review criteria the operations manager applies",
      "Automated failure/error detection before send",
    ],
    expectedEvidenceChecks: [
      "Data-source step quotes chunk 1 ('pulls numbers from Salesforce', 'CSV export from the billing system', 'shared spreadsheet maintained by the regional managers')",
      "Cleanup step quotes chunk 2 ('cleaning up mismatched account names', 'removing duplicate rows')",
      "Outlier gap quotes chunk 3 ('catching weird outliers')",
      "Review step quotes chunk 4 ('operations manager reviews the numbers')",
      "Failure-detection quotes chunk 5 ('find out when a VP questions the numbers later')",
      "All three data sources appear as distinct `system` components, not merged into one generic 'data sources' item",
    ],
    expectedReviewAssessment:
      "needs_reframing - AI summarization alone is too narrow; the better opportunity is data validation, cleanup support, outlier detection, and review-workflow support, since chunk 3 and chunk 5 both point at data quality and failure detection as the real risk, not the summary itself.",
    expectedAmbiguities: [
      "Summary framed as 'not hard' while cleanup/outliers are the actual risk (chunk 3) - a hedge worth flagging, not a contradiction",
      "Source ownership when a region's spreadsheet is missing is implied but not stated (chunk 1/3)",
    ],
    expectedClarifications: [
      "Tentative build direction is AI-assisted summary generation, but the transcript says the summary itself is not that hard while catching outliers is the risky part (chunk 3) - a build_assumption_conflict, since the direction targets the part explicitly called easy",
    ],
    expectedSpeakerRoleNotes: [
      "Chunk 6's facilitator hypothesis ('maybe the opportunity is less about writing the summary...') should be tracked as a hypothesis (conversation_events, facilitator_hypothesis), never written into workflow_steps/components as a confirmed fact by itself.",
      "The stakeholder's confirming line ('Yes, that is right... The cleanup and outlier detection are the hard parts.') is what should evidence cleanup/outlier-detection as known - not the facilitator's original question.",
      "Suggested directions after chunk 6 should follow validation/cleanup/outlier-detection, not jump to an unrelated topic.",
    ],
  },
  evaluationNotes: [
    "Workflow extraction accuracy: confirm all three chunk-1 sources (Salesforce, billing CSV, regional spreadsheet) get their own system components rather than being flattened into a single 'data sources' item - this is the scenario's main system/tool-checklist stress test.",
    "Gap quality: confirm the extractor doesn't over-index on chunk 3's 'summary itself is not that hard' framing by skipping a step for summarization, or by under-weighting the outlier-detection gap it explicitly points at instead.",
    "Hallucination checks: confirm the CSV export and shared spreadsheet are treated as two distinct systems, not merged or invented as a single named tool that wasn't actually mentioned.",
    "Review usefulness: the assessment should specifically call out data validation / cleanup support / outlier detection as the real opportunity, not a generic 'automate the report' framing.",
  ],
};

import type { DiscoveryScenario } from "./types";
import { documentIntakeRoutingScenario } from "./documentIntakeRouting";
import { employeeOnboardingAccessScenario } from "./employeeOnboardingAccess";
import { supportEscalationWorkflowScenario } from "./supportEscalationWorkflow";
import { spreadsheetReportingAutomationScenario } from "./spreadsheetReportingAutomation";
import { procurementApprovalWorkflowScenario } from "./procurementApprovalWorkflow";
import { customerOnboardingHandoffScenario } from "./customerOnboardingHandoff";
import { appliedAiIntakeTriageScenario } from "./appliedAiIntakeTriage";
import { smbLeadIntakeTriageScenario } from "./smbLeadIntakeTriage";
import { complianceDocumentReviewScenario } from "./complianceDocumentReview";
import { knowledgeBaseSupportAssistantScenario } from "./knowledgeBaseSupportAssistant";
import { invoiceExceptionHandlingScenario } from "./invoiceExceptionHandling";
import { clientProjectIntakeDiscoveryScenario } from "./clientProjectIntakeDiscovery";
import { internalReportingVisibilityScenario } from "./internalReportingVisibility";

export type {
  DiscoveryScenario,
  ScenarioMeetingSetup,
  ScenarioTranscriptChunk,
  ScenarioExpectedOutputs,
  ScenarioExpectedPatternFits,
  ScenarioType,
  PrimaryDiscoveryMode,
  ScenarioDifficulty,
  FieldTestRelevance,
  ScenarioFieldTestNotes,
} from "./types";

/** Order here is display order in the "Load demo scenario" dropdown. */
export const SCENARIOS: DiscoveryScenario[] = [
  documentIntakeRoutingScenario,
  employeeOnboardingAccessScenario,
  supportEscalationWorkflowScenario,
  spreadsheetReportingAutomationScenario,
  procurementApprovalWorkflowScenario,
  customerOnboardingHandoffScenario,
  appliedAiIntakeTriageScenario,
  smbLeadIntakeTriageScenario,
  complianceDocumentReviewScenario,
  knowledgeBaseSupportAssistantScenario,
  invoiceExceptionHandlingScenario,
  clientProjectIntakeDiscoveryScenario,
  internalReportingVisibilityScenario,
];

export function getScenarioById(id: string): DiscoveryScenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * Sprint 27 Part D: a "[Applied AI] " prefix for scenario selectors so the
 * expanded library stays easy to scan - based on `meetingSetup.meetingType`
 * (always present) rather than the optional Sprint 27 Part B metadata, so
 * it works for every applied_ai_discovery scenario including Sprint 25's
 * Applied AI Intake Triage Demo, which predates the Part B fields.
 */
export function getScenarioDisplayLabel(scenario: DiscoveryScenario): string {
  return scenario.meetingSetup.meetingType === "applied_ai_discovery" ? `[Applied AI] ${scenario.name}` : scenario.name;
}

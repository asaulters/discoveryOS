import type {
  ExportEvidenceRef,
  ExportGapItem,
  MeetingExportModel,
} from "@/lib/services/meetingExportBuilder";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BUILD_DIRECTION_LABELS: Record<string, string> = {
  supported: "Supported",
  partially_supported: "Partially supported",
  weakened: "Weakened",
  needs_reframing: "Needs reframing",
};

/** Short evidence/trust annotation shared by steps, components, and gaps - e.g. "known, confirmed, human-verified, locked". */
function evidenceNote(item: ExportEvidenceRef | Omit<ExportEvidenceRef, "confidenceLevel">): string {
  const parts: string[] = [item.evidenceType];
  if ("confidenceLevel" in item) parts.push(item.confidenceLevel);
  if (item.humanEdited) parts.push("human-edited");
  if (item.humanVerified) parts.push("human-verified");
  if (item.lockedByUser) parts.push("locked");
  return parts.join(", ");
}

function gapLine(gap: ExportGapItem): string {
  const base = gap.description ? `**${gap.label}** — ${gap.description}` : `**${gap.label}**`;
  return `- ${base} _(${evidenceNote(gap)})_`;
}

/**
 * Renders a MeetingExportModel to plain, copy-pasteable Markdown. Pure
 * function, no I/O - every section is omitted entirely (not shown as an
 * empty heading) when it has no data, per Sprint 14's "do not invent
 * missing sections" requirement. Terminology here intentionally matches
 * the Sprint 13.5 UI relabeling: "possible mismatch" not "contradiction",
 * "needs clarification" not "ambiguity flag", "still unclear" not
 * "workflow gap", "process so far" not "workflow".
 */
export function buildMeetingMarkdown(model: MeetingExportModel): string {
  const lines: string[] = [];

  lines.push(`# Meeting Review: ${model.meeting.name}`);
  lines.push("");

  const metaParts = [model.meeting.meetingType];
  if (model.meeting.discoveryStrategy) metaParts.push(model.meeting.discoveryStrategy);
  if (model.meeting.company) metaParts.push(model.meeting.company);
  lines.push(`*${metaParts.join(" · ")} — ${formatDate(model.meeting.date)}*`);
  if (model.meeting.scenarioName) {
    lines.push(`*Scenario: ${model.meeting.scenarioName}*`);
  }
  lines.push(`*Generated ${formatDateTime(model.generatedAt)}*`);
  lines.push("");

  // Executive Summary
  if (model.executiveSummary || model.knownFacts.length > 0 || model.inferences.length > 0) {
    lines.push("## Executive Summary");
    lines.push("");
    if (model.executiveSummary) {
      lines.push(model.executiveSummary);
      lines.push("");
    }
    if (model.knownFacts.length > 0) {
      lines.push("**Known facts:**");
      for (const fact of model.knownFacts) lines.push(`- ${fact}`);
      lines.push("");
    }
    if (model.inferences.length > 0) {
      lines.push("**Inferences (not confirmed):**");
      for (const inference of model.inferences) lines.push(`- ${inference}`);
      lines.push("");
    }
  }

  // Build Direction Assessment
  if (model.buildDirectionAssessment) {
    const assessment = model.buildDirectionAssessment;
    lines.push("## Build Direction Assessment");
    lines.push("");
    lines.push(`**Status:** ${BUILD_DIRECTION_LABELS[assessment.status] ?? assessment.status}`);
    lines.push("");
    lines.push(assessment.assessment);
    if (assessment.recommendedReframe) {
      lines.push("");
      lines.push(`**Recommended reframe:** ${assessment.recommendedReframe}`);
    }
    lines.push("");
  }

  // Process So Far
  if (model.processSummary || model.processSteps.length > 0) {
    lines.push("## Process So Far");
    lines.push("");
    if (model.processSummary) {
      lines.push(model.processSummary);
      lines.push("");
    }
    model.processSteps.forEach((step, index) => {
      const base = step.description ? `**${step.title}** — ${step.description}` : `**${step.title}**`;
      lines.push(`${index + 1}. ${base} _(${evidenceNote(step)})_`);
    });
    if (model.processSteps.length > 0) lines.push("");
  }

  // People, Teams, and Systems
  if (model.peopleAndSystems.length > 0) {
    lines.push("## People, Teams, and Systems");
    lines.push("");
    for (const item of model.peopleAndSystems) {
      const base = item.description
        ? `**${item.label}** (${item.componentType}) — ${item.description}`
        : `**${item.label}** (${item.componentType})`;
      lines.push(`- ${base} _(${evidenceNote(item)})_`);
    }
    lines.push("");
  }

  // Still Unclear (open gaps + any review open-questions folded in)
  if (model.stillUnclear.length > 0 || model.reviewOpenQuestions.length > 0) {
    lines.push("## Still Unclear");
    lines.push("");
    for (const gap of model.stillUnclear) lines.push(gapLine(gap));
    if (model.stillUnclear.length > 0 && model.reviewOpenQuestions.length > 0) lines.push("");
    if (model.reviewOpenQuestions.length > 0) {
      lines.push("_From the post-meeting review:_");
      lines.push("");
      for (const q of model.reviewOpenQuestions) {
        lines.push(`- **${q.question}** (${q.priority}) — ${q.whyItMatters}`);
      }
    }
    lines.push("");
  }

  // Needs Clarification
  if (model.needsClarification.length > 0) {
    lines.push("## Needs Clarification");
    lines.push("");
    for (const flag of model.needsClarification) {
      const base = flag.description
        ? `**${flag.label}** — ${flag.description}`
        : `**${flag.label}**`;
      lines.push(`- ${base} _(${flag.ambiguityType}, ${flag.priority} priority)_`);
      if (flag.sourceQuote) lines.push(`  > "${flag.sourceQuote}"`);
    }
    lines.push("");
  }

  // Possible Mismatches
  if (model.possibleMismatches.length > 0) {
    lines.push("## Possible Mismatches");
    lines.push("");
    for (const mismatch of model.possibleMismatches) {
      lines.push(`- **${mismatch.label}** _(${mismatch.contradictionType}, ${mismatch.severity} severity)_`);
      lines.push(`  - ${mismatch.description}`);
      lines.push(`  - Claim A: ${mismatch.claimA}${mismatch.quoteA ? ` ("${mismatch.quoteA}")` : ""}`);
      lines.push(`  - Claim B: ${mismatch.claimB}${mismatch.quoteB ? ` ("${mismatch.quoteB}")` : ""}`);
      if (mismatch.suggestedQuestion) {
        lines.push(`  - Suggested question: ${mismatch.suggestedQuestion}`);
      }
    }
    lines.push("");
  }

  // Recommended Follow-Ups
  if (model.recommendedFollowups.length > 0) {
    lines.push("## Recommended Follow-Ups");
    lines.push("");
    for (const followup of model.recommendedFollowups) {
      lines.push(`- **${followup.topic}** (${followup.priority} priority) — ${followup.question}`);
    }
    lines.push("");
  }

  // Evidence Highlights
  if (model.evidenceHighlights.length > 0) {
    lines.push("## Evidence Highlights");
    lines.push("");
    for (const highlight of model.evidenceHighlights) {
      lines.push(`- **${highlight.label}:** "${highlight.quote}"`);
    }
    lines.push("");
  }

  // Notes on Certainty
  lines.push("## Notes on Certainty");
  lines.push("");
  for (const note of model.knownLimitations) lines.push(`- ${note}`);
  lines.push("");

  return lines.join("\n").trim() + "\n";
}

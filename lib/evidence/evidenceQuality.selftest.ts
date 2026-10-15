/**
 * Sprint 23: scriptable assertions for lib/evidence/evidenceQuality.ts -
 * no AI, no database, no test framework dependency added to the project.
 * Run with: npx tsx lib/evidence/evidenceQuality.selftest.ts
 */
import { assessEvidenceQuality, type EvidenceQualityInput } from "./evidenceQuality";

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

function assessKnown(quote: string | null, claimTitle: string, segmentText: string, claimDescription = ""): ReturnType<typeof assessEvidenceQuality> {
  const input: EvidenceQualityInput = {
    claimTitle,
    claimDescription,
    quote,
    segmentText,
    evidenceType: "known",
  };
  return assessEvidenceQuality(input);
}

// ---------------------------------------------------------------------------
// The real Sprint 22 case: workflow component "Support agent", quote
// "support agent" - a real substring but a pure label echo.
// ---------------------------------------------------------------------------
{
  const segment =
    "When a customer ticket comes in, a support agent reads the issue, checks the customer tier, and looks at the product area before deciding whether to handle it themselves or escalate it.";
  const result = assessKnown(
    "support agent",
    "Support agent",
    segment,
    "The support agent is responsible for reviewing customer tickets and deciding on handling or escalation."
  );
  check("Sprint 22 case: severity is fail", result.severity === "fail", result);
  check("Sprint 22 case: isValid is false", result.isValid === false, result);
  check(
    "Sprint 22 case: flags label echo",
    result.reasons.some((r) => r.toLowerCase().includes("identical to the item's own label")),
    result.reasons
  );
}

// ---------------------------------------------------------------------------
// Part I: examples that should still pass as known evidence.
// ---------------------------------------------------------------------------
const shouldPass: { claimTitle: string; quote: string; segmentText: string }[] = [
  {
    claimTitle: "Legal approval",
    quote: "Legal has to approve some of those before they go out.",
    segmentText: "Legal has to approve some of those before they go out.",
  },
  {
    claimTitle: "Jira Service Management",
    quote: "We use Jira Service Management for the intake.",
    segmentText: "We use Jira Service Management for the intake.",
  },
  {
    claimTitle: "Salesforce data pull",
    quote: "The analyst pulls numbers from Salesforce every morning.",
    segmentText: "The analyst pulls numbers from Salesforce every morning.",
  },
  {
    claimTitle: "Manager review of report",
    quote: "Before the report goes to leadership, the operations manager reviews the numbers for anything that looks off.",
    segmentText:
      "Before the report goes to leadership, the operations manager reviews the numbers for anything that looks off.",
  },
  {
    claimTitle: "Failure detection",
    quote: "If something gets routed wrong, someone notices a few days later when the customer follows up.",
    segmentText: "If something gets routed wrong, someone notices a few days later when the customer follows up.",
  },
];

for (const { claimTitle, quote, segmentText } of shouldPass) {
  const result = assessKnown(quote, claimTitle, segmentText);
  check(`Part I pass example ("${claimTitle}") is pass`, result.severity === "pass", result);
}

// ---------------------------------------------------------------------------
// Part I: examples that should fail or downgrade as known evidence.
// ---------------------------------------------------------------------------
const shouldNotPass: { claimTitle: string; quote: string; segmentText: string }[] = [
  { claimTitle: "Escalation owner is the support lead", quote: "Yes.", segmentText: "Yes." },
  { claimTitle: "Escalation owner is the support lead", quote: "Right.", segmentText: "Right." },
  { claimTitle: "Escalation owner is the support lead", quote: "That is correct.", segmentText: "That is correct." },
  { claimTitle: "Review cadence", quote: "Usually.", segmentText: "Usually." },
  { claimTitle: "Approval threshold", quote: "It depends.", segmentText: "It depends." },
  { claimTitle: "Escalation owner", quote: "Someone handles it.", segmentText: "Someone handles it." },
  { claimTitle: "Process", quote: "The process.", segmentText: "The process." },
  { claimTitle: "That part", quote: "That part.", segmentText: "That part." },
  { claimTitle: "Known issue", quote: "The issue is there.", segmentText: "The issue is there." },
  { claimTitle: "Review criteria unclear", quote: "review process", segmentText: "the review process is what it is" },
  { claimTitle: "Failure detection", quote: "someone notices", segmentText: "someone notices eventually" },
];

for (const { claimTitle, quote, segmentText } of shouldNotPass) {
  const result = assessKnown(quote, claimTitle, segmentText);
  check(`Part I fail/downgrade example ("${quote}") is not pass`, result.severity !== "pass", result);
}

// ---------------------------------------------------------------------------
// Structural checks: missing quote, fabricated quote, evidence-type sensitivity.
// ---------------------------------------------------------------------------
{
  const result = assessKnown(null, "Legal approval", "Legal has to approve some of those.");
  check("Missing quote on known item is fail", result.severity === "fail", result);
}
{
  const result = assessKnown("this was never said", "Legal approval", "Legal has to approve some of those.");
  check("Fabricated/non-substring quote is fail", result.severity === "fail", result);
}
{
  // Same weak quote, but evidence_type "inferred" - should not be a hard fail (warn tolerated).
  const result = assessEvidenceQuality({
    claimTitle: "Escalation owner",
    quote: "someone handles it",
    segmentText: "someone handles it eventually",
    evidenceType: "inferred",
  });
  check("Weak quote on inferred item is not fail", result.severity !== "fail", result);
}
{
  // Gaps (unknown) tolerate a short/vague quote entirely.
  const result = assessEvidenceQuality({
    claimTitle: "Ownership after escalation",
    quote: "someone notices",
    segmentText: "someone notices eventually, nobody owns it directly",
    evidenceType: "unknown",
  });
  check("Vague quote on a gap (unknown) is pass", result.severity === "pass", result);
}
{
  // Gaps still reject an outright fabricated quote.
  const result = assessEvidenceQuality({
    claimTitle: "Ownership after escalation",
    quote: "this text does not appear anywhere",
    segmentText: "someone notices eventually",
    evidenceType: "unknown",
  });
  check("Fabricated quote on a gap is fail", result.severity === "fail", result);
}
{
  // Facilitator-sourced quote guard.
  const result = assessEvidenceQuality({
    claimTitle: "Escalation happens after three days",
    quote: "maybe this escalates after about three days or so",
    segmentText: "Facilitator: maybe this escalates after about three days or so?",
    evidenceType: "known",
    facilitatorExcerpts: ["maybe this escalates after about three days or so"],
  });
  check("Facilitator-sourced quote on known item is fail", result.severity === "fail", result);
  check(
    "Facilitator-sourced quote reason mentions facilitator",
    result.reasons.some((r) => r.toLowerCase().includes("facilitator")),
    result.reasons
  );
}

// ---------------------------------------------------------------------------
// quoteIsUntrustworthy / reasonCodes: the signal Part C's persistence
// integration relies on to decide "drop the quote" vs. "keep it, just
// downgrade the evidence_type."
// ---------------------------------------------------------------------------
{
  // Real Sprint 22 case again: a REAL (verified-substring) but weak quote -
  // should be downgradable while keeping the quote for context, not dropped.
  const segment =
    "When a customer ticket comes in, a support agent reads the issue, checks the customer tier, and looks at the product area before deciding whether to handle it themselves or escalate it.";
  const result = assessKnown(
    "support agent",
    "Support agent",
    segment,
    "The support agent is responsible for reviewing customer tickets and deciding on handling or escalation."
  );
  check("Sprint 22 case: quote is real, so NOT untrustworthy", result.quoteIsUntrustworthy === false, result);
  check("Sprint 22 case: reasonCodes includes label_echo", result.reasonCodes.includes("label_echo"), result.reasonCodes);
}
{
  const result = assessKnown("this was never said", "Legal approval", "Legal has to approve some of those.");
  check("Fabricated quote: quoteIsUntrustworthy is true", result.quoteIsUntrustworthy === true, result);
  check("Fabricated quote: reasonCodes includes non_substring", result.reasonCodes.includes("non_substring"), result.reasonCodes);
}
{
  const result = assessKnown(null, "Legal approval", "Legal has to approve some of those.");
  check("Missing quote: quoteIsUntrustworthy is true", result.quoteIsUntrustworthy === true, result);
}

console.log(`\n${passCount} passed, ${failCount} failed.`);
if (failCount > 0) {
  process.exit(1);
}

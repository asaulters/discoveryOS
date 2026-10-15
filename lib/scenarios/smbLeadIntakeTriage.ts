import type { DiscoveryScenario } from "./types";

/**
 * Sprint 27 Part A: freelance/client-style discovery for a small service
 * business (home services trade) with no CRM and multi-channel lead
 * intake. Deliberately has no named system/tool anywhere in the
 * transcript ("I don't have a CRM, it's really just my phone and a
 * notebook") - a second hallucination-guardrail case alongside Document
 * Intake Routing Demo, this time in a freelance/client context rather
 * than internal ops.
 */
export const smbLeadIntakeTriageScenario: DiscoveryScenario = {
  id: "smb-lead-intake-triage",
  name: "SMB Lead Intake Triage Demo",
  description:
    "A small residential plumbing/HVAC business owner triaging leads from a website form, email, Facebook Messenger, and referrals with no CRM - tests freelance/client-style Applied AI Discovery and the pull toward full automation when the owner explicitly wants to stay in the loop.",
  meetingSetup: {
    meetingName: "SMB Lead Intake Triage Demo",
    meetingType: "applied_ai_discovery",
    discoveryStrategy: "deep_validation",
    goal: "Determine whether lead intake and follow-up should use AI assist, automation, workflow redesign, or no-build.",
    currentUnderstanding:
      "Leads arrive through the website contact form, email, Facebook Messenger, and referrals. The owner manually reviews each one to decide urgency, service type, and who follows up.",
    tentativeBuildDirection: "AI-assisted lead triage and missing-info checking.",
    assumptions: [
      "Lead types are predictable.",
      "Missing information causes follow-up delays.",
      "Fast response matters for revenue.",
      "The CRM process may be immature.",
      "Full automation may be risky.",
    ],
    risks: [
      "Bad routing could lose revenue.",
      "Customers may be frustrated by a delayed or wrong response.",
      "No clean CRM/SOP exists yet.",
    ],
    pastedContext:
      "This is a demo scenario for DiscoveryOS's Applied AI Discovery mode, in a freelance/client-style context: a small residential plumbing and HVAC service business owner, evaluating lead intake. The owner and a technician named Mike are the only two people involved. The current idea is AI-assisted triage and completeness checking, but discovery should validate whether that's the right intervention versus a simpler CRM/SOP fix, and should surface missing-info patterns, revenue risk, and how much the owner actually wants to stay in the loop.",
  },
  transcriptChunks: [
    {
      label: "Chunk 1 — multi-channel, inconsistent leads",
      text: "Leads come in through the contact form on our website, sometimes through email, sometimes somebody messages us on Facebook, and every so often somebody refers a neighbor and they just call. They all show up completely differently — the form has some fields, but the Facebook messages are just whatever someone decides to type.",
      expectedSignals: ["Multiple lead channels", "Inconsistent lead format"],
    },
    {
      label: "Chunk 2 — missing information",
      text: "Half the time I don't get a phone number, or they don't say what part of town they're in, so I don't even know if it's in our service area. Sometimes they don't say what they actually need — is it a leak, is it a new install — and I definitely don't get a sense of urgency or budget most of the time. If it's something urgent I try to get it to Mike same day, but if it's simple I'll just handle the callback myself.",
      expectedSignals: ["Missing phone/service area/urgency/budget", "Owner and Mike (technician) as actors"],
    },
    {
      label: "Chunk 3 — owner wants speed but not auto-booking",
      text: "I know I need to get back to people fast, because if I take two days somebody else already got the job. But I would not want something auto-booking a job on the calendar without me looking at it first — if it books the wrong thing or sends someone to the wrong side of town, that's a wasted trip and an annoyed customer.",
      expectedSignals: ["Speed matters for revenue", "Explicit rejection of full automation"],
    },
    {
      label: "Chunk 4 — no CRM, revenue risk",
      text: "There's no real system for this right now. I don't have a CRM, it's really just my phone and a notebook half the time. If a good lead falls through the cracks because I didn't get to it, that's real money walking away.",
      expectedSignals: ["No CRM/system - hallucination guardrail", "Revenue risk from dropped leads"],
    },
    {
      label: "Chunk 5 — safe first version",
      text: "Something that read the message and told me — hey, this looks urgent, this is probably a repair not an install, and by the way you're missing their phone number — that would already help a ton, even if I still make every call myself.",
      expectedSignals: ["AI-assist triage + completeness framing", "Human-in-the-loop requirement"],
    },
    {
      label: "Chunk 6 — success metrics",
      text: "I'd know it worked if I stopped losing leads to slow response time, and if I wasn't the one having to chase people for their address or phone number anymore.",
      expectedSignals: ["Reduced lost leads", "Reduced manual chasing for missing info"],
    },
  ],
  expectedOutputs: {
    expectedWorkflowSteps: [
      "Receive lead from website form, email, Facebook, or referral",
      "Review lead to determine urgency, service type, and service area",
      "Check lead for missing contact or service information",
      "Assign lead to owner or technician for follow-up",
    ],
    expectedActors: ["Owner", "Mike"],
    expectedSystems: [],
    expectedGaps: [
      "Clear CRM or system for tracking leads",
      "Definition of what counts as urgent versus routine",
      "Service area boundaries",
      "Who follows up on urgent versus non-urgent leads",
    ],
    expectedEvidenceChecks: [
      "Multi-channel/inconsistent-format quotes chunk 1",
      "Missing phone/area/urgency/budget quotes chunk 2",
      "No-auto-booking quote chunk 3 ('I would not want something auto-booking')",
      "No-CRM quote chunk 4 ('I don't have a CRM') - no system component should ever be fabricated",
      "AI-assist/human-in-the-loop framing quotes chunk 5",
    ],
    expectedReviewAssessment:
      "partially_supported - the transcript directly supports an AI-assist triage-and-completeness-check tool with the owner retaining every call, but the lack of any CRM/SOP and unclear owner-vs-technician routing keep a fuller automation claim premature.",
    expectedAmbiguities: [
      "What counts as 'urgent' is not clearly defined",
      "Service area boundaries are not clearly defined",
    ],
    expectedPatternFits: {
      expectedPossibleOrStrongPatternIds: ["completeness_checker", "intake_triage_assistant"],
      expectedSupportingPatternIds: ["human_in_the_loop_review_queue", "draft_generation_assistant", "no_build_process_fix"],
      expectedWeakOrNotReadyPatternIds: ["tool_using_agent", "voice_conversation_agent"],
    },
  },
  evaluationNotes: [
    "Workflow extraction should capture the receive/review/check-missing-info/assign steps and the Owner/Mike actors.",
    "No system component should ever appear - chunk 4 explicitly says there's no CRM, only a phone and a notebook.",
    "The build-direction assessment should land on partially_supported, not a full endorsement - the owner's own words explicitly rule out auto-booking.",
  ],
  scenarioType: "freelance_client",
  primaryDiscoveryMode: "applied_ai_discovery",
  expectedPrimaryRecommendation: "ai_assist",
  expectedTopPatterns: ["completeness_checker", "intake_triage_assistant"],
  expectedWeakOrUnsafePatterns: ["tool_using_agent", "voice_conversation_agent"],
  difficulty: "messy",
  fieldTestRelevance: "high",
  fieldTestUse: {
    approximates:
      "A freelance/consulting discovery call with a small service-business owner (e.g. home services) who has no formal CRM.",
    facilitatorSkillTested:
      "Separating a genuine AI-assist opportunity from a missing-process/no-CRM problem, and resisting the pull toward full automation when the owner explicitly wants to stay in the loop.",
    discoveryOsBehaviorStressed:
      "Missing-info detection, lead-routing ambiguity, revenue-risk framing, and human-review judgment under a messy multi-channel intake.",
    successValidates:
      "Whether suggested directions help identify the safest first version (triage + completeness draft) rather than jumping to full automated booking.",
  },
};

# Applied AI Pattern Library

Sprint 26 added an **Applied AI Pattern Library** and a deterministic
**Use Case Fit Lens** - a way to map a discovered workflow onto modern
applied-AI implementation patterns while being explicit about when those
patterns are appropriate, overkill, unsafe, premature, or better handled
by non-AI process improvement.

This keeps DiscoveryOS aware of current applied-AI patterns (RAG,
tool-using agents, voice agents) without chasing hype: agentic/voice
patterns are written with narrow, explicit fit conditions and are never
the default recommendation.

## 1. Purpose

A recommendation type ("AI assist", "not ready", etc. - see the [Applied
AI Discovery Playbook](applied-ai-discovery-playbook.md)) answers *what
kind of intervention fits*. The pattern library answers a narrower,
more concrete question: *if this is AI assist, which specific shape of
AI assist, and what would make it safe to try?* Patterns exist to give a
facilitator (and eventually an implementer) a vocabulary for that
second question - grounded in what's actually been discovered, not in
whatever pattern is currently fashionable.

## 2. Why pattern fit is not the same as recommendation

The Applied AI opportunity assessment (Sprint 25) produces one
`recommendationType` for the whole opportunity. Pattern fit
(`lib/patterns/patternFit.ts`) scores *every* pattern in the library
independently against the same evidence, deterministically, with no AI
call. A meeting can have a `recommendationType` of `ai_assist` and still
show most patterns as "weak" or "not enough info" - that's expected. Fit
scoring is a screening tool, not a second vote on the recommendation, and
it never overrides the recommendation or vice versa.

## 3. Pattern list

Defined in [`lib/patterns/appliedAiPatterns.ts`](../lib/patterns/appliedAiPatterns.ts):

| Pattern | For |
| --- | --- |
| Intake triage assistant | Routing/classifying incoming requests, suggesting owner/priority/category |
| Completeness checker | Flagging missing required fields/materials before work proceeds |
| Structured extraction | Turning messy documents/messages into structured fields |
| Summarization assistant | Summarizing long cases, calls, tickets, documents, or research |
| Knowledge / RAG assistant | Answering questions from a trusted internal knowledge source |
| Draft generation assistant | Drafting emails, responses, reports, notes, plans, or copy |
| Review / QA assistant | Checking outputs against criteria, policy, evidence, or risk flags |
| Decision-support copilot | Presenting evidence/options/risks while a human decides |
| Rules automation | Deterministic rules, thresholds, routing, or approvals - no generative AI |
| Workflow orchestration | Coordinating steps across systems/people with known logic but messy handoffs |
| Tool-using agent | Multi-step tasks using tools/APIs - **only** with bounded, reversible/reviewable actions and explicit permissions |
| Human-in-the-loop review queue | AI drafts/recommends; human approval remains required |
| Monitoring / alerting assistant | Detecting exceptions, missing items, anomalies, or overdue work |
| Multimodal intake assistant | Images, scanned docs, voice, screenshots, PDFs, or mixed media |
| Voice / conversation agent | Conversational intake/support/scheduling - **only** with explicit voice channel, consent, and escalation |
| Reporting / visibility layer | The real problem is lack of status/ownership/metrics, not AI reasoning |
| No-build process fix | Clearer ownership, an intake/form change, SOP cleanup, or training - no build at all |

Open the fixture file for each pattern's full `bestFor`/`signals`/
`requiredEvidence`/`notAFitWhen`/`risks`/`humanReviewNeeds`/
`exampleQuestions`.

## 4. Fit levels

`lib/patterns/patternFit.ts` scores every pattern against the meeting's
workflow, gaps, ambiguity/clarification items, and (if generated) the
Applied AI opportunity assessment - deterministically, with no AI call.
Each pattern comes back with one of five levels:

| Level | Meaning |
| --- | --- |
| **Strong fit** | Well-evidenced - still worth validating before committing to a build, never a green light to build immediately. |
| **Possible fit** | Plausible given what's known, worth validating - not yet confirmed. |
| **Weak fit** | Thin support - more discovery needed before this is a real candidate. |
| **Not enough info** | Too little evidence yet to judge this pattern either way - ask more before recommending. |
| **Not a fit** | The evidence actively points away from this pattern right now - avoid it for now. |

Two important properties, both enforced in code, not just convention:

- **"Strong" requires real evidence.** A pattern can only reach "strong"
  when its `requiredEvidence` is actually present and there's enough
  overall discovery content - never from vague signal-matching alone.
  When evidence is thin, the scorer prefers "possible" or "not enough
  info" over "strong."
- **High-autonomy patterns have a hard ceiling.** `tool_using_agent` and
  `voice_conversation_agent` can never reach "possible" or "strong"
  without their specific required context confirmed (explicit tool
  permissions/action boundaries, or an explicit voice channel,
  respectively) - regardless of how the rest of the score computes. This
  is a safety ceiling, not just a scoring penalty.

## 5. How to use pattern fit in discovery

1. Generate the Applied AI opportunity assessment (Review page) once
   there's a real workflow model to score against.
2. Read the "Applied AI pattern fit" section underneath it - top fits
   first, full results behind "Show all N pattern results."
3. Treat every fit as a hypothesis to validate in the next conversation,
   using its `suggestedValidationQuestions` - never as a decision already
   made.
4. Pay attention to `missingEvidence` and `whyNotYet` - these are exactly
   what the next discovery conversation should go confirm or rule out.

## 6. Human-in-the-loop guidance

Most patterns in this library assume a human stays in the loop, at least
initially: `human_in_the_loop_review_queue` is a first-class pattern in
its own right, not a fallback. When a pattern's `humanReviewNeeds` says a
human should approve before anything takes effect, that's not a
temporary training-wheels state to remove as soon as possible - it's the
safe default until there's a deliberate, evidenced reason to loosen it.

## 7. When not to use agents

`tool_using_agent` and `voice_conversation_agent` are real, legitimate
patterns - but never the default answer. Don't recommend either one
unless:

- **Tool-using agent**: the exact systems/tools/APIs involved are named
  concretely, permission/access boundaries are explicit, and actions are
  reversible or reviewable before taking effect.
- **Voice/conversation agent**: the channel is actually confirmed to be
  voice/phone (not assumed from a passing mention of "conversation" or
  "call"), consent for AI involvement is defined, and there's an
  always-available, low-friction escalation to a human.

If either condition isn't met, the deterministic scorer will cap the
pattern at "weak" no matter what else looks promising - and the fast-loop
prompt (Sprint 26 Part F) is instructed never to suggest either pattern
as a direction unless the transcript has already made that evidence
explicit.

## 8. When non-AI process fixes are better

`reporting_visibility_layer` and `no_build_process_fix` are first-class
patterns, not consolation prizes. Favor them when the evidence points to:

- Nobody has visibility into status, volume, or ownership (the data may
  already exist - the gap is surfacing it, not new AI reasoning).
- The root cause is unclear ownership, an undocumented process, or
  inconsistent intake fields - a form/SOP/checklist change might resolve
  most of the actual pain.

A pattern-fit result that ranks `no_build_process_fix` above every AI
pattern is a success for this tool, not a failure to find an AI use case.

## 9. Safer first-version patterns

Every pattern's `goodFirstVersion` names the smallest, safest version to
try - the pattern-fit result surfaces the first entry as
`saferFirstVersion`. Common shapes, roughly ordered from lowest to
highest commitment: a manual dry run, a completeness/checklist flag, a
draft-and-review step, a shadow-mode comparison, or a narrow-scope pilot
on the least risky slice of cases. See the [playbook](applied-ai-discovery-playbook.md)'s
"Smallest useful experiment patterns" section for the fuller list.

## 10. Example: intake triage

The **Applied AI Intake Triage Demo** scenario
(`lib/scenarios/appliedAiIntakeTriage.ts`) is built so that
`intake_triage_assistant`, `completeness_checker`, and
`human_in_the_loop_review_queue` all reach at least "possible" fit -
requests arrive inconsistently across channels, a coordinator manually
determines category/owner/priority, and the coordinator explicitly wants
to keep signing off before anything routes. `tool_using_agent` and
`voice_conversation_agent` stay capped well below "possible" - no tool
permissions or voice channel were ever confirmed.

Sprint 27's **SMB Lead Intake Triage Demo** (`lib/scenarios/
smbLeadIntakeTriage.ts`) is the freelance/client-style counterpart to the
same pattern: a small service-business owner with no CRM at all, where
`completeness_checker` and `intake_triage_assistant` both reach
"possible" from missing-phone/service-area/urgency language, while the
owner's explicit "I would not want something auto-booking" keeps
`tool_using_agent` well capped.

## 11. Example: no-build / process fix

A meeting whose evidence is mostly "nobody agreed on who owns this step"
or "the intake form itself is inconsistent" should rank
`no_build_process_fix` and/or `reporting_visibility_layer` at "possible"
or "strong" - and it's entirely correct for every AI-shaped pattern to
stay "weak" in that same meeting. The pattern-fit lens is working
correctly when it recommends nothing to build.

Sprint 27's **Internal Reporting Visibility Demo** (`lib/scenarios/
internalReportingVisibility.ts`) is the library's most deliberate test of
this: the tentative build direction is an AI-generated summary, but the
transcript explicitly says "an AI writing the summary doesn't fix the
part that's actually broken" - the review's build-direction assessment
should come back `needs_reframing`, and `reporting_visibility_layer`/
`no_build_process_fix` should outrank every AI pattern, including
`summarization_assistant`.

## 12. Example: rules automation with required human approval

Sprint 27's **Invoice Exception Handling Demo** (`lib/scenarios/
invoiceExceptionHandling.ts`) shows why `rules_automation` and
`human_in_the_loop_review_queue` are separate patterns, not competitors:
a documented dollar-amount threshold genuinely supports rules automation
for the clean cases, but vendor-name judgment calls and a required
manager sign-off for large mismatches mean `human_in_the_loop_review_queue`
is the more reliably evidenced pattern overall - and the tentative
"automated exception triage" build direction should get flagged as a
`build_assumption_conflict` against the transcript's own explicit
"I would not want anything actually issuing a payment on its own."

## 13. Example: RAG gated on data readiness

Sprint 27's **Knowledge Base Support Assistant Demo** (`lib/scenarios/
knowledgeBaseSupportAssistant.ts`) tests that naming a real knowledge
source (Confluence, Slack) isn't enough on its own - `rag_knowledge_assistant`
reaches "possible," but the scenario's explicit "some of that Confluence
stuff hasn't been touched in over a year" and "nobody really owns" the
documentation should surface as missing information, and the overall
recommendation should land on `not_ready` rather than an unconditional
endorsement.

## 14. Known limitations

- Pattern-fit scoring is plain keyword/token-overlap matching (same
  convention as `lib/live/meaningfulSegments.ts` and
  `lib/evidence/evidenceQuality.ts`), not semantic understanding - a
  workflow described in unusually indirect language may score lower than
  its real substance deserves. Thresholds were tuned against the QA1
  synthetic assertions and the Applied AI Intake Triage Demo scenario's
  real transcript language; a very differently-phrased meeting could
  still under- or over-match.
- Fit scoring only ever runs as part of generating (or regenerating) the
  Applied AI opportunity assessment - there's no standalone "just score
  patterns" action, and no fit history beyond "latest assessment wins,"
  matching the assessment's own persistence model (`ai_run_logs`, no
  dedicated table).
- The regression check for pattern fit (`lib/services/regressionRunner.ts`)
  only runs for scenarios that declare `expectedPatternFits`, and warns
  (never fails) if no assessment has been generated yet for that replay -
  it cannot catch a pattern-fit regression on a scenario that never
  generates the assessment step.
- Sprint 27's scenario expansion surfaced (and fixed) a real calibration
  gap: signal-phrase matching could false-positive on generic words
  shared across almost any business-process description ("documents",
  "intake", "text"), and `humanApprovalRequired`'s keyword list missed
  common phrasings like "signs off" (vs. "sign off") or "I still make
  every call myself." `patternFit.ts` now excludes a generic-word
  stoplist from signal/required-evidence matching and recognizes a wider
  set of human-approval phrasings - but this remains keyword-based, so a
  meeting phrased very differently from anything seen so far could still
  under- or over-match. Several Sprint 27 scenarios' strict
  `expectedPossibleOrStrongPatternIds` were deliberately narrowed to just
  the pattern(s) that reliably reach "possible" against real transcript
  text, with the rest documented as `expectedSupportingPatternIds`
  (aspirational, not strictly checked) rather than over-tuning the
  scorer to force every originally-hoped-for pattern to pass.

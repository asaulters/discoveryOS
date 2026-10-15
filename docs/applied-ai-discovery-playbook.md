# Applied AI Discovery Playbook

Sprint 25 added an **Applied AI Discovery** meeting mode to DiscoveryOS -
a way to run discovery specifically aimed at answering one question: *is
this workflow or process a good candidate for AI assist, rules automation,
workflow redesign, reporting/visibility, human process change, not-ready,
or no-build?*

This playbook is the practical guide for running that kind of meeting. It
is not internal-only - the same playbook works for an internal AI Labs
review, a freelance discovery call, an applied AI consulting engagement,
or a general process-improvement interview.

Sprint 26 added the **Applied AI Pattern Library and Use Case Fit Lens** -
a deterministic way to map a discovered workflow onto specific applied-AI
implementation patterns (intake triage, completeness checking, RAG,
tool-using agents, and more), each with explicit fit and not-fit
conditions. See [docs/applied-ai-pattern-library.md](applied-ai-pattern-library.md)
for the full pattern list, fit levels, and guidance on agentic/voice
patterns; sections 14-15 below cover how it shows up in this playbook's
own flow.

## 1. Purpose

Most "should we use AI for this?" conversations start from the answer
("yes, AI") and work backwards to justify it. Applied AI Discovery mode
exists to slow that down: it structures the conversation around the
workflow's actual pain, data, rules, risk, and review needs first, and
lets the recommendation type fall out of the evidence - which might be AI,
but might just as easily be a rule, a report, a process change, or nothing
at all.

**Core principle: DiscoveryOS never forces AI as the answer.** Every part
of this mode - the pre-meeting brief, the live suggested directions, and
the post-meeting opportunity assessment - is built to surface evidence for
all seven recommendation types, not to build a case for AI.

## 2. When to use Applied AI Discovery

Use this mode when the actual goal of the conversation is to figure out
**whether and how** to apply AI/automation to a specific workflow -
regardless of who's asking:

- An internal AI Labs / platform team scoping a new opportunity.
- A freelance discovery call with a prospective client.
- An applied AI consulting engagement's early discovery phase.
- A general process-improvement interview where AI is one candidate fix
  among several.

## 3. When not to use it

- If the build direction is already fully decided and funded, and you're
  just gathering implementation requirements - use **Requirements
  gathering** instead.
- If the question is purely "can this be built at all" (a technical
  spike) rather than "should we build this" - **Technical feasibility**
  fits better.
- If you're building a funding/prioritization case rather than assessing
  workflow fit - **Business case**.
- If nothing about AI/automation is in scope at all - plain **Automation
  discovery** or **Product discovery** may be a better fit.

## 4. Pre-meeting setup checklist

Before the call:

- [ ] Write a one-sentence goal: what decision does this meeting need to
      move forward?
- [ ] Write down current understanding of the workflow, even if partial.
- [ ] Name a tentative build direction *if you have one* - and go in
      willing to have it weakened or replaced.
- [ ] List known risks/unknowns and starting assumptions.
- [ ] Generate the pre-meeting brief (Setup Analyst) - for
      `applied_ai_discovery` meetings this includes suspected workflow
      pain, likely task/intervention type, data-readiness questions,
      risk/constraint questions, human-review questions,
      implementation-readiness questions, a smallest-useful-experiment
      hypothesis, an explicit no-build/not-ready risk statement, and
      (Sprint 26) a short "Patterns to validate" list drawn from the
      pattern library - see section 14. Treat all of it as a hypothesis
      to test in the room, not a conclusion.

## 5. Discovery question bank

A grab-bag of concrete, askable questions, organized by the lens
dimension they belong to - see section 6 for the full lens. Pull from
here rather than starting from scratch:

- "Where does this process actually slow down or stall?"
- "What's the most repetitive or tedious part of this for the people
  doing it?"
- "Is this fundamentally a routing/coordination problem, or a
  judgment/decision problem?"
- "What actually kicks this process off, and who touches it after that?"
- "What data would this need, and where does it live today?"
- "Is this decision governed by a documented rule, or is it really a
  judgment call?"
- "What part of this would you never be comfortable letting run without a
  human checking it?"
- "What would make this unsafe to automate?"
- "Could a first version just be a checklist, a report, or a prompt
  someone runs manually?"
- "How would you actually know if this got better?"
- "What's the smallest version of this you could try without committing
  to a full build?"

## 6. Applied AI opportunity lens

Defined once, in code, as the shared source of truth for the Setup
Analyst brief, live suggested directions, and the post-meeting
assessment: [`lib/lenses/appliedAiOpportunityLens.ts`](../lib/lenses/appliedAiOpportunityLens.ts).

| Dimension | What it establishes |
| --- | --- |
| Workflow pain | What's slow, repetitive, delayed, error-prone, expensive, frustrating, or inconsistent. |
| Task / intervention type | Classification, summarization, routing, extraction, validation, generation, research, prediction, coordination, monitoring, or decision support. |
| Current process shape | Trigger, who touches it, systems involved, handoffs/approvals/delays/exceptions. |
| Data readiness | What data exists, where it lives, structured/unstructured/mixed, reliability, sensitivity, historical volume. |
| Rule clarity | Rule-based vs. judgment-heavy vs. exception-heavy vs. subjective vs. policy-constrained. |
| Human review need | What must stay human-approved, unacceptable errors, where confidence is required, suggest vs. decide. |
| Risk and constraints | Privacy, security, compliance, legal, customer/financial/operational/brand risk, stakeholder trust. |
| Integration and implementation surface | Systems to read/write, whether v1 can be manual-assist (checklist/prompt/report/triage helper/review assistant). |
| Success metric | Time saved, cycle time, error rate, rework, completeness, visibility, consistency, experience. |
| Smallest useful experiment | The safest small test; what can be validated before a full build. |
| Recommendation type | Which of the seven interventions the evidence actually supports. |

## 7. Data readiness questions

- What data would this actually need, and where does it live today?
- Is it structured (a database/spreadsheet field) or unstructured (free
  text, PDFs, conversations)?
- How reliable or clean is it today?
- Does it include anything sensitive - customer, financial, health, or
  otherwise regulated information?
- Is there enough historical data to validate an approach before
  building it?

## 8. Risk / compliance / security / privacy questions

- What would make this unsafe to automate or hand to AI?
- Are there privacy, security, legal, or compliance rules that apply?
- What's the worst case if this went wrong for a customer, employee, or
  partner?
- Is there a financial, operational, or brand/reputation risk tied to
  getting this wrong?

## 9. Human-in-the-loop questions

- What part of this would never be comfortable running without a human
  checking it?
- What kind of mistake here would actually be costly or damaging?
- Where would it be enough for AI to suggest something, versus actually
  decide it?

## 10. Success metric questions

- How would you actually know if this got better - what would you
  measure?
- Is the goal mainly speed, accuracy, consistency, visibility, or
  experience?
- What's the current baseline for that metric today, even roughly?

Note: DiscoveryOS never invents a number, percentage, or dollar figure for
any of this. The Applied AI opportunity assessment names *candidate*
metrics to track - it does not project results.

## 11. Smallest useful experiment patterns

Common shapes for a safe first test, roughly ordered from lowest to
highest commitment:

1. **Manual dry run** - a human runs the proposed approach by hand on a
   small sample and compares it to what actually happened.
2. **Checklist / completeness check** - a static or lightly-assisted
   checklist that flags missing information, without deciding anything.
3. **Draft-and-review** - AI drafts a recommendation (category, routing,
   summary, etc.) and a human reviews/approves every instance before it
   takes effect.
4. **Shadow mode** - the system runs alongside the existing process and
   its output is compared, but never acts.
5. **Narrow-scope pilot** - full assist/automation, but only for the
   least risky slice of cases (e.g. no compliance exceptions).

## 12. Recommendation types

| Type | Meaning |
| --- | --- |
| AI assist | AI drafts, suggests, classifies, extracts, or summarizes; a human reviews or approves - never autonomous action. |
| Rules automation | The decision logic is explicit and stable enough to encode as deterministic rules - no model judgment required. |
| Workflow redesign | The real problem is process structure (ordering, handoffs, ownership, approvals), not a task to assist or automate as-is. |
| Reporting / visibility | Nobody can see what's happening - better reporting/a dashboard resolves most of the pain without touching the process. |
| Human process change | The fix is policy, staffing, training, or expectation-setting - not a system change at all. |
| Not ready | A plausible opportunity exists, but a specific named gap has to close first. |
| No-build | The evidence doesn't support building anything - already working, too small to matter, or too risky/ambiguous. |

## 13. Example internal/client-friendly summary

The Review page's Applied AI opportunity assessment includes a **Copy
summary** button that builds a block like this from the generated
assessment (never auto-included in Share/export):

```
Applied AI opportunity summary

1. Workflow/problem observed
Requests arrive through email and a web form; a coordinator manually
determines category, owner, and priority, and follows up for missing
information.

2. Opportunity type
AI assist

3. Recommended approach
AI drafts, suggests, classifies, extracts, or summarizes, with a human
reviewing or approving the output - not autonomous action.
- The coordinator already described exactly this shape: a draft
  recommendation plus a missing-info flag, with sign-off before anything
  moves.

4. Why not full automation yet
- Compliance-escalation criteria are described only informally ("a data
  request or a legal complaint").
- Sensitive data sometimes appears in free-text request bodies.

5. Risks and guardrails
- Sensitive or regulated information may appear in unstructured request
  text.
- Compliance-relevant requests could be missed if exception criteria
  aren't well understood.

6. Missing information
- Exact criteria for what counts as a compliance issue.
- Definition of a "big account" exception.

7. Smallest useful experiment
Draft-and-review: AI proposes category/owner/priority and flags missing
fields; the coordinator still approves every case before routing.

8. Success metrics to validate
- Reduced back-and-forth for missing information.
- Faster time-to-correct-routing.
- Fewer misrouted requests.

9. Suggested next step
Confirm the compliance-escalation criteria and the "big account"
definition with the team that owns those exceptions.
```

See the **Applied AI Intake Triage Demo** scenario
(`lib/scenarios/appliedAiIntakeTriage.ts`) for the full fixture this
example is drawn from.

## 14. Patterns to validate

The pre-meeting brief's "Patterns to validate" section (Setup Analyst,
Sprint 26 Part E) names 2-6 patterns from the
[Applied AI Pattern Library](applied-ai-pattern-library.md) worth going
to test in the meeting - always framed as hypotheses, never
recommendations, and always including at least one non-AI/no-build
option alongside any AI patterns. If the setup context is thin, expect
this list to stay generic - something like:

- Intake triage assistant
- Completeness checker
- Human-in-the-loop review queue
- Reporting/visibility layer
- No-build process fix

Once real transcript evidence exists, the post-meeting Applied AI
opportunity assessment's "Applied AI pattern fit" section (Sprint 26
Part D) replaces this hypothesis list with actual, deterministically
scored fit levels - see the pattern library doc's "Fit levels" section
for what each one means.

## 15. Asking pattern-fit questions

Once a pattern looks like a plausible fit (or the brief names it as one
to validate), pull directly from that pattern's own `exampleQuestions` in
[`lib/patterns/appliedAiPatterns.ts`](../lib/patterns/appliedAiPatterns.ts)
rather than inventing new ones - they're written to be concrete and
immediately askable. A few cross-cutting habits that apply regardless of
which pattern you're testing:

- Ask what would make a pattern *unsafe*, not just what would make it
  work - "what would make this unsafe to hand off?" surfaces the risks
  and human-review boundaries that decide fit as much as the happy path
  does.
- Never lead with "should we use an agent for this?" - lead with the
  underlying question (is this rule-based or judgment-based? does a
  trusted knowledge source already exist? what data would this touch?)
  and let the pattern name follow from the answer, not the other way
  around.
- For tool-using agents or voice/conversation agents specifically, ask
  the fit-gating questions directly: "exactly which systems would this
  need to act on?", "what's reversible here, and what isn't?", "is this
  actually a voice/phone interaction, or is that being assumed?" - these
  patterns should never advance past "weak" fit without concrete answers
  to these.
- If a pattern comes back "not enough info," treat that as a to-do for
  the next conversation (its own `missingEvidence`/`whyNotYet` fields say
  exactly what's missing) rather than a reason to guess.

## 16. Scenario library for practice and QA

Sprint 27 expanded the scenario library specifically for Applied AI
Discovery practice, covering both **internal ops** and **freelance/
client-style** conversations:

| Scenario | Type | Primary recommendation | Notable pattern |
| --- | --- | --- | --- |
| Applied AI Intake Triage Demo | Internal-flavored | `ai_assist` | Human-in-the-loop triage |
| SMB Lead Intake Triage Demo | Freelance/client | `ai_assist` | No CRM/SOP exists yet - completeness/triage over automation |
| Compliance Document Review Demo | Internal ops | `ai_assist` | Checklist vs. policy-judgment split |
| Knowledge Base Support Assistant Demo | Internal ops | `not_ready` | RAG fit gated on content freshness/ownership |
| Invoice Exception Handling Demo | Internal ops | `rules_automation` | Rules automation vs. required human approval |
| Client Project Intake Discovery Demo | Freelance/client | `ai_assist` | Voice channel mentioned but not agent-relevant |
| Internal Reporting Visibility Demo | Internal ops | `reporting_visibility` | Deliberate "AI is not the answer" trap scenario |

Each scenario fixture (`lib/scenarios/*.ts`) carries Sprint 27 metadata -
`scenarioType`, `primaryDiscoveryMode`, `expectedPrimaryRecommendation`,
`expectedTopPatterns`/`expectedWeakOrUnsafePatterns`, `difficulty`, and
`fieldTestRelevance` - plus a `fieldTestUse` block (what real meeting it
approximates, what facilitator skill it tests, what DiscoveryOS behavior
it stresses, what a successful real meeting would validate). Use these
for facilitator practice ahead of a real Applied AI Discovery meeting,
not just for regression: load one via `/meetings/new`'s scenario
dropdown (Applied AI scenarios are prefixed `[Applied AI]`), replay its
transcript chunks, and see whether the brief, suggested directions,
review, and pattern fit all land where the fixture predicts they should.

The library deliberately includes scenarios where AI is *not* the right
answer (Internal Reporting Visibility Demo), where rules automation beats
a generative pattern (Invoice Exception Handling Demo), and where human-
in-the-loop review is non-negotiable (most of the internal-ops set) - see
`docs/progress.md`'s Sprint 27 section for the full QA notes on how each
one actually performed.

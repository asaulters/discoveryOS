# Real Applied AI Field Test Guide

Sprint 28 added a **Real Applied AI Field Test Package** - the process,
in-app debrief, and scoring rubric for running DiscoveryOS in a real
controlled applied-AI discovery conversation and honestly evaluating
whether it helped.

This is a controlled-real-use readiness package, not a new AI feature. It
does not change how the Setup Analyst, fast-loop directions, workflow
extraction, Applied AI opportunity assessment, or pattern fit behave -
see [docs/applied-ai-discovery-playbook.md](applied-ai-discovery-playbook.md)
and [docs/applied-ai-pattern-library.md](applied-ai-pattern-library.md)
for those. This guide is about the meeting around the product.

**Running this as a remote call?** See
[docs/remote-conversation-capture-guide.md](remote-conversation-capture-guide.md)
(Sprint 32) for capture setup options - browser mic alone often can't
reliably hear a remote participant - plus a pre-call audio test and
post-call capture-quality scoring.

## 1. Purpose

A field test evaluates one question: *did DiscoveryOS actually help in a
real applied-AI discovery conversation* - not a scenario replay, not a
demo, a real meeting with a real stakeholder. Scenario fixtures (Sprints
10, 25-27) prove the pipeline runs correctly; a field test proves it's
actually useful in the room.

## 2. What this test should prove

- Did DiscoveryOS help the facilitator ask better questions?
- Did it surface follow-ups the facilitator might have missed?
- Did it improve the facilitator's understanding of the actual workflow?
- Did it help distinguish AI assist vs. automation vs. workflow redesign
  vs. no-build - rather than assuming AI was the answer?
- Did it stay non-distracting during a real conversation?
- Were the evidence and summaries trustworthy enough to actually review
  and rely on afterward?

## 3. When to run a field test

- An internal AI/process-improvement conversation with a real
  stakeholder.
- A freelance/client discovery call.
- A mock client interview with a realistic stakeholder (a colleague
  playing the role, briefed to answer like a real client would).
- A process-discovery meeting where you have permission to use it.

## 4. When not to run a field test

- A high-confidentiality meeting without explicit approval to use an
  AI-assisted tool.
- Any meeting without consent/disclosure to participants.
- A high-stakes legal, medical, or financial decisioning conversation.
- A meeting where live capture (transcript or microphone) would be
  inappropriate for the setting.
- A meeting where the stakeholder would likely be distracted or made
  uncomfortable by visible note-taking/AI tooling.

## 5. Participant disclosure language

Plain-language wording to say or share before starting:

> "I'm using a discovery assistant to help me track open questions and
> summarize the workflow. It may capture transcript text or microphone
> audio depending on the setup. The AI outputs are working notes that I
> will review before sharing or acting on."

Browser-microphone limitation, worth saying explicitly if capturing audio
in a remote/hybrid setting:

> "Browser microphone capture may not reliably capture remote
> participants unless audio routing is configured. I may use manual notes
> instead."

**This wording is not a legal compliance statement.** It does not
constitute legal advice, and using it does not by itself satisfy
consent, recording, or data-protection requirements that may apply in
your jurisdiction or organization. Confirm your own disclosure/consent
obligations separately before relying on this language.

## 6. Pre-meeting setup checklist

- [ ] Select **Applied AI Discovery** as the meeting type.
- [ ] Add a concrete meeting goal.
- [ ] Add current understanding of the workflow, even if partial.
- [ ] Add a tentative build direction, framed explicitly as a hypothesis
      to test, not a decision.
- [ ] Add starting assumptions and risks.
- [ ] Generate the pre-meeting brief.
- [ ] Review the brief's "Patterns to validate" section (Sprint 26 Part
      E) - these are hypotheses to go test, not recommendations.
- [ ] Confirm your consent/disclosure plan (section 5).
- [ ] Choose live capture, manual transcript, or mixed - and prepare a
      manual-notes fallback either way (see the browser-mic limitation
      above).
- [ ] **Remote call:** run the pre-call audio test and pick a capture
      setup in [docs/remote-conversation-capture-guide.md](remote-conversation-capture-guide.md)
      (BlackHole, external-mic fallback, etc.) - browser mic alone often
      won't hear a remote participant.

## 7. Suggested field-test meeting types

Use the Sprint 27 scenario fixtures as realistic templates for what a
first field test could look like - not to replay them, but to recognize
the shape of a good candidate real meeting:

- SMB lead intake (a small business's lead follow-up process)
- Compliance document review (a checklist-vs-judgment review process)
- Knowledge base support assistant (a support team's answer-finding
  process)
- Invoice exception handling (a finance/AP exception process)
- Client project intake (a consultant's own intake process)
- Internal reporting visibility (a status-reporting process)

### Choosing a first field test

Choose a first field test that is:

- low-risk
- permissioned (you actually have permission to use DiscoveryOS in it)
- representative of the kind of applied-AI discovery work you actually do
- not too confidential
- built around a real workflow, not a hypothetical one
- has at least one plausible AI/automation/process-improvement question
  worth exploring
- has a stakeholder who can actually explain exceptions and pain points,
  not just the happy path

Recommended first tests, roughly ordered from safest to run:

1. Internal reporting visibility - low-stakes, internal, and a good test
   of whether DiscoveryOS avoids recommending AI when it shouldn't.
2. Client project intake discovery - your own intake process, so
   confidentiality risk is minimal.
3. SMB lead intake - real if you or a contact runs a small service
   business; otherwise a well-briefed mock works too.
4. Knowledge base support assistant (mock) - a colleague playing a
   support rep, briefed on a real (or realistic) internal knowledge base.
5. Invoice exception handling (mock) - a colleague from finance/ops
   playing the role, using real (but low-stakes) exception examples.

Avoid a first field test that's simultaneously high-confidentiality,
high-stakes, and your first time operating the live HUD - stack the
easier conditions on your first attempt, and save the harder ones for
once you trust the rhythm in section 8.

## 8. Live operating rhythm

- Stakeholder relationship comes first - the tool is there to help you,
  not to run the conversation.
- Use suggested directions during natural pauses, not mid-sentence.
- Do not read every suggestion aloud - pick the one or two that actually
  fit where the conversation already is.
- Focus one discovery thread at a time rather than chasing every open
  item at once.
- Mark threads covered/deferred instead of trying to force every topic
  into this one meeting.
- Treat AI suggestions as prompts to consider, never as instructions to
  follow verbatim.
- Pause capture if the conversation turns sensitive or off-topic.
- Fall back to manual transcript entry if live capture is unreliable -
  never let a technical hiccup derail the conversation itself.

## 9. Applied AI judgment checklist

During or immediately after the meeting, check whether you actually
learned enough about each applied AI opportunity lens dimension (see the
[playbook](applied-ai-discovery-playbook.md) section 6 for the full
lens):

- Workflow pain
- Decision/task type
- Data readiness
- Rule clarity
- Human review needs
- Risk/compliance constraints
- Integration surface
- Success metric
- Smallest useful experiment
- Recommendation type
- Pattern fit / not-fit (which patterns look promising, which are
  explicitly not a fit yet)

## 10. Post-meeting review checklist

- [ ] Generate the post-meeting review.
- [ ] Generate the Applied AI opportunity assessment.
- [ ] Check pattern fit - top fits, missing evidence, and which
      high-autonomy patterns correctly stayed capped.
- [ ] Spot-check a few pieces of evidence against the real transcript.
- [ ] Review "still unclear" items.
- [ ] Review "possible mismatches."
- [ ] Decide deliberately what (if anything) to export/share - field-test
      notes and pilot notes never go into Share/export by default.
- [ ] Log raw pilot notes (Sprint 18-19) if useful.
- [ ] Create tracked pilot issues (Sprint 20) for anything concrete that
      should get fixed.
- [ ] Complete the field-test debrief and scoring rubric on the Review
      page (section 11 below).

## 11. Field-test scoring rubric

Score each on a 1-5 scale, on the meeting's Review page:

- Helped ask better questions
- Reduced missed follow-ups
- Improved workflow understanding
- Stayed non-distracting
- Evidence felt trustworthy
- Applied AI judgment was useful
- Overall usefulness

| Score | Meaning |
| --- | --- |
| 1 | Harmful/confusing |
| 2 | Mostly not useful |
| 3 | Mixed but promising |
| 4 | Useful with minor issues |
| 5 | Clearly useful |

## 12. Success decision

- **strong_signal** - the product clearly helped and should be used
  again.
- **mixed_signal** - useful moments, but clear issues to fix first.
- **weak_signal** - not enough value yet.
- **not_enough_data** - the meeting/test wasn't representative enough to
  judge (too short, too atypical, technical issues dominated).

## 13. What to capture as evidence

- Screenshots of the brief, live HUD, review, pattern fit section, and
  pilot dashboard.
- Exported Markdown, if appropriate for the context.
- The field-test score (section 11).
- Any pilot issues logged (Sprint 20).
- A written note on what the facilitator would have missed *without*
  DiscoveryOS - this is often the most convincing evidence either way.

## 14. Debrief questions

- What did DiscoveryOS catch that you may have missed?
- Which suggested directions were actually useful?
- Which were distracting, generic, or simply wrong?
- Did pattern fit help you avoid a bad solution assumption (e.g. jumping
  to an agent or automation when the evidence didn't support it)?
- Was the Applied AI assessment too cautious, too aggressive, or about
  right?
- What should change before the next field test?

## 15. Known limitations

- Browser microphone capture may not reliably capture remote
  participants without audio routing configured (Sprint 11/13) - plan a
  manual-notes fallback.
- AI calls have no configured timeout/retry, so a call can occasionally
  hang rather than fail fast (documented since Sprint 25/26's QA
  notes) - if something seems stuck, it may just need a retry.
- Every AI output (brief, directions, review, assessment, pattern fit)
  requires facilitator review before being treated as fact - this is a
  working-notes tool, not an autonomous decision-maker.
- Pattern fit is discovery guidance, not a final architecture or
  implementation plan.
- Share/export deliberately exclude internal pilot notes and field-test
  debrief data - see Part D below and `docs/progress.md`'s Sprint 28 QA
  notes for the isolation check.

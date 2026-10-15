# Real Meeting Pilot Guide

Practical guidance for running DiscoveryOS in a real discovery meeting,
rather than a scenario/demo. This is usage guidance, not a legal or
compliance document — see "Consent/disclosure guidance" below.

Sprint 18 added a lightweight **Pilot readiness** panel (Brief page),
a compact pilot status strip (Live HUD), and a post-meeting pilot
checklist + issue log (Review page) that this guide walks through. None
of it is required to use DiscoveryOS — it exists to make real-meeting use
safer and more deliberate.

## 1. When to use DiscoveryOS

- A live or recently-completed discovery/requirements conversation where
  you want AI-assisted note-taking, a working process model, and
  suggested follow-up questions.
- Meetings where you (the facilitator) are present and can keep control
  of the conversation — DiscoveryOS suggests directions, it doesn't run
  the meeting.
- Meetings where a manual-transcript fallback (typing/pasting text) is
  acceptable if live capture isn't reliable enough.

## 2. When *not* to use it

- Meetings requiring guaranteed, verbatim, legally-admissible recording —
  DiscoveryOS is a working-notes tool, not a compliance recording system.
- Calls where the only audio source is a remote/dial-in participant on
  Zoom/Teams/phone and no one in the room can speak near a browser
  microphone — see the browser-mic limitation below.
- Highly sensitive conversations (legal, HR, security incidents) unless
  your organization has explicitly cleared AI note-taking tools for that
  context.
- As a substitute for a facilitator's own judgment — every AI output here
  is a working interpretation that needs human review (see Known
  limitations).

## 3. Pre-meeting checklist

Available on the **Brief page**, under "Pilot readiness" (toggle "Pilot
mode" on to see it):

- Participants know live capture/manual transcript may be used
- Goal and discovery strategy reviewed
- Scenario/demo mode off if real meeting
- Manual transcript fallback ready
- Recording mode selected
- Consent confirmed
- Known limitations acknowledged

Marking these doesn't change what DiscoveryOS does — it's a memory aid,
and the state persists per meeting so you (or a co-facilitator) can check
it later.

## 4. Consent/disclosure guidance

Before using live capture (or telling participants you're using manual
transcript capture), share something like:

> DiscoveryOS can capture microphone audio or manual transcript text to
> help summarize the process and suggest follow-up questions. Please
> confirm participants are aware and have agreed before using live
> capture. Browser microphone capture may not capture remote meeting
> participants reliably.

Also worth stating plainly:

- Live capture is **browser-microphone only** — it does not connect to
  Zoom, Teams, or any other call system.
- Remote/dial-in participant audio is **not reliably captured** by a
  browser microphone.
- The transcript (manual or captured) is the source of truth, not any AI
  summary.
- AI outputs are working interpretations, not verified facts.
- Human review is required before using any output externally.

**This is not legal advice and does not guarantee compliance** with
recording/consent laws in your jurisdiction — check your own
organization's policy and local law before recording anyone.

## 5. Recommended setup

- Create the meeting, fill in goal/current understanding/build direction
  as usual, then generate the pre-meeting brief.
- On the Brief page, turn on **Pilot mode**, pick a recording mode
  (`manual_transcript`, `browser_mic`, `mixed`, or `none`), confirm
  consent, and acknowledge known limitations.
- Decide your fallback in advance: if live capture underperforms
  mid-meeting, you can always switch to typing/pasting into the manual
  transcript box without losing anything already captured.
- Have the Live HUD open and ready before the meeting starts, not during
  the opening minutes.

## 6. Live meeting operating rhythm

- Keep one eye on **Active focus** (top of the HUD) — it's DiscoveryOS's
  best guess at what to ask about next, not an instruction to follow
  blindly.
- Use **Suggested directions** as prompts, not a script. Rephrase in your
  own voice.
- Periodically glance at the **compact pilot status strip** at the top of
  the HUD (consent/limitations/recording mode) — it's there so you don't
  have to leave the HUD to check readiness state mid-meeting.
- Let the underlying process model (Known/Unknown, workflow steps) build
  up in the background rather than narrating it to participants live.

## 7. How to use "Still to explore" and Focus

- **Still to explore** (the queue in the sidebar) holds discovery threads
  DiscoveryOS thinks are worth covering but hasn't focused yet.
- Click a queued thread to **focus** it — this locks it as the active
  thread until you release it or mark it covered, so DiscoveryOS won't
  silently swap focus out from under you mid-conversation.
- **Mark covered** once a thread is genuinely done — it's the signal that
  keeps the queue from growing indefinitely and getting noisy.
- If the queue gets long, it's a sign to consolidate: DiscoveryOS doesn't
  prioritize for you beyond a rough priority label — use your own
  judgment about what's actually load-bearing for this meeting.

## 8. How to use Live Capture safely

- Live Capture is browser-microphone only, and it explicitly requires
  consent confirmation in its own start dialog before it will run — that
  in-product prompt is separate from (and in addition to) the Pilot
  readiness consent checkbox on the Brief page.
- It does not reliably capture remote/dial-in participants — if most of
  your conversation is happening over a call rather than in the room with
  your microphone, prefer manual transcript entry, or plan to paste in
  a transcript from your call tool afterward.
- It buffers speech and only analyzes it once it looks "meaningful"
  (enough content, or a detected process statement) — a short pause in
  the HUD after you speak is expected, not a sign it's broken.
- Manual transcript entry always works as a fallback, even mid-meeting,
  even if you've also started live capture.

## 9. When to pause analysis

Pause (stop live capture, or simply stop pasting transcript) when:

- The conversation moves to something off-topic or sensitive that
  shouldn't be summarized or stored (e.g., a tangent about an unrelated
  personnel matter).
- You want to think out loud with a co-facilitator without it being
  treated as meeting content.
- Live capture is clearly mis-transcribing badly enough that continuing
  would pollute the process model faster than you can correct it — pause,
  switch to manual entry for a stretch, resume live capture later if it
  recovers.

There's no "pause" toggle for the AI pipeline itself — pausing means not
feeding it new transcript text, either by stopping live capture or simply
not typing/pasting for that stretch of conversation.

## 10. How to review evidence after the meeting

- Every workflow step/component/gap carries a confidence level and, where
  available, a source quote pointing back to the transcript — use the
  evidence drawer on the Workflow view to check the quote actually
  supports the claim.
- Items a human has verified or locked are marked as such — prioritize
  spot-checking anything still AI-only (not yet human-verified) before
  treating it as settled.
- On the Review page, the post-meeting pilot checklist has explicit items
  for "Process so far checked," "Evidence spot-checked," and "Human
  corrections added where needed" — use them as your minimum bar before
  calling a meeting reviewed.

## 11. How to export/share output

- The Review page's **Export/Copy** panel builds Markdown from the
  current process model, evidence, and the latest post-meeting review
  (if generated). Resolved/dismissed items are never included as open.
- The **Share** page (`/meetings/[id]/share`) is a clean, print-friendly
  view meant for people outside the facilitator seat.
- **Pilot notes (consent state, checklists, issues observed, follow-up
  actions) are never included in export or share output** — they're
  internal-only, visible on the Review page under "Pilot readiness
  (internal)." If you want any of that content shared externally, copy it
  manually.

## 12. Known limitations

- Live capture only hears what your browser microphone hears — remote
  participants on a call are not reliably captured.
- AI-generated workflow steps, components, and gaps are working
  interpretations from an LLM (`gpt-4o-mini` by default) — under-
  generation and occasional misses are expected, not a bug report on
  their own.
- Suggested directions can be generic, especially early in a meeting
  before much context has accumulated.
- No Zoom/Teams/system-audio capture, no third-party integrations, no
  authentication/access control, no public sharing beyond the print/share
  page link itself, no PDF export.
- This pilot readiness feature is a checklist and note-taking aid — it
  does not verify consent was actually obtained, does not enforce
  anything, and does not claim legal compliance.

## 13. Pilot feedback checklist

After a real pilot meeting, before treating it as "reviewed":

- [ ] Post-meeting review generated
- [ ] Process so far checked against your own memory of the meeting
- [ ] Evidence spot-checked (source quotes actually support the claims)
- [ ] Human corrections added where the AI got something wrong
- [ ] Open follow-ups captured somewhere durable
- [ ] Export/share output reviewed before sending anywhere
- [ ] Issues observed written down in the Review page's pilot checklist
      (even small ones — they're what future sprints get prioritized from)
- [ ] Meeting judged safe to use for notes/follow-up, or flagged if not

See the Review page's "Pilot readiness (internal)" section for the
same checklist wired up to persist per meeting, plus "Issues observed"
and "Follow-up actions" text fields.

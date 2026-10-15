# Live audio readiness

Originally a Sprint 10 planning document written before any live audio
code existed. **Sprint 11 implemented a narrow prototype slice of this
plan** — browser-microphone capture only, feeding the exact same
manual-transcript pipeline. Everything below that isn't covered by the
"Sprint 11 prototype status" section is still just a plan for later
sprints, not implemented.

## Sprint 11 prototype status

### What works

- **Browser microphone capture**: the Live HUD's Live Audio panel
  (`LiveAudioPanel.tsx` + `LiveAudioRecorder.tsx`) uses
  `getUserMedia`/`MediaRecorder` to record the facilitator's own
  microphone, in 15-second chunks, after an explicit consent
  confirmation. This is the "in-person/browser mic" approach from the
  plan below — approach 1 of 4, deliberately the simplest one.
- **In-person / self-test transcription**: each 15s chunk is uploaded to
  `POST /api/meetings/[meetingId]/transcribe-audio`, transcribed via
  OpenAI's audio transcription API (`lib/services/audioTranscription.ts`,
  model configurable via `OPENAI_AUDIO_TRANSCRIPTION_MODEL`, default
  `gpt-4o-mini-transcribe`), and logged to `ai_run_logs` with
  `run_type: "audio_transcription"` exactly like every other AI call in
  the app.
- **Transcript segments feed the existing pipeline, unchanged**: a
  non-empty transcription becomes a real `transcript_segments` row
  (`source_type: "live_audio"`, distinguishing it from manual segments -
  see `0011_live_audio_transcript_source.sql`) via
  `submitLiveAudioSegment` in `lib/services/transcriptAnalysis.ts`, which
  calls the exact same `runAnalysisPipeline` helper manual submission
  uses. There is no separate reasoning path for live audio - this was the
  hard product constraint for Sprint 11, and it holds structurally: the
  fast-loop analyst and workflow extractor have no idea whether a segment
  came from typing or a microphone.
- **Pause/resume analysis**: a client-side (not persisted) toggle. While
  paused, new chunks still transcribe and save as segments, but
  fast-loop/workflow-extractor calls are skipped; a pending count shows
  in the panel. Resuming (or "Analyze latest segment now") runs one
  analysis pass anchored on the newest segment, which - because the fast
  loop and workflow extractor already read the full accumulated
  transcript for the thread, not just one chunk - catches up on
  everything that piled up while paused in a single call.
- **Manual transcript mode is fully unaffected**: `submitTranscriptChunk`
  (the manual path) is unchanged in behavior, just refactored to share
  the same underlying pipeline helper as the live-audio path.

### What does not work (unchanged from the plan below)

- **Zoom/Teams/remote-meeting audio** - only the facilitator's own
  microphone is captured, not a remote call's incoming audio. See
  "Remote meeting audio limitations" below - still entirely unimplemented.
- **System audio capture** - no tab-audio or system-loopback capture was
  built. See "Mac system audio limitation" below.
- **Speaker diarization** - transcripts are plain text with no per-speaker
  attribution. Out of scope for Sprint 11 by explicit instruction.
- **Production-grade consent/compliance** - the consent modal is a
  plain confirmation dialog, not a compliance-audited flow; see "Consent
  and disclosure requirements" below, which still applies in full. This
  prototype does not certify legal sufficiency in any jurisdiction.
- **A persisted pause/resume or recording state** - both live only in
  the browser tab's React state; refreshing the page resets them (the
  transcript segments already saved are unaffected, only the panel's
  in-progress recording/pause UI state is lost).
- **Meaningful-segment detection** - Sprint 11 uses a fixed 15-second
  timer, not the hedge-word/token-count/pause-detection heuristics
  described in "Meaningful segment detection rules" below. Every non-empty
  15s chunk becomes its own transcript segment; there's no buffering or
  merging across chunks. This is a deliberate "keep it simple in v1"
  simplification, not an oversight - true segment detection is still a
  candidate for a later sprint.

### How to test

1. Open a meeting's Live HUD (`/meetings/[meetingId]/live`) with the
   meeting already started.
2. In the Live Audio panel, click **Start recording** and confirm the
   consent panel.
3. Grant the browser's microphone permission prompt.
4. Speak a short, discovery-relevant sentence (e.g. one of a demo
   scenario's transcript chunks read aloud).
5. Wait up to ~15 seconds for the chunk to cut, upload, and transcribe -
   the panel shows "Transcribing…" and the new text appears in Recent
   Transcript with a "Live audio" badge once done.
6. With analysis running (the default), confirm the queue/directions and
   WorkflowPanel update the same way they would after a manual chunk.
7. Click **Pause analysis**, speak another chunk, and confirm it's saved
   (visible in Recent Transcript) but the HUD's directions/workflow don't
   change until you click **Resume analysis** or **Analyze latest
   segment now**.
8. Click **Stop recording** and confirm the panel reports the microphone
   stream released.
9. Confirm manual transcript input (typing/pasting + Analyze Chunk) still
   works exactly as before, including after using live audio in the same
   session.
10. Check the debug page (`/meetings/[meetingId]/debug`) for
    `audio_transcription` run log entries.

## Sprint 13 continuous-mode status

Sprint 13 replaced Sprint 11's "every 15s chunk is its own segment"
behavior with a client-side buffering + deterministic meaningful-segment
gate, without touching the reasoning pipeline itself.

### What changed

- **The internal chunking is unchanged** — `LiveAudioRecorder` still
  stop/restarts a `MediaRecorder` every ~15s for reliable decoding
  (`LiveAudioPanel.tsx`'s `CHUNK_INTERVAL_MS`). What changed is what
  happens to the transcribed text afterward.
- **`POST /transcribe-audio` is now pure transcription.** It no longer
  creates a `transcript_segments` row or returns `HudState` - it returns
  `{ text, model, chunkIndex, durationMs }` and nothing else. Still logs
  `audio_transcription` to `ai_run_logs` exactly as before.
- **A client-side live transcript buffer** (`pendingChunks` state in
  `LiveAudioPanel.tsx`) accumulates transcribed text across chunks. It is
  not persisted anywhere - refreshing the page loses unanalyzed pending
  text, same caveat as Sprint 11's client-only pause/resume state.
- **Deterministic meaningful-segment detection** —
  `lib/live/meaningfulSegments.ts`, no LLM involved - decides whether the
  buffer is worth analyzing yet. Implements the rules from "Meaningful
  segment detection rules" below (updated with what was actually built,
  see the Sprint 13 reality callouts throughout this doc).
- **A new route, `POST /api/meetings/[meetingId]/live-audio/analyze-buffer`**,
  takes the client's buffered text, re-runs the same detection
  server-side (the real enforcement gate, not just a client hint), and —
  only if meaningful or the user forced it — creates exactly one
  `transcript_segments` row (`source_type: "live_audio"`,
  `transcription_metadata.source: "live_audio_continuous"`) and runs the
  existing fast-loop/workflow-extractor/contradiction-detector pipeline
  via `submitLiveAudioSegment` — the same function Sprint 11 already
  used, unchanged. **Still no separate reasoning path for live audio.**
- **Pause no longer creates unanalyzed segments.** In Sprint 11, pausing
  analysis still saved a `transcript_segments` row per chunk (just
  skipped the pipeline call). In Sprint 13, pausing simply stops the
  buffer from ever calling `analyze-buffer` automatically - text
  accumulates client-side only, and nothing is written to
  `transcript_segments` until analysis actually runs (auto on Resume if
  meaningful, or via "Analyze pending", which works regardless of pause
  state).
- **The old `/analyze-pending` route is untouched** and still exists
  (catches up on already-saved-but-unanalyzed segments), but the live
  audio UI no longer calls it - under Sprint 13's design that situation
  mostly can't occur anymore, since segments are only ever created at
  the moment analysis is about to run.

### Known limitations carried into Sprint 13

- **Not truly idempotent server-side.** `analyze-buffer` has no stable
  buffer id/hash, so two identical requests would create two segments.
  The client's `analyzing` in-flight flag prevents this in normal use
  ("client duplicate guarded"), but the route itself doesn't protect
  against a retried/duplicated request. Acceptable for Sprint 13's
  single-facilitator, no-auth scope; would need a real idempotency key
  before this became multi-user or retry-safe.
- **Meaningful detection is a rough heuristic, not NLP.** Token counts
  are word-count-minus-filler-words, and the actor+action+object rule is
  a regex over a small verb/noun list - it will occasionally over- or
  under-trigger on real speech. Tuned conservatively (default is "don't
  analyze") per product direction, and always overridable via "Analyze
  pending."
- **Still no remote meeting audio, system/tab audio, virtual audio
  devices, or speaker diarization** - unchanged from Sprint 11, see the
  sections below.
- **Still no true streaming/partial-token transcription** - each ~15s
  chunk is transcribed as a whole after it's cut, not word-by-word as
  spoken. "Continuous mode" describes the UX (no manual re-trigger per
  chunk, buffering across chunks), not real-time streaming ASR.

## Product goal

Today, the facilitator manually pastes transcript chunks during a meeting
and clicks "Analyze Chunk." The goal for live audio is to remove that
manual paste step for meetings where it's practical — capture speech,
turn it into text, and feed it into the same transcript-segment pipeline
that manual input already uses — **without changing what happens after
the text exists**. The workflow extractor, fast-loop analyst, evidence
layer, human-correction protections, and ambiguity flags all already work
on `transcript_segments` rows; live audio is only ever a new way to create
those rows, never a new analysis path.

Non-goals for the live audio work itself (separate from Sprint 10's
existing non-goals): this doc does not propose meeting recording/storage,
speaker diarization as a hard requirement, or real-time UI transcription
display polish — those are implementation details for whoever picks up
Sprint 11, not commitments made here.

## Consent/disclosure requirements

Capturing audio from a meeting — the facilitator's own voice, other
participants, or a remote call's system audio — has consent implications
that don't exist for manually pasting notes someone already agreed to
share. Before any live capture code ships:

- The facilitator must see an explicit on/off control for live audio, not
  an always-on background process. Manual transcript input must keep
  working as a fully independent path.
- The app should require an explicit acknowledgment ("I have consent to
  record/transcribe this meeting") before enabling capture, not just a
  browser permission prompt — a browser mic-permission grant confirms the
  *device* allows it, not that every participant has agreed to it.
- No audio should be persisted by default. If any raw audio buffering is
  needed transiently for transcription, it should be discarded as soon as
  text is extracted, not written to storage, unless a future sprint
  explicitly adds recording as its own scoped feature with its own
  consent flow.
- Multi-party remote calls raise this further: the facilitator consenting
  for themselves does not cover other participants. This is a strong
  argument for starting with in-person/single-mic capture (Approach 1
  below) before remote/tab-audio capture (Approach 2), since the
  facilitator has more direct control over consent in person.

## Browser microphone capture plan

The most direct approach: use the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)'s
`SpeechRecognition` interface (or a streaming ASR service if browser
support/accuracy proves insufficient) to capture from the facilitator's
own microphone, in the browser, no new backend infrastructure required.
This covers **one voice reliably** — the facilitator narrating or
paraphrasing what's said in the room — which is enough for a first
version even though it doesn't capture other participants' voices
directly in a remote call.

**What Sprint 11 actually built instead**: `MediaRecorder` capturing
fixed-length chunks client-side, sent to a backend route that calls
OpenAI's audio transcription API server-side, rather than the browser's
built-in `SpeechRecognition`. Reasons: `SpeechRecognition` support/quality
varies significantly by browser (Chrome-only in practice, and it silently
streams audio to Google's servers with no server-side control or
consistent model choice), while `MediaRecorder` is broadly supported and
routing transcription through the backend keeps the OpenAI API key
server-side and the transcription model centrally configurable
(`OPENAI_AUDIO_TRANSCRIPTION_MODEL`) - consistent with how every other AI
call in this app already works. Same single-voice coverage and same
limitation (doesn't capture other participants directly in a remote
call) either way.

## Remote meeting audio limitations

For a remote meeting (Zoom/Meet/Teams/etc.), a browser mic only captures
the facilitator's own audio input, not the other participants' voices
coming through the meeting app's speaker output — mic capture and
"what's playing in this remote call" are two different audio paths.
Getting the *other* participants' speech requires one of:

- The facilitator manually paraphrasing what others say (works today,
  no new capture needed — this is just "live audio assists the
  facilitator's narration," not a required capability).
- Tab/system audio capture (see below) to also pick up what the meeting
  app is outputting.
- A meeting bot/integration joining the call directly (see below) —
  the most complete answer, and the most complex.

## Mac system audio limitation

macOS does not let a browser (or most ordinary apps) capture system-wide
"what's currently playing" audio directly — there's no built-in loopback
device. Capturing a remote call's incoming audio on a Mac requires either:

- A virtual audio device (e.g. BlackHole, Loopback) installed and
  manually routed by the user beforehand — this is a real setup burden
  on the facilitator, not something the app can configure for them.
- Screen/tab sharing with audio via `getDisplayMedia({ audio: true })`
  in Chrome-based browsers, which *can* capture a shared browser tab's
  audio output (including a meeting running in that tab) without extra
  installs — the most practical near-term option on Mac, with the
  caveat that it only works for meetings actually running in a
  capturable browser tab, not a native meeting app window.

This is a real platform constraint, not a DiscoveryOS limitation to
engineer around — it should be documented to the user plainly rather than
silently degraded or faked.

## Possible future approaches, roughly in order of effort

1. **In-person / browser mic** — facilitator's own mic only, in-room or
   narrating a remote call. Lowest effort, clearest consent story,
   covers the single-voice case fully today.
2. **Tab audio capture** — `getDisplayMedia` with audio, for a remote
   meeting running in a shareable browser tab. Captures other
   participants' voices without extra installs, but browser/OS-specific
   and requires the user to actively share the right tab.
3. **Virtual audio device** — BlackHole/Loopback-style routing for
   native meeting apps (not just browser tabs). More capture coverage,
   more setup burden, and depends on software the app can't install or
   configure on the user's behalf.
4. **Meeting bot / integration** — a bot that joins the call directly
   (Zoom/Meet/Teams APIs) and streams audio server-side. Most complete
   and most consistent capture, but the most infrastructure, the most
   third-party-integration surface (explicitly out of scope through at
   least Sprint 10), and the most involved consent/disclosure story
   (a visible bot participant, not just a facilitator's own device).

None of these are being built in Sprint 10. This ordering is a proposed
starting point for Sprint 11, not a locked roadmap.

## Transcript buffering plan

Live speech-to-text arrives as a stream of partial, constantly-revised
text, not clean finished sentences — feeding every partial update into
the workflow extractor would be wasteful (constant AI calls) and noisy
(the model reasoning over half-finished sentences). The plan:

- Buffer incoming partial transcription text locally in the browser as it
  arrives.
- Only promote buffered text to a real `transcript_segments` row (the
  same table manual input already writes to) once it crosses a
  "meaningful segment" boundary (see below) — never on every partial
  update.
- Once promoted, the new segment flows through the exact same
  `/api/meetings/[meetingId]/transcript-segments` endpoint and pipeline
  manual input already uses today. Live audio's only job is deciding
  *when* to call that endpoint and with *what* text — everything
  downstream is unchanged.

## Meaningful segment detection rules

**Not implemented in Sprint 11.** The prototype cuts a chunk every fixed
15 seconds (`LiveAudioRecorder`'s `chunkIntervalMs`) regardless of speech
content - no pause detection, no token-count threshold, no high-signal
term matching. This was a deliberate "keep it simple in v1" call: a fixed
timer needed no tuning against real transcription output to ship, while
the rules below still need exactly that tuning before they'd be worth
the added complexity. The rules below remain the intended design for
whichever later sprint picks this up - a starting point to tune against
real transcription output, not a guess to treat as final:

- **Completed speaker turn**: a pause in speech long enough to infer the
  speaker has finished a thought (not just a mid-sentence breath) —
  typically inferred from the ASR engine's own end-of-utterance signal
  where available, or a fallback silence threshold (e.g. ~1.5–2s) if not.
- **Minimum content threshold**: at least roughly 40 tokens of actual
  content — shorter fragments ("yeah", "okay", "right") are usually
  filler/backchannel, not new information, and shouldn't each trigger a
  separate segment.
- **High-signal terms**: a segment containing any of a small set of
  discovery-relevant terms is more likely to be worth analyzing sooner
  even if it's a bit short of the token threshold — approval, legal,
  security, exception, delayed, wrong, missing, manual, depends, usually,
  sometimes, owner, handoff, escalation, compliance, SLA. This list is a
  starting point, not exhaustive, and should grow from real usage rather
  than be treated as complete.
- **Never run AI on every partial update.** Partial/interim transcription
  results are for on-screen live captioning only (if that's ever added),
  never for triggering an extractor or fast-loop call.

**Sprint 13 reality**: implemented as `lib/live/meaningfulSegments.ts`'s
`detectMeaningfulSegment`, but without ASR-level pause/end-of-utterance
detection (the transcription API used here returns finished text per
15s chunk, not a stream with utterance boundaries). The actual rules,
evaluated in order, default to "don't analyze":

1. Pending buffer has ≥40 meaningful (filler-filtered) tokens.
2. The latest chunk alone contains a high-signal term and ≥15 meaningful
   tokens - or ≥2 distinct high-signal terms and ≥6 meaningful tokens
   (density substituting for length on short but signal-dense chunks).
3. ≥45 seconds have elapsed since the pending buffer went from empty to
   non-empty, *and* it has non-zero meaningful tokens (pure elapsed time
   over filler-only text never triggers on its own).
4. A weakly-weighted actor+action+object regex match (e.g. "the support
   agent checks the customer tier...") - only considered once the buffer
   already has ≥8 meaningful tokens, so a vague few-word fragment that
   happens to match the shape can't trigger alone.
5. The user clicks "Analyze pending" - bypasses every rule above and the
   pause state, always wins.

The high-signal term list matches the one below, plus "SLA" using its
acronym casing and the multi-word terms ("not always", "state rule",
"customer data", "new vendor", "bounced back", "informal names",
"system owner") matched as substrings.

## Analysis trigger rules

Once a segment is promoted (per the rules above) and written to
`transcript_segments`, analysis should trigger the same way a manually
pasted chunk does today — no separate "live" analysis path. Proposed
additional throttling specific to a continuous live stream (manual input
naturally throttles itself since a human has to type/paste each chunk):

- Debounce so multiple segments arriving in quick succession (e.g. rapid
  back-and-forth dialogue) can coalesce into one analysis call covering
  all of them, rather than one call per segment.
- Respect a minimum interval between AI calls even if segments keep
  arriving faster than that, so a fast-talking meeting can't spam the
  extractor - this mirrors why manual input requires a discrete "Analyze
  Chunk" click rather than analyzing on every keystroke.

**Sprint 11 reality**: no debounce/coalescing was built. Each 15s chunk
either triggers a full analysis pass immediately (analysis running) or is
saved and deferred entirely (analysis paused) - there's no middle ground
where several chunks get batched into one call while still "running."
Since the fixed 15s chunk interval already throttles how often analysis
can possibly fire (never more than once per ~15s), this was judged
sufficient for a prototype; true debouncing is still a candidate for a
later sprint if 15s chunks prove too chatty in practice.

**Sprint 13 reality**: this is now largely built, via the buffer rather
than a debounce timer. Multiple chunks arriving in quick succession
coalesce naturally into `pendingChunks` and become exactly one
`transcript_segments` row (and one analysis pass) once the buffer as a
whole crosses a meaningful-segment rule - not one row per chunk. The
throttle is still implicitly "at most once per ~15s" (a new chunk is the
only thing that re-checks the rules, other than Resume/manual-analyze),
but the *coalescing* half of this section - several chunks batched into
one call - is now real, not just a fixed interval limiting call
frequency.

## Pause/resume analysis behavior

The facilitator needs a way to temporarily stop live capture from
triggering analysis without losing the session — e.g. during a side
conversation, a break, or a portion of the meeting they don't want
analyzed. Proposed behavior:

- A visible Pause control stops new segments from being promoted/
  analyzed. Audio capture itself may keep running locally (so resuming
  doesn't require restarting mic permission) or may stop entirely,
  whichever proves simpler to implement correctly — a UI/product
  decision better made against real Sprint 11 implementation constraints
  than declared here.
- While paused, the UI should say so plainly (mirroring how the Live
  Audio panel's status line already states the current mode) — never
  analyze silently in the background while showing a "paused" label.
- Resuming picks back up with fresh buffering; nothing paused is
  retroactively analyzed unless the facilitator explicitly chooses to
  (e.g. a manual "Analyze buffered text" action), never automatically.

**Sprint 11 reality**: audio capture keeps running while paused (only
analysis is skipped, matching the first bullet's first option) - pause/
resume is a pure client-side boolean, not persisted, and passed on each
upload as `analysisRunning`. The one deviation from the plan above:
clicking **Resume analysis** automatically triggers a catch-up analysis
pass if anything is pending, rather than requiring a separate explicit
action - in practice "resume" and "catch up on what I paused" are the
same facilitator intent, so requiring two clicks for one intent seemed
like unnecessary friction rather than a meaningful safety boundary. The
same catch-up logic is also available on its own via "Analyze latest
segment now," so both the combined and separate actions exist.

**Sprint 13 reality**: refined further now that pausing no longer saves
unanalyzed segments (see "Sprint 13 continuous-mode status" above) - the
recommended behavior, and what's implemented:

- While paused, `analyze-buffer` is never called automatically. Text
  keeps accumulating in the client-side buffer, visibly (the panel shows
  "Analysis paused" plus the pending token/chunk count), for as long as
  the facilitator stays paused.
- On **Resume**, the client immediately re-runs `detectMeaningfulSegment`
  against whatever's pending: if it now meets a rule, it auto-calls
  `analyze-buffer` (one segment, one analysis pass, covering everything
  said while paused). If not, the buffer stays visible as "Ready to
  analyze" isn't shown (it wasn't meaningful) but "Pending transcript"
  is, and a manual **Analyze pending** click is available at any time
  regardless of pause state.
- **Analyze pending** always forces analysis of the current buffer -
  `force: true` on `analyze-buffer`, bypassing every detection rule and
  the pause state itself. This is the one path that can create a segment
  while still paused (metadata records `detection_reason:
  "manual_force"` and `analysis_paused_at_creation: true` when that
  happens, so it's honestly attributed, not mistaken for an auto-trigger).

## Manual "Analyze Now" behavior

Even with live capture running, the facilitator should be able to force
an analysis pass on whatever's currently buffered but not yet promoted —
useful when they know a meaningful thing was just said and don't want to
wait for the silence/token-threshold heuristics to catch up. This is the
live-audio equivalent of today's manual "Analyze Chunk" button, and
should reuse it directly: "Analyze Now" flushes the current buffer into a
transcript segment and calls the same endpoint the button already calls.

**Sprint 11 reality**: implemented as the Live Audio panel's "Analyze
latest segment now" button, calling
`POST /api/meetings/[meetingId]/analyze-pending` -
`analyzePendingTranscript` in `lib/services/transcriptAnalysis.ts`. It
doesn't "flush a buffer" (there's no client-side unsent buffer in this
design - every recorded chunk is uploaded and transcribed immediately);
instead it runs analysis against whatever transcript segments already
exist for the active thread, which naturally includes anything saved
while paused.

**Sprint 13 reality**: now there *is* a client-side buffer (see above),
so this became closer to the originally-planned behavior. The panel's
button is now labeled "Analyze pending" and calls the new
`POST /api/meetings/[meetingId]/live-audio/analyze-buffer` with
`force: true`, which does flush the buffer - it merges every pending
chunk into one segment and runs analysis, regardless of what the
detection rules would otherwise say and regardless of pause state. The
old `/analyze-pending` route (re-analyze already-saved segments, create
nothing new) still exists and still works, but the live UI no longer
calls it, since Sprint 13's design rarely leaves an unanalyzed segment
sitting in the database the way Sprint 11's per-chunk-segment design
could.

## Failure modes

Speech-to-text and live capture introduce failure modes manual paste
input doesn't have. None of these should ever silently produce a fake or
misleading result — matching the project's existing "no false positives"
posture for the AI extraction layer itself:

- **Mic/tab permission denied or revoked mid-meeting**: surface this
  immediately and fall back to manual transcript input remaining fully
  available — never leave the facilitator staring at a HUD that looks
  live but isn't capturing anything. **Implemented**: `LiveAudioRecorder`
  distinguishes `NotAllowedError`/`NotFoundError` and surfaces a specific
  message; manual input is always rendered above the Live Audio panel and
  never disabled by anything live audio does.
- **Transcription engine failure/disconnect**: same as above — a clear
  "live capture stopped" state, not a silent stall. **Implemented**: a
  failed `/transcribe-audio` call surfaces its error in the panel; a
  `MediaRecorder.onerror` event surfaces its own message and the
  recording state is not left claiming "on" if the stream actually died.
- **Garbled/low-confidence transcription**: low-confidence ASR text
  flowing into the workflow extractor risks the extractor treating
  mis-transcribed words as real transcript evidence. If the capture
  method exposes per-segment confidence, low-confidence segments should
  be flagged distinctly (e.g. not auto-promoted, or visibly marked) rather
  than silently treated as equal to manually-typed, ground-truth text.
  **Not implemented**: Sprint 11 uses the transcription API's plain
  `text` response format, which returns no per-segment confidence to act
  on. A live-audio segment is stored and analyzed with exactly the same
  trust as a manually-typed one - a known gap, not a silent one (this
  note is the documentation of it).
- **Background noise / cross-talk**: may produce nonsense segments below
  the meaningful-content threshold, which the buffering rules above
  should naturally filter out rather than needing separate handling.
  **Partially implemented**: an empty/all-silence transcription (empty
  `text`) is simply never added to the pending buffer (Sprint 13:
  `transcribe-audio` returns `text: ""` and the panel skips it) - but
  non-empty nonsense text from background noise isn't specially
  filtered; it's subject to the same meaningful-segment rules as real
  speech (see "Meaningful segment detection rules" above), which will
  usually but not always keep it out of `transcript_segments`.
- **Extended silence / dead air**: should not trigger repeated empty
  analysis calls — no segment, no call, same as today. **Implemented**
  via the same empty-transcription check above.

## Privacy and data-handling notes

- No raw audio should be persisted to Supabase or any other storage by
  default — only the transcribed text, exactly like manual input today.
  If audio recording is ever wanted as its own feature, it needs its own
  explicit scoping, consent flow, and retention policy, not something
  live-transcription quietly acquires as a side effect.
- Whatever speech-to-text engine is chosen (browser-native Web Speech
  API vs. a third-party streaming ASR service) has different data-
  handling implications — browser-native APIs in Chrome, for instance,
  send audio to Google's servers for recognition. This tradeoff should be
  stated plainly to the user, not buried, and factors into which capture
  approach to prefer for sensitive discovery conversations.
- Transcribed text still flows into `ai_run_logs` and `transcript_segments`
  exactly as manual input does — no new data-retention surface is created
  by live audio beyond the existing "how long do we keep meeting data"
  question, which this doc doesn't attempt to answer since it predates
  live audio entirely.
- This document does not authorize or represent that any of the above is
  legally sufficient consent/disclosure in any given jurisdiction or
  workplace — that determination is the facilitator's/organization's
  responsibility, not something the app can certify.

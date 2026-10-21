# DiscoveryOS

## Run locally

Requires **Node.js 22 or newer** and npm. From your existing checkout:

```sh
cd /Users/adamsaulters/Desktop/Programming/DiscoveryOS
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3033
```

Open **[http://127.0.0.1:3033/login](http://127.0.0.1:3033/login)** and sign
in with your owner or viewer account. After login, you land on **My week**.
Keep the terminal running; press **Ctrl+C** to stop the server.

The app runs locally and connects to the Supabase project configured in
`.env.local`. Your current checkout already has this file. On a fresh
checkout, create it **only if it does not exist**:

```sh
[ -f .env.local ] || cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`OPENAI_API_KEY` before starting the app. The tracker itself makes no AI
calls. For a new Supabase project, follow [SETUP.md](SETUP.md) to apply
migrations and create owner/viewer profiles. The existing hosted project
already has migrations through Sprint 34 applied.

Manual transcript-first live discovery HUD prototype. A facilitator sets up
a meeting, optionally generates an AI pre-meeting brief, pastes transcript
chunks in manually during the call (or, as of Sprint 11, records short
browser-microphone chunks that feed the exact same pipeline), works an
interactive queue of discovery threads and AI-suggested question
directions, watches a structured workflow model build up alongside the
conversation, can view that workflow as a simple visual diagram, can
generate a lightweight post-meeting review, and can score the AI output
against a manual evaluation checklist. Alongside the workflow model, a soft
contradiction detector (Sprint 12) surfaces "needs clarification" candidates
when two separately-evidenced claims appear to be in tension — never a loud
alert, never an accusation. A dashboard lists every meeting and simple top
nav links between a meeting's brief/live/workflow/review/evaluate/debug
pages. No Zoom/Teams or system audio capture, no speaker diarization, no
ticket/story generation. Markdown exports and email/password authentication
are available in the current prototype.

See [docs/progress.md](docs/progress.md) for a short sprint-by-sprint
checkpoint of what's done and what's next, and
[docs/real-meeting-pilot-guide.md](docs/real-meeting-pilot-guide.md) for
practical guidance on running DiscoveryOS in a real (non-scenario) pilot
meeting.

## Daily project CSV updates

Inside a project, open **Daily CSV updates** to download the current baseline,
preview Claude's daily file, and apply updates to that project. Blank cells
and omitted rows preserve existing data; new items require `action=create`.
Give Claude the [handoff guide and prompt](docs/claude-project-updates.md).
Apply migrations **0044 and 0045** before deploying; see [SETUP.md](SETUP.md#daily-project-csv-updates).

## Reorder project work

Owners can use the ↑ / ↓ controls beside work packages, tasks and subtasks
to save their order within the same parent. Board controls reorder tasks
within their status column. Apply migration **0043** before deploying this
update; see [SETUP.md](SETUP.md#saved-work-package-task-and-subtask-ordering).

## Project CSV formatter

On **Projects → Import project CSV**, upload your spreadsheet CSV and click
**Format CSV**. Map columns, review suggested corrections, and fix any flagged
parent links or values in the editable preview. Then download the corrected
CSV or use it for the project import. [Full instructions and column guide](docs/project-csv-import.md).

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Postgres
- OpenAI structured outputs (fast-loop transcript analysis + Setup Analyst)

## Setup

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` **in order** against it (via
   `supabase db push`, the Supabase SQL editor, or `psql`):
   `0001_init.sql`, `0002_transcript_segments.sql`,
   `0003_interaction_tickets.sql`, `0004_setup_analyst.sql`,
   `0005_workflow_extraction.sql`, `0006_evidence_trust_layer.sql`,
   `0007_human_correction_workflow_editing.sql`,
   `0008_post_meeting_review.sql`,
   `0009_evaluation_diagram_ambiguity.sql`,
   `0010_meeting_scenario_id.sql`,
   `0011_live_audio_transcript_source.sql`,
   `0012_contradiction_candidates.sql`. `0006` and `0007` both alter
   the Sprint 4 workflow tables, so they must run after `0005`, and `0007`
   after `0006`. `0008`, `0009`, `0010`, `0011`, and `0012` only add new
   standalone tables/columns and can run any time after `0001` (`0011`
   does alter the Sprint 2 `transcript_segments` table, but only by
   adding new nullable/defaulted columns, so ordering relative to `0002`
   doesn't matter; `0012` also adds one nullable column to `0009`'s
   `evaluation_runs`, so it must run after `0009`).
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase
   project's URL, anon key, and an `OPENAI_API_KEY`. Follow [SETUP.md](SETUP.md)
   for Sprint 33 migrations, user profiles, and public hosting lockdown.
   Optionally set `OPENAI_AUDIO_TRANSCRIPTION_MODEL` to override the
   Sprint 11 live-audio transcription model (default `gpt-4o-mini-
   transcribe`), or `OPENAI_CONTRADICTION_DETECTOR_MODEL` to override the
   Sprint 12 contradiction detector's model (also default `gpt-4o-mini`).
4. `npm install`
5. `npm run dev`

`supabase/dev/cleanup_scratch_meetings.sql` is a dev-only, manually-run
script for clearing out test meetings created while exercising the API by
hand — never run it against a production database.

## Current scope

### Sprint 1 — foundation

- `/meetings/new` — meeting setup form (canonical meeting type / discovery
  strategy dropdowns, framing fields, risks/unknowns, assumptions with
  ordinal confidence, optional pasted context).
- `POST /api/meetings` — creates a meeting, its assumptions, and any pasted
  context.
- `/meetings/[meetingId]/brief` — read-only view of the saved setup, plus
  the generated pre-meeting brief (Sprint 3) and a "Start meeting" action.
- `POST /api/meetings/[meetingId]/start` — marks a meeting live and ensures
  it has an active discovery thread (seeding the automation-discovery
  starter queue first, see Sprint 2).

### Sprint 2 — live HUD, fast-loop analysis, interaction tickets

- `/meetings/[meetingId]/live` — HUD shell: active thread (with focus lock
  indicator, Release focus, Mark covered), question directions (with
  reasons and Use/Defer/Dismiss), queued threads (click to focus), recent
  transcript history, manual transcript input.
- `GET /api/meetings/[meetingId]/hud-state` — aggregates meeting, active
  thread, queued threads, active directions, alerts, and the last 5
  transcript segments.
- `POST /api/meetings/[meetingId]/transcript-segments` — saves a pasted
  transcript chunk and runs it through the fast-loop analyst: updates the
  active thread's understanding level (from a strict 8-item workflow
  coverage checklist, never self-graded by the model) and generates up to
  3 question directions, each with 1-2 questions and a "why this matters"
  reason.
- Direction lifecycle: `active` → `used` / `dismissed` / `deferred` /
  `stale`. Nothing is ever deleted. `POST
  /api/meetings/[meetingId]/directions/[directionId]/{use,dismiss,defer}` —
  defer creates or updates a queued discovery thread from the direction.
- Thread focus: `POST /api/meetings/[meetingId]/threads/[threadId]/focus`
  swaps the active thread (the previous one returns to the queue),
  `.../release-focus` clears the lock without deactivating it, and
  `.../mark-covered` closes it out and promotes the next queued thread.
  These are the only things that ever change which thread is active — AI
  output never does.
- All meaningful actions are logged to `user_actions`.

### Sprint 3 — Setup Analyst + pre-meeting brief

- `POST /api/meetings/[meetingId]/generate-brief` — runs the Setup
  Analyst: a structured OpenAI call that treats the meeting's tentative
  build direction as a hypothesis to challenge, not a fact, and produces a
  brief summary, suggested opening, recommended focus, must-learn items,
  initial hypotheses, assumptions to validate, risk focus, an initial
  discovery-thread queue, and (when relevant) a build-direction warning.
  Regenerating inserts a new `pre_meeting_briefs` row and reconciles
  hypotheses/assumptions/threads by normalized statement or title —
  nothing from a prior generation is deleted.
- The brief page's "Generate Discovery Brief" / "Regenerate Brief" button
  renders all of the above, with loading/success/error states, and warns
  before starting a meeting with no brief generated yet.
- Starting a meeting reconciles the Setup Analyst's initial queue with the
  hardcoded automation-discovery fallback seeds: if Setup Analyst threads
  already exist they're used as-is; otherwise the fallback seeds run. A
  "Workflow mapping" thread, if present, is always preferred as the first
  active thread.

### Sprint 4 — Workflow Extraction v1

- Every transcript chunk now also runs through the **workflow extractor**
  (`lib/services/workflowExtractorService.ts`), a structured OpenAI call
  that runs immediately after the fast loop and updates a persistent
  workflow model for the meeting: `workflows` (one row per meeting — name,
  ordinal confidence, known/unknown summary), `workflow_steps` (current
  process steps, in order), `workflow_components` (actors, systems, data,
  decision rules, approvals, handoffs, exceptions, failure
  detection/recovery, and outputs — tagged by `component_type`), and
  `workflow_gaps` (specific open unknowns). Reconciliation matches
  steps/components/gaps by normalized title/label (and `component_type` for
  components) and updates in place, exactly like the Setup Analyst's
  hypotheses/queue reconciliation — nothing is ever deleted.
- The extractor is deliberately kept separate from the fast loop: it never
  changes thread focus, never touches `question_directions`, and reads the
  *whole* meeting's transcript history (not just the active thread's) plus
  the workflow state as currently understood, so it can extend/revise the
  model rather than starting over each time.
- The extractor only records what the transcript actually evidences — it's
  instructed not to invent systems/actors/rules/steps, not to treat the
  tentative build direction as settled fact, not to recommend a solution,
  and not to call a new or revised detail a "contradiction" (that's out of
  scope). "Easy"/"hard" commentary is treated as prioritization signal, not
  proof that a step or system exists.
- If workflow extraction fails, the failure is logged to `ai_run_logs`
  (`run_type: "workflow_extractor"`) like any other AI run, and
  `submitTranscriptChunk` swallows the error so directions and thread
  understanding — which already succeeded via the fast loop — are still
  returned. The HUD surfaces a one-round warning
  (`HudState.workflowExtractionWarning`) in that case.
- `GET /api/meetings/[meetingId]/hud-state` now includes `workflow: WorkflowView | null`
  alongside everything from Sprint 2/3.
- The live HUD's support column now has a **WorkflowPanel**
  (`app/meetings/[meetingId]/live/WorkflowPanel.tsx`): workflow name +
  confidence, known/unknown summary, known steps in order, key components
  (tagged by type), and open gaps.

### Sprint 5 — Evidence + Trust Layer v1

- Every `workflow_steps`, `workflow_components`, and `workflow_gaps` row now
  carries evidence metadata (migration `0006_evidence_trust_layer.sql`):
  `source_transcript_segment_id` (FK to `transcript_segments`, nullable),
  `source_quote` (a verbatim snippet, nullable), `evidence_type` (`known` /
  `inferred` / `unknown`), and `confidence_reason` (a specific sentence on
  why the item has the confidence/evidence it has).
- The workflow extractor's prompt (`lib/services/workflowExtractorService.ts`)
  now numbers each transcript segment with its real id
  (`[id: <uuid>] ...`) and requires every step/component/gap to cite one of
  those real ids (or `null`) plus a verbatim `source_quote` for anything
  marked `known` — it's explicitly instructed never to fabricate a quote,
  never to cite a segment that doesn't support the item, never to treat the
  tentative build direction as evidence, and never to treat a generic
  "queue" as a system. Gaps are always `evidence_type: "unknown"` by
  construction (set in code, not asked of the model), since a gap *is* the
  unknown.
- Every `source_transcript_segment_id` the model returns is validated
  against the meeting's real segment ids before it's ever persisted
  (`sanitizeSourceSegmentId` in `workflowExtractorService.ts`) — an invalid
  or hallucinated id is dropped to `null` rather than trusted, and never
  fails the run.
- Reconciling an already-known step/component/gap on a later chunk uses
  simple evidence-strength precedence (`pickEvidence` in
  `lib/services/workflows.ts`): `known` beats `inferred` beats `unknown`.
  Weaker evidence from a later run never overwrites stronger evidence a
  prior run already established; evidence at least as strong refreshes the
  quote/reason.
- `GET /api/meetings/[meetingId]/hud-state` now also returns
  `evidenceTranscriptSegments: Record<string, TranscriptSegment>` — every
  transcript segment cited as evidence anywhere in the current workflow,
  keyed by id, fetched independently of the last-5
  `recentTranscriptSegments` window so older evidence still resolves.
- **WorkflowPanel** now renders a Known/Inferred/Unknown `EvidenceBadge` next
  to every step, component, and gap, an inline short source quote when one
  is cited, and a **View evidence** action that opens the
  **EvidenceDrawer** (`app/meetings/[meetingId]/live/EvidenceDrawer.tsx`) —
  showing the item's title, evidence type, ordinal confidence (steps/
  components only), confidence reason, source quote, the full cited
  transcript segment, and its timestamp.
- Direction reasons (fast loop) now explicitly forbid generic filler
  ("to gather more information", "to explore this further") and require
  naming the actual coverage gap/decision/actor/risk the direction targets.
- `/meetings/[meetingId]/debug` — a dev/debug, unauthenticated trace-lite
  page (not linked from the live HUD) listing every `setup_analyst`,
  `fast_loop_analysis`, and `workflow_extractor` AI run for the meeting,
  newest first, with status, model (read back out of each run's logged
  `input.model`), latency (`completed_at - created_at`), error text, and
  expandable `<details>` input/output payloads. Backed by
  `getAiRunLogsForMeeting` in `lib/services/aiRuns.ts`.

### Sprint 6 — Human Correction + Workflow Editing v1

- Every `workflow_steps`, `workflow_components`, and `workflow_gaps` row now
  also carries edit metadata (migration
  `0007_human_correction_workflow_editing.sql`): `source_origin`
  (`ai` / `human` / `ai_human_edited`), `human_verified`, `human_note`,
  `locked_by_user`, and `last_edited_by_user_at`. `workflow_gaps` also gets
  its own `gap_status` (`open` / `answered` / `dismissed`), since a gap's
  lifecycle (resolved vs. explicitly set aside) is a separate concept from
  `human_verified` (which just means "confirmed accurate" and applies
  uniformly across all three item types).
- **Editing protection** lives in the reconcile functions in
  `lib/services/workflows.ts`: `protectsHumanText` stops the workflow
  extractor from overwriting an item's title/label/description once a
  human has either edited it (`source_origin` moved off `'ai'`) or
  explicitly locked it (`locked_by_user`) — either condition is enough on
  its own. Evidence enrichment (`pickEvidence`, from Sprint 5) still applies
  independently on top of a protected item, since evidence and text are
  updated separately. `pickConfidenceLevel` separately stops a
  human-verified item's ordinal `confidence_level` from ever being lowered
  by a later run (it can still rise). Nothing is ever deleted — an
  AI run that stops mentioning a human-edited item simply leaves it as-is,
  exactly like Sprint 4/5's existing reconcile behavior for any unmatched
  item.
- The workflow extractor's prompt echoes each item's protection state back
  as an inline tag (`[locked by user]`, `[edited by user - keep
  title/label exactly as-is]`, `[human-verified]`) in the "current workflow
  model" context it's given every run, and is instructed to repeat locked/
  edited items back verbatim rather than reproposing them under slightly
  different wording — this is a belt-and-suspenders measure on top of the
  code-level protection: reconciliation matches by normalized title/label,
  so if the model *did* propose different wording for a protected item, it
  would silently insert a confusing duplicate rather than being blocked
  (the code-level guard only stops an exact-matched row's text from being
  overwritten, it can't stop a near-miss from being inserted as new).
- New editing service functions in `lib/services/workflows.ts`:
  `updateWorkflowStep` / `updateWorkflowComponent` / `updateWorkflowGap`
  (title/label + description + human_note, flips `source_origin` to
  `ai_human_edited` on first edit), `markWorkflowItemVerified`,
  `lockWorkflowItem` / `unlockWorkflowItem` (generic across all three item
  types via `WorkflowItemType`), and gap-only `markGapAnswered` /
  `dismissGap`. `lib/services/workflowItemActions.ts` wraps these with
  meeting-id ownership checks, `user_actions` logging, and a fresh
  `HudState` return, mirroring `directionActions.ts`'s existing pattern.
- New routes, nested under the existing `/api/meetings/[meetingId]/...`
  convention rather than the flat `/api/workflow/...` shape (to stay
  consistent with how every other per-meeting sub-resource action is
  routed, e.g. `/api/meetings/[meetingId]/threads/[threadId]/focus`):
  `PATCH .../workflow/{steps,components,gaps}/[id]`, and `POST
  .../workflow/{steps,components,gaps}/[id]/{verify,lock,unlock}`, plus gap-only
  `POST .../workflow/gaps/[gapId]/{mark-answered,dismiss}`.
- **WorkflowPanel** gained inline action buttons per item (View evidence,
  Edit, Mark verified once unverified, Lock/Unlock, and for gaps also Mark
  answered/Dismiss while `gap_status` is `open`), plus **AI-generated /
  Human edited**, **Verified**, and **Locked** badges, an inline human note
  line when present, and an **answered**/**dismissed** status badge on
  resolved gaps. **WorkflowItemEditModal** (new) is a small centered
  modal — title/label, description, human note, Save/Cancel — opened by
  the Edit action; **EvidenceDrawer** now also shows source origin,
  verified/locked status, and the human note when present.
- Logged `user_actions`: `workflow_step_edited`, `workflow_component_edited`,
  `workflow_gap_edited`, `workflow_item_verified`, `workflow_item_locked`,
  `workflow_item_unlocked`, `workflow_gap_answered`, `workflow_gap_dismissed`.

### Sprint 6 manual QA

Verified end-to-end against the retained "Sprint5 Evidence Retest" meeting:
edited a step title and a component description/note, locked a step
without editing it, verified a step, marked one gap answered and dismissed
another, then submitted a new transcript chunk. Confirmed: the edited
title and locked step's original title both survived the AI re-run
unchanged; the verified step's confidence wasn't downgraded; both gap
statuses persisted; a genuinely new AI-generated step ("Log Incoming
Document", evidenced from the new chunk) was still added; and all eight
`user_actions` types logged with correct payloads. (Note: at the time this
was written, a bare "shared spreadsheet" mention correctly stayed as
prose only, not a `system` component — Sprint 6.5 below revises that
policy, since a concrete-but-unbranded artifact like a shared spreadsheet
should be captured as a system.) Repeat this walkthrough (or a fresh
Scenario 1 meeting) after any future change to
`lib/services/workflows.ts`'s reconcile logic.

### Sprint 6.5 — Workflow Reconciliation Polish

A follow-up pass fixing five workflow-quality issues surfaced by extended
manual testing of Sprint 6 (no new schema, no new API routes):

- **Duplicate AI items after human edits** (`lib/services/workflows.ts`):
  reconcile previously matched only by exact normalized title/label, so a
  human rename (e.g. "Review incoming document intake") would silently
  desync from the AI's next differently-worded proposal for "the same"
  step (e.g. "Review Incoming Document"), creating a confusing duplicate.
  Each reconcile function now falls back to `findFuzzyProtectedMatch` -
  token-overlap scoring (title+description+quote, threshold 0.6) against
  *protected* (locked or human-edited) candidates only, and only when the
  exact match fails - when it matches, the draft is treated as an update
  to the existing protected row (so its human text is never touched) and a
  `[workflow-reconcile] suppressed AI duplicate ...` dev note is logged to
  both the server console and `ai_run_logs.output.duplicateSuppressions`
  (visible on `/meetings/[meetingId]/debug`). Pure-AI items keep the
  original strict exact-match behavior untouched. Sprint 6's prompt-level
  `[locked by user]` / `[edited by user - ...]` tags remain as a first
  line of defense so this fallback is rarely needed in practice.
- **Concrete unbranded tools not captured as systems**: the "system"
  component definition (in both the schema description and the
  extractor's system prompt) previously implied a system needed a
  recognizable product name. It's revised so any concretely-described
  artifact/tool counts - "a shared spreadsheet," "a shared drive," "an
  internal ticketing system" are systems exactly like "Salesforce" - while
  bare destination words ("queue," "inbox," "process") still aren't. A new
  MANDATORY system/tool checklist (mirroring the existing actor checklist)
  requires pairing any step/component whose description mentions logging/
  tracking/storing in a specific artifact with its own system component,
  plus a worked contrast example, since this needed more explicit
  reinforcement than the definition change alone reliably produced with
  `gpt-4o-mini` (see the verification note below).
- **Stale open gaps after the answer becomes known**: the extractor's
  output schema gained `answered_gap_labels` - the model itself names
  which currently-open gaps (echoed back with exact label text in the
  prompt) this run's transcript now directly resolves, since real
  semantic matching (e.g. a "Detect Misrouted Document" step resolving a
  "Failure Detection Mechanisms" gap) isn't reliably doable with a lexical
  heuristic the way Sprint 6.5's duplicate-title matching is. A new
  `autoAnswerGaps` (`lib/services/workflows.ts`) transitions each matched,
  still-open, unlocked gap to `gap_status: "answered"`, logging both to the
  console and `ai_run_logs.output.autoAnsweredGaps`. A locked gap is never
  auto-resolved - locking means hands off entirely, including status.
- **WorkflowPanel gap display**: "Open gaps" now only ever shows
  `gap_status: "open"` items; answered/dismissed gaps move into a
  collapsed `<details>` "Resolved gaps (N)" section below it, sharing the
  same row rendering (badges, quote, actions) via one `renderGapItem`
  helper.
- **Stale known_summary/unknown_summary**: the system prompt now requires
  cross-checking both summaries against the same response's own steps/
  components/gaps/`answered_gap_labels` before writing them - never call
  something unknown if it's actually in the known/inferred items being
  returned, and never let known_summary lag behind what's actually known
  about failure ownership, handling team, frequency, consequences,
  systems/tools, or alerting.

**Verification note:** all five fixes were confirmed with real OpenAI
calls (`gpt-4o-mini`, this project's default extractor model). The
duplicate-suppression *algorithm* was additionally verified deterministically
(token-overlap scoring reproduced a 1.00 score on the exact
"Review incoming document intake" vs "Review Incoming Document" case from
the bug report, and correctly scored 0.00 - no match - against an unrelated
step). On a fresh meeting, the system-component fix and the gap
auto-answer/summary-accuracy fix each worked cleanly and immediately. On
the long-running, heavily-accumulated "Sprint5 Evidence Retest" meeting,
results were good but not perfect on every single run - e.g. `gpt-4o-mini`
sometimes still leaves one gap's `unknown_summary` mention stale even after
auto-answering two others in the same response. This reflects the small
model's imperfect instruction-following over an increasingly long, complex
system prompt and accumulated context, not a defect in the reconcile logic
itself: the code-level guards (exact-match-first, protected-only fuzzy
fallback, exact-gap-label-match-only auto-answer) mean every observed
failure mode was a safe no-op (an item just isn't merged/resolved yet),
never a false positive or a lost human correction.

### Sprint 7 — Post-Meeting Review Lite + Navigation Foundation

- **Navigation** (`app/Nav.tsx`, wired into `app/layout.tsx`): a slim global
  top bar on every page - Dashboard, New Meeting, and (only while inside
  `/meetings/[id]/...`) Brief/Live HUD/Review/Debug tabs for that specific
  meeting, detected from the URL via `usePathname()` rather than needing
  every page to pass its own meetingId down. The live HUD's header also
  gained direct "← Back to dashboard" / "Back to brief" / "Post-meeting
  review" links, and the debug page gained "← Back to dashboard" / "Go to
  live HUD" - no page is a dead end that requires typing a URL by hand.
- **Dashboard** (`app/page.tsx`, replacing the old static landing page) -
  lists every meeting (`getAllMeetings` in `lib/services/meetings.ts`),
  newest-updated first, with type/strategy/status/created/updated columns
  and Brief/Live HUD/Review/Debug links per row. Marked
  `export const dynamic = "force-dynamic"` - without it, Next statically
  prerenders this route at build time (it has no dynamic URL segment to
  force it otherwise) and would bake in a stale meeting list instead of
  reading Supabase on every request. Empty state links to `/meetings/new`.
- **Post-meeting review** (`/meetings/[meetingId]/review`) - a one-click,
  regenerable lightweight retrospective. New `post_meeting_reviews` table
  (migration `0008_post_meeting_review.sql`): one row per generation,
  never updated or overwritten (`createPostMeetingReview` in
  `lib/services/postMeetingReviews.ts` only ever inserts), so review
  history is preserved and the page just shows the latest by
  `generated_at`. Generation itself
  (`lib/services/postMeetingReviewService.ts`,
  `POST /api/meetings/[meetingId]/generate-review`) is a structured OpenAI
  call producing: executive summary, key learnings (each tagged
  known/inferred with an optional supporting workflow item + source
  quote), a workflow-that-emerged summary, known facts vs. inferences,
  open questions, per-assumption status updates
  (supported/weakened/unresolved/changed), a build-direction assessment
  (supported/partially_supported/weakened/needs_reframing, with an
  optional recommended reframe), recommended follow-ups, and risks.
  `run_type: "post_meeting_review"` is logged to `ai_run_logs` exactly
  like the other AI services (model/latency/status/error all visible on
  `/meetings/[meetingId]/debug`, which now also lists it), and
  `post_meeting_review_generated` / `post_meeting_review_regenerated` are
  logged to `user_actions` depending on whether a prior review already
  existed.
- **Source priority is enforced in the prompt, not just described**: the
  review generator is explicitly told the workflow's own
  `known_summary`/`unknown_summary` free-text fields can lag behind
  reconciliation on a long-running meeting, and to prefer, in order,
  human-edited/verified workflow items, the current
  `workflow_steps`/`workflow_components`/`workflow_gaps`, each gap's
  `gap_status`, evidence metadata/source quotes, the full transcript, and
  only then the workflow's own summary text as secondary context. The user
  prompt itself is built this way: steps/components render inline with
  their evidence type and a `[human-edited]`/`[human-verified]`/`[locked]`
  trust tag (mirroring the workflow extractor's own tags from Sprint 6),
  and gaps are split into two clearly-labeled blocks - open gaps (real
  unknowns) and resolved gaps explicitly marked "NEVER present these as
  open unknowns" - rather than one flat list the model has to
  self-filter from `gap_status` values buried in the data.
- **Build direction assessment is evidence-driven, not scripted**: the
  prompt never hardcodes an expected verdict for any specific scenario. It
  instructs the model to name a mismatch between the tentative build
  direction and the workflow's actual complexity (routing/decision logic,
  jurisdiction variation, reviewer/ownership determination, compliance
  approval, failure detection/recovery, systems/tooling) only when the
  real evidence in front of it supports that - see the manual QA note
  below for what this produced on the document-intake scenario, which
  happens to be exactly the outcome because that meeting's real evidence
  supports it, not because the prompt says so for every meeting.

### Sprint 7 manual QA

Verified end-to-end against the retained "Sprint5 Evidence Retest"
meeting via the real API/browser (not just service-function calls):
dashboard listed the meeting with all four working links; every nav path
(dashboard → live → brief → review → debug and back) worked without
typing a URL; generating a review produced a build-direction assessment
of `needs_reframing` naming the actual gaps (Legal approval, missing
failure detection) as the reason `AI-assisted document classification and
routing` is too narrow - matching the expected outcome for this scenario
purely from the real workflow evidence; all 4 `open_questions` matched
exactly the 4 gaps whose `gap_status` was actually `"open"`, and all 4
resolved (answered/dismissed) gaps were correctly excluded; key learnings
carried real quotes traceable to actual `workflow_steps.source_quote`
values; no fabricated system/tool appeared anywhere in the output; the
empty `assumption_updates` array was confirmed correct (this meeting has
zero recorded assumptions) rather than a bug; regenerating created a
second `post_meeting_reviews` row without touching the first
(`generated`/`regenerated` `user_actions` logged correctly for each); and
the debug page listed the `post_meeting_review` run with status/model/
latency. typecheck/lint/build all pass.

### Sprint 8 — Demo Polish + Meeting Lifecycle

A polish pass fixing a specific problem surfaced by extended demo use: the
top-level `known_summary`/`unknown_summary` and some open gaps can go
stale relative to the actual `workflow_steps`/`workflow_components`/
`workflow_gaps` rows on a long or complex meeting, even after the Sprint
6.5 consistency prompting. No new schema or migration.

- **Workflow display now trusts structured data over prose**
  (`WorkflowPanel.tsx`): a new deterministic, UI-only
  `deriveCurrentModelStateSummary` line ("Current model: 7 steps, 6
  components (4 actors, 2 systems), 3 open gaps, 5 resolved gaps.") is
  computed directly from the same steps/components/gaps arrays the lists
  below render, so it can never drift out of sync the way model-written
  prose can. The model's own `known_summary`/`unknown_summary` text moved
  into a collapsed `<details>` "AI summary" section below it, and a
  "Structured items below are the source of truth" note makes the
  intended reading order explicit.
- **Gap narrowing** (`lib/services/workflows.ts`, `narrowGaps`): Sprint
  6.5 could only fully close a gap (`autoAnswerGaps`) or leave it
  untouched. Many gaps are only *partially* resolved by new evidence - a
  system is now named but a later stage still isn't, or a delay's
  existence is known but not its frequency. The extractor's output schema
  gained `narrowed_gaps` (model-identified, matched by exact echoed label
  like `answered_gap_labels` already was) for exactly this case: the gap
  stays `open` but its label/description is rewritten to name what
  specifically remains unknown, instead of leaving a broad label that
  contradicts what's now known. Gated by the same `open` + not-locked-or-
  human-edited guard the other gap mutations use, and logged to
  `ai_run_logs.output.narrowedGaps` for the same dev-visibility reason as
  `duplicateSuppressions`/`autoAnsweredGaps`.
- **Prompt reinforcement, not new mechanisms**: the system/unknown-summary
  consistency rule from Sprint 6.5 is now much more specific, spelling out
  exactly the demo's three failure patterns (don't say systems are
  unknown once any is named; don't say delay consequences are completely
  unknown once a delay is known; don't say ownership is completely
  unknown once an actor/approval route is known) with worked before/after
  examples for gap narrowing. The actor checklist now explicitly calls out
  relationally-described roles ("the system owner", "whoever owns that
  account") as equally mandatory to capture as fixed department names -
  the exact gap that missed "system owner" in the source demo transcript.
  As with Sprint 6.5, this is prompting a small model (`gpt-4o-mini`)
  more precisely, not a guaranteed fix - which is exactly why the
  deterministic summary line above exists as a backstop that doesn't
  depend on the model getting it right every time.
- **Review page**: the build-direction assessment now renders as its own
  bordered card (border color keyed to status) above the rest of the
  review sections, instead of blending in as one more uniform section -
  it's the headline takeaway. The generate/regenerate button is now
  visually secondary (outlined, not solid) once a review already exists,
  keeping the very first "Generate review" as the only solid/primary call
  to action.
- **Live HUD**: the "Alerts" section (dead since Sprint 1 - no
  alert-generation logic has ever existed) now only renders when there's
  actually an alert to show, instead of a permanent empty "No alerts"
  card.
- **New demo script**: the Employee Onboarding Access Request Demo (setup
  fields + 5 transcript chunks + expected review outcome) is documented
  below as Scenario 2, alongside the existing Scenario 1 (document
  intake/routing) script.

### Sprint 8 manual QA

See the Sprint 8 section of `docs/progress.md` for the actual run-by-run
results of executing the manual QA scenario below against a fresh
"Employee Onboarding Access Request Demo" meeting via the real API/browser.

### Sprint 9 — Evaluation Harness + Workflow Diagram View + Ambiguity Flags Lite

Adds three lightweight, independent additions on top of Sprint 8's demo
polish: a manual quality scorecard, a read-only visual rendering of the
existing workflow model, and conservative capture of fuzzy transcript
language. No live audio, auth, export, third-party integration, ticket
generation, or contradiction detection was added — see "Ambiguity flags are
not contradiction detection" below for why that distinction matters.

- **Evaluation harness + quality scorecards** (`/meetings/[meetingId]/evaluate`,
  new `evaluation_runs`/`evaluation_items` tables): a 7-category, ~28-item
  manual rubric (question direction quality, workflow extraction accuracy,
  evidence correctness, gap quality, review usefulness, hallucination
  checks, demo readiness) defined in `lib/evaluationRubric.ts`. Each item is
  a simple Pass/Fail toggle (click again to reset to unanswered); category
  and overall scores are computed automatically on save
  (`passed / answered * 5`, rounded to one decimal, `null` if a category has
  no answered items yet) rather than entered by hand. Saving always inserts
  a new `evaluation_runs` row (past scorecards are never overwritten, same
  insert-only pattern as `post_meeting_reviews`); the page shows the latest
  run's scores plus the checklist for a new one. The dashboard's new "Eval"
  column shows every meeting's latest overall score at a glance.
- **Workflow diagram view** (`/meetings/[meetingId]/workflow`): a read-only
  rendering of the existing `workflows`/`workflow_steps`/
  `workflow_components`/`workflow_gaps` tables — no new schema. Renders
  steps as a simple vertical CSS flow (Start → step → step → ... → open
  gaps), each step card showing its confidence/evidence/source-origin
  badges (extracted into a shared `WorkflowBadges.tsx` so the Live HUD panel
  and this page render identical badges rather than duplicating markup) and
  a "View evidence" link into the same evidence drawer the Live HUD uses.
  Actors, systems/tools, and open gaps get their own side sections. Never
  invents a step that isn't in the database; an empty workflow shows a
  plain empty-state message instead of a broken diagram.
- **Ambiguity flags lite** (new `ambiguity_flags` table, folded into the
  existing workflow extractor call rather than a separate agent/service):
  a conservative, separate list the extractor also returns alongside
  steps/components/gaps, for genuinely fuzzy transcript language — hedge
  words ("usually", "sometimes", "mostly"), vague ownership ("someone",
  "until someone notices"), informal/ambiguous naming, or decision criteria
  that are implied but never actually stated. Reconciles by exact label
  match, never deletes, and — like gaps — stops updating a flag once a
  human has resolved or dismissed it (protects manual triage from being
  silently reopened by a later AI run). Surfaced in a "Points needing
  clarification" section on the Workflow page with deliberately soft
  labels ("Needs clarification" / "Resolved" / "Dismissed") and
  Mark resolved / Dismiss actions — no live alerts, no popups. Also passed
  as neutral supporting context (open flags only) into the post-meeting
  review prompt.
  - **Ambiguity flags are not contradiction detection.** They never compare
    two statements against each other, never flag a later "actually, ..."
    correction as inconsistent, and never use accusatory language — the
    prompt explicitly forbids framing anything as a contradiction. They
    only note that something *was* said vaguely, informally, or without a
    clearly named owner/criteria; a plain gap (nothing said yet) is never
    an ambiguity flag, and disagreement between two speakers is out of
    scope entirely.

`0009_evaluation_diagram_ambiguity.sql` adds `evaluation_runs`,
`evaluation_items`, and `ambiguity_flags`. The workflow diagram view needed
no schema changes — it only reads tables that already existed.

### Sprint 9 manual QA

See the Sprint 9 section of `docs/progress.md` for the actual run-by-run
results, including a real model-compliance limitation found and partially
fixed during QA (the extractor under-generating `ambiguity_flags`) and one
pre-existing gap noticed but out of this sprint's scope to fix.

### Sprint 10 — Scenario/Eval Expansion + Live Audio Readiness

Building for actual use, not just portfolio/demo polish: a bigger, more
structured scenario library so the app can be tested across more real
discovery situations, an easier way to run those scenarios from the app
itself instead of README copy/paste, and a documented (not yet built)
plan for live audio ahead of Sprint 11. No live audio, contradiction
detection, export/PDF, auth, or third-party integrations were added — see
"Important constraints" at the top of the Sprint 10 request for the full
list this sprint intentionally left alone.

- **Structured scenario library** (`lib/scenarios/`): every demo scenario
  is now a typed `DiscoveryScenario` fixture (`types.ts` defines the
  shape; one file per scenario; `index.ts` exports `SCENARIOS` and
  `getScenarioById`) instead of living only as README prose. Each fixture
  bundles the meeting-setup fields, labeled transcript chunks (with
  optional `expectedSignals` hints for a human QA reader), expected
  outputs (steps/actors/systems/gaps/evidence checks/review assessment/
  ambiguities), and scenario-specific evaluation notes in one place. The
  existing Document Intake Routing and Employee Onboarding Access
  scenarios were migrated into this format (no content changes, just a
  structured home for what was already documented), plus four new
  scenarios covering different workflow shapes: Support Escalation
  (ownership/SLA risk), Spreadsheet Reporting Automation (multi-source
  data quality), Procurement Approval (numeric threshold rules,
  compliance branches), and Customer Onboarding Handoff (cross-team
  handoff, failure discovered downstream). See "Scenario library" below
  for the full list.
- **Scenario loading from the app** (`app/meetings/new/page.tsx`): a
  "Load demo scenario" dropdown at the top of the New Meeting form.
  Selecting a scenario prefills every setup field (name, type, strategy,
  goal, current understanding, tentative build direction, assumptions,
  risks, pasted context) from the fixture; nothing is created until the
  user submits, and every prefilled field stays fully editable. Selecting
  "Blank meeting" behaves exactly as the form always has.
- **`scenario_id` on meetings** (`0010_meeting_scenario_id.sql`): a
  nullable `text` column, not a foreign key (scenarios are code fixtures,
  not a database table) — set only when a meeting is created from a
  loaded scenario. Every existing meeting and every blank-created meeting
  keeps this `null` and is completely unaffected.
- **Demo transcript chunks on the Live HUD** (`DemoScenarioChunks.tsx`):
  when a meeting has `scenario_id` set, a collapsible panel above the
  transcript input lists that scenario's chunks with Copy and Insert
  actions. Insert drops the chunk's text directly into the transcript
  box (now a controlled input, lifted from `ManualTranscriptInput` up
  into `HudShell` for exactly this reason) for the user to review and
  submit themselves by clicking Analyze Chunk — nothing is ever auto-run.
- **Scenario-aware evaluation** (`EvaluateForm.tsx`): when the meeting has
  a scenario, the Evaluate page shows the scenario's name/description and
  its full expected-outputs reference (steps/actors/systems/gaps/
  evidence checks/review assessment/ambiguities/evaluation notes) in an
  open-by-default panel, plus a short relevant-fields hint under each
  rubric category heading (e.g. Workflow extraction accuracy shows the
  expected steps/actors/systems; Hallucination checks shows the full
  expected actor/system list as an "only these should appear" reminder).
  The scenario name field pre-fills from the scenario but stays editable.
  This is reference material for a human scorer, not automated grading —
  the Pass/Fail rubric itself and score computation are unchanged from
  Sprint 9. Meetings without a `scenario_id` see the exact same page as
  before.
- **Live audio readiness** (`docs/live-audio-readiness.md`, new): a
  planning document for Sprint 11, not an implementation - product goal,
  consent/disclosure requirements, browser-mic and remote-meeting/Mac-
  system-audio capture constraints, four possible future capture
  approaches in rough effort order, transcript buffering and meaningful-
  segment-detection rules, analysis trigger/pause-resume/manual
  "Analyze Now" behavior, failure modes, and privacy/data-handling notes.
  On the Live HUD, a small static `LiveModeNote` panel states "Manual
  transcript mode: active" / "Live audio mode: planned (Sprint 11)" and
  points at the doc - it's a label, not a toggle, so it can never be
  mistaken for working functionality.

### Sprint 10 manual QA

See the Sprint 10 section of `docs/progress.md` for the actual run-by-run
results against the Employee Onboarding Access Request scenario and one
newly-added scenario, loaded through the app's own scenario dropdown
rather than pasted from README copy.

### Sprint 11 — Live Audio / Transcription Prototype

A narrow prototype slice of the Sprint 10 plan (`docs/live-audio-
readiness.md`): browser-microphone capture that feeds transcript segments
into the exact same manual-transcript pipeline, with no separate
reasoning path for live audio. **Browser microphone only** - no Zoom/
Teams/remote-meeting audio, no system audio capture, no virtual audio
device, no meeting bot, no speaker diarization. See "What does not work"
in `docs/live-audio-readiness.md`'s Sprint 11 section for the complete,
honest list.

- **Live Audio panel** (`LiveAudioPanel.tsx`, on the Live HUD): shows
  Manual transcript mode / Recording / Analysis state at a glance, and
  requires an explicit consent confirmation ("This prototype records
  microphone audio and sends it for transcription... Use only with
  participant consent... This does not capture Zoom/Teams/system audio
  reliably... Manual transcript mode remains available") before any
  recording starts - Cancel is always available, and manual transcript
  input is never disabled by anything live audio does.
- **Browser mic capture** (`LiveAudioRecorder.tsx`): `getUserMedia` +
  `MediaRecorder`, cutting a fresh ~15-second chunk by stopping and
  restarting the recorder on the same stream (not `MediaRecorder`'s
  `timeslice` mode, which doesn't reliably produce independently-
  decodable WebM fragments across browsers). Mic-denied/no-mic-found
  errors are surfaced distinctly; stopping recording releases the
  stream's tracks.
- **Transcription route** (`POST /api/meetings/[meetingId]/transcribe-
  audio`): receives the audio chunk, transcribes it via OpenAI's audio
  transcription API (`lib/services/audioTranscription.ts`, model
  configurable via `OPENAI_AUDIO_TRANSCRIPTION_MODEL`, default `gpt-4o-
  mini-transcribe`), logs the call to `ai_run_logs` with `run_type:
  "audio_transcription"`, and - for any non-empty transcription - creates
  a real `transcript_segments` row via `submitLiveAudioSegment` (new in
  `lib/services/transcriptAnalysis.ts`), which shares the exact same
  `runAnalysisPipeline` helper the manual path uses. An empty/silent
  chunk never becomes a segment.
- **`transcript_segments.source_type`** (`0011_live_audio_transcript_
  source.sql`): `"manual"` (default) or `"live_audio"`, plus a nullable
  `transcription_metadata` jsonb column (duration, mime type, model,
  chunk index, whether analysis was paused when the segment was
  created). UI-only distinction - a live-audio segment is analyzed
  identically to a manual one; Recent Transcript shows a small "Live
  audio" badge on segments where it applies.
- **Pause/resume analysis**: a client-side (not persisted) toggle in the
  panel. While paused, chunks keep transcribing and saving as segments,
  but the fast-loop/workflow-extractor pipeline is skipped and a pending
  count shows instead. "Resume analysis" or "Analyze latest segment now"
  (`POST /api/meetings/[meetingId]/analyze-pending`) both run one
  analysis pass anchored on the newest segment - since the fast loop and
  workflow extractor already read the full accumulated transcript for
  the thread (not just one chunk), this single call catches up on
  everything that piled up while paused, not just the latest chunk.
  "Resume" auto-triggers this catch-up if anything is pending, rather
  than requiring a second click - documented as a deliberate deviation
  from the original plan doc in `docs/live-audio-readiness.md`.
- **Manual mode is fully unaffected**: `submitTranscriptChunk` behaves
  identically to before, just refactored to share the same underlying
  pipeline helper as the new live-audio path - no behavior change, only
  code reuse.

`0011_live_audio_transcript_source.sql` is the only schema change.

### Sprint 11 manual QA

See the Sprint 11 section of `docs/progress.md` for the actual results.
Note upfront: this session has no browser/microphone access, so the
consent-modal click-through and literal "speak into a mic" steps were
verified by code review rather than physically performed; everything
downstream of "a transcription exists" (segment creation, source_type
attribution, pause/resume, the analysis pipeline, ai_run_logs, the debug
page) was verified end-to-end against a real OpenAI transcription call
using a locally-generated synthetic audio clip standing in for a live
recording.

### Sprint 12 — Contradiction Detection v1

A second, separate "clarification needs" model alongside Sprint 9's
ambiguity flags — not a replacement for it. The distinction matters and is
enforced throughout: **ambiguity flag** = something was said, but vaguely,
informally, or without a clear owner/criteria (Sprint 9, unchanged).
**Contradiction candidate** = two separately-evidenced claims appear to be
in tension with each other (ownership, rules, approvals, systems, timing,
exceptions, or build assumptions). Framing is soft and non-accusatory
throughout: "needs clarification", "possible inconsistency", "may depend on
context" — never "you contradicted yourself", never a loud alert, never
calling a stakeholder contradictory. Most tensions are treated as ambiguity
until confirmed, and the detector strongly prefers false negatives over
false positives (an empty result is the common, correct outcome for most
transcript chunks).

- **New `contradiction_candidates` table** (migration
  `0012_contradiction_candidates.sql`): one row per possible inconsistency —
  `label`, `description`, `contradiction_type` (`ownership_conflict` /
  `rule_conflict` / `approval_conflict` / `system_conflict` /
  `timing_conflict` / `exception_conflict` / `build_assumption_conflict` /
  `terminology_conflict` / `status_conflict` / `other`), `severity` (`low` /
  `medium` / `high` / `critical`), `status` (`open` / `resolved` /
  `dismissed`), `claim_a`/`claim_b` plus each claim's own source transcript
  segment id and verbatim quote, an optional `suggested_clarification_question`,
  and an optional `resolution_note` a facilitator can leave when
  resolving/dismissing. Separate from `ambiguity_flags` entirely — nothing
  in that table was touched.
- **Contradiction candidates service** (`lib/services/
  contradictionCandidates.ts`): `listContradictionCandidates`,
  `reconcileContradictionCandidates` (matches by normalized label +
  `contradiction_type` first, falling back to a token-overlap match on the
  `claim_a`/`claim_b` pair — mirrors `workflows.ts`'s
  `findFuzzyProtectedMatch` — so the detector can't create a near-duplicate
  candidate for "the same two claims" phrased slightly differently across
  runs), `markContradictionResolved`/`dismissContradictionCandidate` (each
  accepting an optional resolution note), and `reopenContradictionCandidate`.
  Like every other reconcile* function in this app, nothing is ever deleted,
  and a candidate already `resolved`/`dismissed` by the facilitator is never
  rewritten or reopened by a later detector run — the facilitator's own
  triage is treated as final, a deliberately conservative reading of "unless
  there is clearly new evidence" (judging "clearly new" would require
  semantic reasoning this reconcile layer doesn't do; a genuinely new
  contradiction just gets its own new row instead, since it won't match an
  existing one by label or claim overlap). `lib/services/
  contradictionCandidateActions.ts` wraps resolve/dismiss with meeting-id
  ownership checks and `user_actions` logging
  (`contradiction_candidate_resolved`/`_dismissed`), mirroring
  `ambiguityFlagActions.ts`.
- **Contradiction detector** (`lib/ai/contradictionDetectorService.ts`): a
  structured OpenAI call (`run_type: "contradiction_detector"` in
  `ai_run_logs`, model configurable via
  `OPENAI_CONTRADICTION_DETECTOR_MODEL`) given the meeting setup, the full
  transcript heard so far (same "whole meeting, not just the newest chunk"
  approach as the workflow extractor — cross-chunk tensions like a
  threshold rule in chunk 2 versus an override in chunk 3 need both in
  context), the current workflow model (steps/components/gaps, with
  human-edited/locked/verified items tagged inline so the model never
  treats a human's own correction as "conflicting" with something the AI
  extracted earlier), open ambiguity flags (context only, not evidence of a
  contradiction), every contradiction candidate already tracked (so a
  resolved/dismissed one is never re-flagged without clearly new evidence),
  and the tentative build direction explicitly labeled a hypothesis, never a
  fact, except as one side of a `build_assumption_conflict` comparison. The
  prompt only allows a candidate when both claims are actually evidenced,
  forbids inventing quotes (verbatim substrings only, validated against real
  segment ids exactly like the workflow extractor's own
  `sanitizeSourceSegmentId`), forbids flagging normal refinement/an "actually,
  ..." addition as a contradiction, and forbids flagging a later exception to
  an earlier general rule as a contradiction *unless* the system currently
  records that rule as universal in a way the exception would break — a
  branching approval path (e.g. "IT provisions basic tools" then "Security
  approves finance tools") is explicitly not a contradiction. An empty
  `contradiction_candidates` array is stated as the expected, correct result
  most of the time, not a failure.
- **Evidence hardening (Sprint 12.1)**: a candidate is only ever persisted
  once its evidence is verified in code, not just prompted for - a
  `source_quote` must be a real (normalization-tolerant, case-insensitive
  fallback allowed) substring of its cited transcript segment, and every
  claim must trace to the transcript or (only for `build_assumption_conflict`)
  the meeting's own `tentative_build_direction` field, never to an open
  `workflow_gaps`/`ambiguity_flags` entry's own wording. A candidate that
  fails either check is dropped entirely before saving - see
  `evaluateCandidateEvidence` in `lib/ai/contradictionDetectorService.ts`.
- **Pipeline integration** (`lib/services/transcriptAnalysis.ts`): runs
  after the workflow extractor, in the same shared `runAnalysisPipeline`
  every transcript segment goes through regardless of source — manual or
  live audio, no separate reasoning path for either. Exactly like workflow
  extraction, a detector failure is caught and surfaced as a one-round
  `HudState.contradictionDetectionWarning` rather than failing the whole
  analysis; `ai_run_logs` records the failure either way.
- **Workflow page — "Possible inconsistencies"** (`WorkflowDiagram.tsx`): a
  new section alongside (not replacing) the existing "Points needing
  clarification" ambiguity-flags section. Each open candidate shows its
  label, type, severity, description, claim A/claim B side-by-side with
  their quotes, the suggested clarification question, and **Mark
  resolved**/**Dismiss** actions
  (`POST /api/meetings/[meetingId]/contradiction-candidates/[candidateId]/
  {resolve,dismiss}`). No modals, no red banners — severity uses the same
  quiet badge styling as everywhere else in the app, even at `critical`.
  Resolved/dismissed candidates collapse into a "Resolved clarifications"
  `<details>` section, hidden by default, same pattern as ambiguity flags'
  own resolved section.
- **Live HUD compact indicator** (`WorkflowPanel.tsx`): when there's at
  least one open contradiction candidate, a small `"N needs clarification"`
  pill appears next to the Workflow panel heading, linking to the Workflow
  page for detail — not a badge on every segment, not a popup, and it
  simply doesn't render at all when the count is zero.
- **Post-meeting review** (`lib/services/postMeetingReviewService.ts`): open
  contradiction candidates are passed into the review prompt as "clarification
  needs", the same neutral-context treatment ambiguity flags already got —
  the model is instructed to mention unresolved ones in `open_questions`/
  `recommended_followups` (using each one's own suggested clarification
  question where it fits) using the same calm language already attached to
  each candidate, and is explicitly told never to say a stakeholder
  "contradicted themselves". A candidate already `resolved`/`dismissed` is
  excluded from the prompt entirely, exactly like an answered/dismissed
  workflow gap.
- **Scenario fixtures** (`lib/scenarios/`): every fixture's
  `expectedOutputs` gained an optional `expectedClarifications: string[]` —
  the specific tension each scenario's transcript is expected to surface
  (or, for Employee Onboarding Access, expected to correctly *not* surface
  as a loud contradiction, since it's this sprint's worked example of normal
  branching).
- **Evaluation harness** (`lib/evaluationRubric.ts`, migration adds
  `evaluation_runs.contradiction_quality_score`): a seventh rubric category,
  "Clarification / contradiction detection quality" — did it identify real
  tensions, avoid false positives, include real evidence for both claims,
  stay calm and non-accusatory, suggest useful follow-up questions, and
  avoid treating normal branching as a contradiction. `EvaluateForm.tsx`
  shows each scenario's `expectedClarifications` as scoring reference,
  exactly like every other category's existing hints.

`0012_contradiction_candidates.sql` is the only schema change: the new
`contradiction_candidates` table plus its three enums, and one new nullable
`evaluation_runs.contradiction_quality_score` column (additive only — every
existing evaluation_runs row and the existing six score columns are
unaffected).

### Sprint 12 manual QA

See the Sprint 12 section of `docs/progress.md` for QA notes and known
limitations.

### Sprint 13 — Live Audio v2: Continuous Mode + Meaningful Segment Detection

Turns Sprint 11's "every ~15s chunk is its own transcript segment"
prototype into a continuous-feeling experience: audio still cuts
internally every ~15s for reliable decoding, but the transcribed text now
buffers client-side and only becomes a `transcript_segments` row — and
only triggers the existing analysis pipeline — when it's actually
meaningful or the facilitator forces it. No new reasoning path: live
audio is still strictly an input method into the same
`transcriptAnalysis.ts` pipeline manual input and Sprint 11 already used.

- **Deterministic meaningful-segment detection** (`lib/live/
  meaningfulSegments.ts`, no LLM): `detectMeaningfulSegment` gates
  whether a pending buffer is worth analyzing, via a word-count-minus-
  filler "meaningful token" heuristic, a ~33-term high-signal word list
  (approval, legal, security, escalation, SLA, override, "customer
  data", "system owner", etc.), and a weakly-weighted actor+action+object
  regex for simple process statements. Five rules, evaluated in order,
  default to "don't analyze": ≥40 meaningful tokens; the latest chunk
  alone has a high-signal term and ≥15 tokens (or ≥2 terms and ≥6
  tokens); ≥45s of non-empty pending text; the process-statement pattern
  once the buffer already has ≥8 tokens; or the user forces it. Pure
  functions, shared by both the client (for live UI feedback) and the
  server route (the real enforcement gate).
- **Client-side live transcript buffer** (`LiveAudioPanel.tsx`): tracks
  pending (not-yet-analyzed) chunks, last-analyzed text/time, pending
  chunk count, and the last detection reason/signal terms — all in React
  state, not persisted, matching Sprint 11's existing client-only
  pause/resume toggle. The panel now shows a single status line
  (Idle/Consent required/Listening/Transcribing/Pending
  transcript/Ready to analyze/Analyzing/Analysis paused) plus a compact
  metrics row, and a "Clear pending buffer" control (native `confirm()`
  guard) that only ever discards unsaved client state, never a
  `transcript_segments` row.
- **`POST /transcribe-audio` is now pure transcription** — no longer
  creates a segment or returns `HudState`, just `{ text, model,
  chunkIndex, durationMs }`. Still logs `audio_transcription` to
  `ai_run_logs` exactly as before.
- **New `POST /api/meetings/[meetingId]/live-audio/analyze-buffer`**
  receives the client's buffered text, re-runs
  `detectMeaningfulSegment` server-side (skipped only when the client
  passes `force: true`), and — only if meaningful/forced — creates
  exactly one `transcript_segments` row via the existing
  `submitLiveAudioSegment` (unchanged signature) with a richer
  `transcription_metadata`: `source: "live_audio_continuous"`,
  `chunk_count`, `detection_reason`, `signal_terms`, `token_estimate`,
  `analyzed_from_buffer: true`, and `analysis_paused_at_creation`. Not
  truly idempotent (no stable buffer id/hash) — the client's in-flight
  flag is the only duplicate guard, documented as such rather than
  implied to be retry-safe.
- **Pause/resume, refined**: pausing no longer saves an unanalyzed
  segment per chunk (Sprint 11's behavior) — text just accumulates
  client-side while paused, with no auto-analyze call at all. Resuming
  immediately re-checks the buffer against the detection rules: analyzes
  automatically if meaningful, otherwise leaves it visible as pending for
  a manual "Analyze pending" click, which always works regardless of
  pause state.
- **`TranscriptionMetadata` type extended** (`lib/types/database.ts`) with
  the new fields above — additive only, Sprint 11's narrower shape is
  still valid for old rows. `supabase/migrations/0013_live_audio_v2_metadata.sql`
  is comment-only (the column was already nullable jsonb, no schema change).
- **HUD transcript list** (`HudShell.tsx`): a live-audio segment's
  "Live audio" badge now shows its `detection_reason` alongside it (e.g.
  `(process_statement_pattern)`), so it's visible at a glance why that
  particular buffer got analyzed — a cheap way to surface Part H's
  debug-ability requirement without new debug-page UI.
- **`/analyze-pending` is untouched** and still works, but the live-audio
  UI no longer calls it — Sprint 13's design rarely leaves an
  already-saved-but-unanalyzed segment sitting around the way Sprint 11's
  one-segment-per-chunk design could.

See `docs/live-audio-readiness.md`'s "Sprint 13 continuous-mode status"
section and its per-section "Sprint 13 reality" callouts for the full
detail, and `docs/progress.md` for QA notes (including which QA steps
were machine-verified via the API vs. still need a real
browser+microphone pass).

### Sprint 13.5 — UI Information Architecture Polish

UI copy and grouping only - no AI, backend, live-audio-route, or schema
changes. Renamed several user-facing labels for clarity (internal code
names, tables, and routes are unchanged): "Queued threads" is now **Still
to explore**, "Workflow" is now **Process so far**, "Open gaps" is now
**Still unclear**, ambiguity flags are now labeled **Needs
clarification**, contradiction candidates are now labeled **Possible
mismatches**, "Recent transcript" is now **Captured transcript**,
"Question directions" is now **Suggested directions**, and the Sprint 13
live-audio panel is now labeled **Live capture** throughout (buttons:
"Start/Stop live capture," "Analyze live text," "Clear unanalyzed
text"). The Live HUD is now visually split into a "Live mode" zone
(active focus, suggested directions, still to explore, live capture
status) above an "Investigation" zone (process so far, captured
transcript) via heading dividers, not a layout rewrite. See the Sprint
13.5 section of `docs/progress.md` for the full list and verification
notes.

### Sprint 14 — Export / Shareable Review v1

Makes meeting outputs usable outside the app: a copyable Markdown export
and a clean, print/screen-share-friendly page. No PDF generation, no
public unauthenticated sharing, no email sending, no auth - the share
page is just another app route (same access as every other meeting page
today, which has no auth at all), not a separately-secured public link.

- **Export builder** (`lib/services/meetingExportBuilder.ts`):
  `buildMeetingExport(meetingId)` assembles a display-safe
  `MeetingExportModel` from existing data - current workflow steps/
  components/gaps (`getWorkflowView`), open-only ambiguity flags and
  contradiction candidates (resolved/dismissed ones are filtered out,
  never shown as open), the latest post-meeting review if one exists
  (`getLatestPostMeetingReview`), and up to 6 deduplicated, length-capped
  evidence quotes. No raw ids/foreign keys anywhere in the returned
  shape. Returns `null` only if the meeting itself doesn't exist -
  everything else (no workflow yet, no review yet) degrades to an empty
  field, never an error or invented text.
- **Markdown generator** (`lib/services/meetingMarkdownExport.ts`):
  `buildMeetingMarkdown(model)` is a pure formatter producing the ten
  requested sections (Executive Summary through Notes on Certainty),
  each omitted entirely when empty. Terminology matches the Sprint 13.5
  UI relabeling: "possible mismatch" not "contradiction," "needs
  clarification" not "ambiguity flag," "still unclear" not "workflow
  gap," "process so far" not "workflow."
- **`GET /api/meetings/[meetingId]/export/markdown`**: returns
  `{ markdown, generatedAt }` as JSON. 404 for a missing meeting, 200
  with a gracefully degraded Markdown body when there's no post-meeting
  review yet.
- **Review page Export/Copy panel** (`app/meetings/[meetingId]/review/
  ExportPanel.tsx`): Copy full Markdown / executive summary / follow-up
  questions / still unclear / possible mismatches (section-specific
  buttons only appear when that section has content), a Download
  Markdown button (client-side Blob, filename
  `discoveryos-[meeting-slug]-review.md`), and a link to the share page.
  Uses `navigator.clipboard` when available; falls back to a selected,
  read-only `<textarea>` when it isn't (non-HTTPS, permission denied) -
  copying never dead-ends.
- **`/meetings/[meetingId]/share`**: a read-only, low-chrome page built
  straight from the same export model - no edit/verify/lock buttons, no
  live-capture controls, no debug links. Uses Tailwind's `print:` variant
  for print-friendly output (nav hidden, cards borderless when printed).
  This is an internal clean view for printing/copying/screen-sharing,
  **not a public or authenticated share link** - it has exactly the same
  access as any other meeting page in this no-auth prototype.
- **Dashboard**: one more plain-text link, "Share," alongside the
  existing Brief/Live HUD/Workflow/Review/Evaluate/Debug links - no new
  column or badge.

See `docs/progress.md` for the Sprint 14 verification note and known
limitations (no PDF, no public share links, no email, no auth/
permissions).

### Sprint 15 — Conversation State & Speaker Role Hardening v1

Adds a lightweight, conservative layer that tells facilitator intent
apart from stakeholder evidence, so a facilitator's own question or
hedged hypothesis ("maybe this is more of an X issue") is never treated
as a confirmed process fact by itself - only the stakeholder's own words
(an answer, confirmation, description of what actually happens, or
correction) can back a `known`/`inferred` workflow item. This is a
heuristic layer on top of the existing pipeline, not a new reasoning
path and not a replacement for the evidence-verified workflow extractor
or contradiction detector, both otherwise untouched.

- **`lib/ai/conversationStateAnalyzerService.ts`** - a new structured
  OpenAI call (`run_type: "conversation_state_analyzer"` in
  `ai_run_logs`, model configurable via
  `OPENAI_CONVERSATION_STATE_MODEL`), run fail-soft right before the
  fast loop on every meaningful transcript segment (manual or live
  capture - same shared pipeline, no separate reasoning path). It
  classifies recent utterances by likely speaker role and intent
  (facilitator question/hypothesis/focus-shift vs. stakeholder process
  fact/uncertainty/exception/confirmation/correction), extracts topic
  signals (with an explicit instruction to enumerate every distinct
  topic in a long segment, not just the last sentence), and tracks
  facilitator hypotheses separately from confirmed evidence.
- **`topic_signals` are the only path that creates/updates Still-to-
  explore threads** - deduplicated by exact-then-fuzzy title match
  against every existing thread, gap, ambiguity flag, and contradiction
  candidate, so it doesn't re-suggest an already-tracked topic.
  `facilitator_hypotheses` are recorded as `conversation_events` only
  and never directly create a thread by themselves. A high-priority
  signal (`should_focus_now`) only ever bumps a *queued* thread's
  priority and moves it to the front of the queue - the AI never
  reassigns which thread is `active`, so a facilitator's own focus lock
  (clicking a Still-to-explore item) is never yanked away.
- **New `conversation_events` table** (migration
  `0014_conversation_events.sql`) - an advisory, deduplicated log of
  what the analyzer noticed per segment, evidence-linked to the
  transcript segment when possible. Never a source for
  `workflow_steps`/`workflow_components`; no UI surfaces it directly
  yet, but it's queryable via `getConversationEventsForMeeting`.
- **`lib/services/fastLoopService.ts`** - gained an optional
  conversation-state context block (facilitator's latest question/
  hypothesis, stakeholder's latest answer, this segment's topic
  signals, mentioned-but-not-explored labels) so Suggested directions
  stay continuous with what's actually being discussed instead of
  jumping topics; the existing 3-direction/2-question cap already
  applied, unchanged.
- **`lib/services/workflowExtractorService.ts`** - one new prompt rule
  (next to the existing "tentative build direction is a hypothesis, not
  a fact" rule): a facilitator's own question or hedged hypothesis is
  never itself evidence, whether or not the transcript explicitly
  labels who's speaking. This is the actual mechanism that keeps
  facilitator hypotheses out of the review/export as confirmed facts,
  verified live (see `docs/progress.md`).
- **Evaluation rubric**: new "Conversation state / speaker role quality"
  category (`conversation_state_score`, migration-added nullable
  column, same pattern as Sprint 12's contradiction-quality column),
  scored on exactly the questions from the request (facilitator vs.
  stakeholder distinction, focus influence, hypothesis-vs-fact
  handling, multi-topic long answers, glossed-over topics staying
  tracked, no duplicate/noisy threads, directions following focus).
- **Scenario fixtures**: Support Escalation and Spreadsheet Reporting
  each gained one new mixed facilitator/stakeholder transcript chunk
  (purely additive - existing chunks/expectations untouched) plus
  `expectedSpeakerRoleNotes` for the evaluate page's scenario hints.
- **Small UI touch only**: the Live HUD's existing focus-lock badge now
  reads "🔒 Focused by you" when locked and a small muted "Suggested by
  DiscoveryOS" when not - everything else (Still-to-explore's
  `why_it_matters` line) already renders the new
  `"(From stakeholder mention)"` / `"(From your question)"` source tags
  for free, no new components.

See `docs/progress.md` for the Sprint 15 verification note - this one
includes real, live model-driven QA (not just code review), plus one
noted limitation: the `conversation_events` migration needs to be
applied before its own persistence/listing is confirmed end-to-end
(same DB-credential constraint Sprint 12 hit); everything else -
thread reconciliation, fast-loop context, the extractor's facilitator-
voice guardrail, export/review compatibility - was verified against
real meetings and real OpenAI calls in this session.

### Sprint 16 — Evaluation Regression Runner v1

A `/regression` page that runs a fixed set of **deterministic** checks
comparing a scenario-created meeting's *current* structured state
against that scenario's `expectedOutputs` (`lib/scenarios/*.ts`), and
saves the result. This is a repeatable QA helper, not an eval platform:
no LLM judge, no automated transcript replay, no batch runs across
scenarios - a facilitator (or this project's own QA process) picks one
already-populated scenario meeting and clicks "Run regression."

- **`lib/services/regressionRunner.ts`** - `runRegression(meetingId)`
  runs ten check groups with zero AI calls (every check is a plain
  string/data comparison): scenario metadata (has `scenario_id`, fixture
  resolves); expected workflow steps/actors/systems/gaps vs. current
  `workflow_steps`/`workflow_components`/open `workflow_gaps`; expected
  ambiguities/clarifications vs. open `ambiguity_flags`/
  `contradiction_candidates` (skipped entirely when the scenario has
  none); a conversation-state check (Sprint 15) that fails if a
  facilitator-only question/hypothesis excerpt matches a workflow item's
  `known`-evidence quote; always-on evidence-safety checks (every
  `known` item has a real quote, every contradiction-candidate quote is
  a verified transcript substring, no trivially-fake quotes); and
  always-on export-safety checks reusing Sprint 14's
  `buildMeetingExport`/`buildMeetingMarkdown` (no raw UUIDs, no
  resolved/dismissed item leaking back in as open, no leaked internal
  terminology). Matching is deliberately simple - case-insensitive
  substring plus a loose token-overlap fallback, never semantic/LLM
  matching.
- **Pass/warn/fail philosophy, exactly as specified**: a missing
  expected model output is always `warn`, never `fail` - the scenario
  fixtures describe a *target*, and `gpt-4o-mini` under-generating
  something is a known, expected, non-fabrication pattern already
  documented across many earlier sprints. `fail` is reserved for a
  safety/trust violation (a fake quote, a raw UUID leaking into export,
  a resolved item shown as open, a facilitator hypothesis promoted to a
  workflow fact) or the run itself crashing. Overall result rolls up
  simply: any `fail` → `fail`; else any `warn` → `warn`; else `pass`.
- **New tables** (migration `0016_regression_runner.sql`):
  `regression_runs` (one row per execution, with the standard
  `set_updated_at()` trigger this time - see Sprint 15's verification
  note for the table that didn't get one) and `regression_checks` (one
  row per individual check, category/label/expected/actual/result/
  notes). Additive only.
- **Routes**: `GET /api/regression/runs` (latest 20),
  `POST /api/regression/run` (body `{ meetingId }` - a meeting with no
  `scenario_id` still returns a saved run, just with its first check
  failing, not a request error), `GET /api/regression/runs/[runId]`.
- **`/regression` page**: meeting picker (only scenario-created
  meetings), scenario name, "Run regression," a result panel
  (pass/warn/fail badge + counts + summary), a checks table, a "Recent
  runs" list with a "View" button per saved run, and the same six
  per-meeting links (Live HUD/Workflow/Review/Share/Evaluate/Debug)
  used elsewhere. Reachable from the top nav (`app/Nav.tsx`).
- **v1 limitations, explicitly**: evaluates existing scenario-created
  meetings only - it never submits transcript chunks or drives a
  meeting itself; no automated scenario replay; no batch run across all
  scenarios; no LLM-as-judge; deterministic checks only, so matching is
  intentionally approximate rather than semantic.

See `docs/progress.md` for the Sprint 16 verification note.

### Sprint 17 — Automated Scenario Replay v1

Sprint 16 could only check a meeting that already had scenario data in
it - a facilitator still had to manually create the meeting, paste every
chunk, and generate the review first. Sprint 17 automates *creating*
that meeting: given a scenario id, it drives a fresh meeting through the
**exact same app pipeline a human uses** - no mocking, no direct writes
to workflow/process tables, no new reasoning path.

- **`lib/services/scenarioReplayRunner.ts`** - `replayScenario(scenarioId,
  { generateReview? })` creates a meeting from the scenario's
  `meetingSetup` (the same field mapping `app/meetings/new/page.tsx`'s
  own scenario loader uses, including confidence defaulting to
  "unclear" for every loaded assumption), best-effort generates the
  pre-meeting brief, starts the meeting, then submits every transcript
  chunk **sequentially** through `submitTranscriptChunk` - the identical
  function manual transcript entry already uses, so each chunk becomes a
  normal `source_type: "manual"` segment and the full
  fast-loop/workflow-extractor/contradiction-detector/conversation-state
  pipeline is awaited before the next chunk submits. Optionally
  generates the post-meeting review, then runs Sprint 16's
  `runRegression` unchanged.
- **New table** (migration `0017_scenario_replay_runs.sql`): one row per
  replay attempt, created immediately (before the meeting even exists)
  so every attempt is visible, updated as it progresses
  (`chunks_submitted` ticks up after each chunk), and marked `failed`
  with the real error message - never silently dropped - if anything
  breaks partway through. Only an unrecognized `scenarioId` skips
  creating a row at all (there's nothing to attach it to).
- **Routes**: `POST /api/regression/replay-scenario` (body
  `{ scenarioId, generateReview? }`, synchronous per this sprint's own
  v1 guidance - a full replay makes many real sequential OpenAI calls
  and can take a couple of minutes, which is expected for a local QA
  tool) and `GET /api/regression/replay-runs`.
- **`/regression` page**: a new "Replay scenario" section next to the
  existing Sprint 16 flow (which is otherwise untouched) - scenario
  picker, a "Generate review after replay" checkbox, the button, and
  the two required helper lines ("Scenario replay creates a fresh
  meeting and runs real AI calls for each transcript chunk." / "Use
  this for QA, not during live meetings."). A completed replay's
  regression result renders in the same shared result panel/Recent-runs
  list the existing flow already uses, so the two are connected for
  free rather than duplicated. Replaying a scenario with more than 5
  chunks (Support Escalation and Spreadsheet Reporting both cross this
  now, since Sprint 15 added a 6th chunk to each) asks for confirmation
  first.
- **v1 limitations, explicitly**: one scenario at a time, no batch
  runner; synchronous/local-first, no background job queue; no
  LLM-as-judge; no live-audio replay - every chunk is submitted as a
  manual-entry-style transcript segment, never through the live-capture
  buffering path.

See `docs/progress.md` for the Sprint 17 verification note.

### Sprint 18 — Real Meeting Pilot Checklist + Usage Hardening v1

Every prior sprint built discovery/AI capability. Sprint 18 adds none of
that — it's a **usage-hardening** sprint, making DiscoveryOS safer and
more deliberate to run in a real meeting instead of a scenario/demo. No
new AI reasoning, no changes to the live audio pipeline or core prompts.

- **New table** (migration `0018_pilot_readiness.sql`): `meeting_pilot_notes`,
  one row per meeting (unique index on `meeting_id`), created lazily on
  first save. Tracks `pilot_mode`, `consent_confirmed` + `consent_note`,
  `recording_mode` (`manual_transcript` / `browser_mic` / `mixed` / `none`,
  check-constrained), `known_limitations_acknowledged`,
  `pre_meeting_checklist` / `post_meeting_checklist` (jsonb), free-text
  `pilot_notes`, `issues_observed`, `followup_actions`, and the standard
  `set_updated_at()` trigger. Additive only — every existing meeting is
  unaffected until a facilitator opts in.
- **`lib/services/pilotReadiness.ts`** — `getPilotReadiness(meetingId)`
  (row-or-defaults, never null, matching the shape convention used
  elsewhere in the app), `upsertPilotReadiness(meetingId, payload)`
  (creates or updates, partial-field-safe), `markConsentConfirmed`,
  `updatePilotChecklist`, `updatePilotNotes`.
- **Routes**: `GET`/`POST /api/meetings/[meetingId]/pilot-readiness` — GET
  always returns a value (defaults if nothing saved yet), POST upserts
  whatever subset of fields is provided and 404s cleanly on an unknown
  `meetingId`.
- **Brief page**: a "Pilot readiness" panel behind a "Pilot mode" toggle -
  recording mode picker, the required consent/disclosure copy plus a
  "Consent confirmed" checkbox, a known-limitations acknowledgment, a
  4-item pre-meeting checklist, and a free-text pilot-notes box. Off by
  default and collapsed to just the toggle when pilot mode is off, so it
  doesn't clutter scenario/demo use.
- **Live HUD**: a compact, always-visible pilot status strip (consent
  confirmed/not, known limitations acknowledged/not, recording mode, an
  "Edit" link back to the brief page) - refreshes for free on the HUD's
  existing 4-second poll since it now rides along on `hud-state`.
- **Review page**: an internal-only "Pilot readiness" section - an
  8-item post-meeting checklist, "Issues observed" and "Follow-up
  actions" text areas (Part G's lightweight issue log - explicitly not a
  full issue tracker), and a read-only summary of the pre-meeting consent/
  recording-mode state for context.
- **Meeting mode badges** (`MeetingModeBadges.tsx`, shared across Brief/
  Live/Review headers): a purple "Scenario meeting" badge when
  `scenario_id` is set, a blue "Pilot meeting" badge when `pilot_mode` is
  true, and a small warning line if somehow both are true on the same
  meeting.
- **Export/share isolation, by construction**: `meetingExportBuilder.ts`
  and the `/share` page never import `pilotReadiness.ts` - pilot notes
  physically cannot leak into export/share output because nothing in that
  code path can reach the table. The only place pilot notes render is the
  Review page's internal section.
- **`docs/real-meeting-pilot-guide.md`** (new): a 13-section practical
  operating guide - when (not) to use DiscoveryOS for a real meeting,
  consent/disclosure guidance, live-meeting rhythm, how to use Still to
  explore/Focus and Live Capture safely, when to pause, how to review
  evidence, how to export/share, known limitations, and a pilot feedback
  checklist.
- **Explicitly out of scope this sprint** (per the sprint brief): no auth,
  no public sharing beyond the existing print/share page, no third-party
  integrations, no Zoom/Teams/system-audio capture, no PDF export, no
  batch regression, no LLM-as-judge, no core-prompt changes, no live-audio
  pipeline changes, no weakening of evidence validation.

See `docs/progress.md` for the Sprint 18 verification note, including the
same recurring local-environment migration-application constraint noted
in Sprints 12/15/16/17.

### Sprint 19 — Real Meeting Pilot Feedback Dashboard v1

Sprint 18 made pilot readiness/notes recordable per meeting. Sprint 19
adds a way to actually *see* that data across meetings - a `/pilot`
dashboard for reviewing real pilot usage: which meetings are ready,
which have issues, which have open follow-ups. **No new table, no
migration** - this sprint reads the existing `meeting_pilot_notes` from
Sprint 18 and derives everything else. A product-learning view, not an
analytics suite: plain counts and a table, no charts, no LLM
summarization, no sentiment analysis.

- **`lib/services/pilotDashboard.ts`** - `getPilotDashboardData()` loads
  every `meeting_pilot_notes` row with `pilot_mode = true`, batch-fetches
  the corresponding meetings (one query, not N+1 - same pattern as
  `getLatestEvaluationScores`), and derives per-meeting
  `readinessStatus` (`ready` / `incomplete` / `missing_consent` /
  `missing_limitations`, checked in that priority order) and
  `postMeetingStatus` (`complete` / `incomplete` / `not_started`) from
  the pre/post checklist JSON against Sprint 18's fixed checklist-item
  lists (4 pre-meeting items, 8 post-meeting items). Latest evaluation
  score and regression result are optional, best-effort extras - each
  wrapped so a failure there can never block pilot data from loading.
- **`lib/pilotIssueCategories.ts`** - deterministic keyword matching
  (`categorizeIssueText`) sorts `issues_observed` text into chips (live
  capture, suggested directions, still to explore, process extraction,
  evidence quality, review/export, UI confusion, performance, other) -
  explicitly no AI, can match more than one category, empty text yields
  no chips, unmatched text yields "other."
- **`/pilot` page** ("Pilot Feedback"): six summary cards (pilot
  meetings, ready meetings, meetings with issues, open follow-ups, avg
  pre-/post-checklist completion), a filter bar (all / has issues / has
  follow-ups / missing consent / incomplete post-meeting checklist, plus
  an independent recording-mode filter, all client-side over the
  already-loaded list), a meetings table (recording mode, consent,
  limitations, pre-/post-checklist counts with status badges, issue
  category chips, follow-up indicator, updated date, and the same
  Brief/Live HUD/Review/Share/Evaluate/Debug links used elsewhere), and
  "Issues observed"/"Open follow-up actions" sections that surface the
  free-text fields with truncated previews and a link back to Review.
  Empty states for zero pilot meetings, zero issues, and zero follow-ups.
- **Navigation**: a "Pilot" link in the top nav, plus an optional
  low-key "View pilot feedback →" link on the main dashboard (no per-row
  badge added to the dashboard table itself - fetching pilot state for
  every listed meeting there was judged not worth the added query cost
  for a nice-to-have).
- **Review page**: `issues_observed`/`followup_actions` textareas
  (Sprint 18) now show a one-line categorization example plus a link to
  the new dashboard, so a facilitator can see where the text ends up. No
  behavior change to saving.
- **Internal-only, by the same construction as Sprint 18**: `/pilot`
  reads directly from `meeting_pilot_notes` and nothing in
  `meetingExportBuilder.ts`/`meetingMarkdownExport.ts`/the `/share` page
  imports it - pilot data still cannot reach export/share output.
- **Explicitly out of scope this sprint**: no charts beyond the plain
  count cards, no LLM summarization of issues, no sentiment analysis, no
  auth, no public sharing, no integrations, no changes to live audio
  behavior, AI prompts, or export behavior.

See `docs/progress.md` for the Sprint 19 verification note.

### Sprint 20 — Real Pilot Issue Resolution Tracking v1

Sprint 18 gave pilot meetings a raw `issues_observed` free-text field.
Sprint 19 made that text scannable across meetings on `/pilot`. Neither
let a facilitator mark an issue *done*. Sprint 20 adds a small, explicit
open → resolved/dismissed lifecycle for pilot feedback - deliberately not
a ticketing system: no assignments, due dates, comments, labels,
attachments, or workflows beyond that one status field plus severity.

- **Raw notes vs. tracked issues, kept distinct on purpose**:
  `meeting_pilot_notes.issues_observed` (Sprint 18) stays exactly what it
  was - free-text, meeting-level, never deleted or replaced. A **tracked
  pilot issue** (new `pilot_issues` table) is a separate, deliberate,
  user-created record with a title, optional description, category,
  severity, and status. Nothing auto-creates a tracked issue from
  `issues_observed` text - the Review page's "Create tracked issue" form
  can optionally prefill its description from that text and default a
  category from Sprint 19's `categorizeIssueText`, but only when the
  facilitator clicks "Prefill" and then "Create issue" themselves.
- **New table** (migration `0020_pilot_issues.sql`): `pilot_issues` -
  `meeting_id` (cascades on meeting delete), optional
  `source_pilot_note_id` (soft link to the `meeting_pilot_notes` row it
  was raised from, `on delete set null`), `title`, `description`,
  `category` (the same 9 values as Sprint 19's `IssueCategory`, check-
  constrained), `severity` (`low`/`medium`/`high`/`critical`), `status`
  (`open`/`resolved`/`dismissed`), `resolution_note`, and `resolved_at`.
  Standard `set_updated_at()` trigger. Additive only.
- **`lib/services/pilotIssues.ts`** - `createPilotIssue`,
  `listPilotIssuesForMeeting`, `listPilotIssues(filters?)`,
  `updatePilotIssue` (generic partial update - setting `status:
  "resolved"` stamps `resolved_at`, setting `status: "open"` clears it),
  `markPilotIssueResolved`/`dismissPilotIssue`/`reopenPilotIssue`
  (thin wrappers over `updatePilotIssue`), `deletePilotIssue`
  (cleanup/testing only, not exposed in the UI).
- **Routes**: `GET`/`POST /api/pilot/issues` (GET takes optional
  `status`/`category`/`severity`/`meetingId` query filters), `PATCH
  /api/pilot/issues/[issueId]`, plus convenience `POST .../resolve`,
  `.../dismiss`, `.../reopen`.
- **Review page**: a new "Tracked pilot issues" section below the
  existing pilot notes panel - a small create form (title, description,
  category, severity, with a "Prefill from issues observed" shortcut),
  and a list of existing issues (open ones first) with inline
  Resolve/Dismiss (each with an optional resolution-note field),
  Reopen for closed issues, and a lightweight inline Edit.
- **`/pilot` dashboard**: four new summary cards (open tracked issues,
  high/critical open issues, resolved issues, meetings with open
  issues), a new "Tracked pilot issues" table (issue/meeting/category/
  severity/status/updated/links) with its own status/category/severity
  filters, and a deterministic "recurring issues" chip list (e.g. "Live
  capture: 3 open (1 high/critical)") computed from whatever the current
  filters show - no AI, no charts. The existing "Issues observed" (raw
  text) and "Open follow-ups" sections are unchanged and still present.
- **Export/share isolation, by the same construction as Sprints 18/19**:
  nothing in `meetingExportBuilder.ts`, `meetingMarkdownExport.ts`, or
  the `/share` page imports `pilotIssues.ts` or references `pilot_issues`
  - tracked issue content cannot reach export/share output.
- **Explicitly out of scope this sprint**: no full ticketing system, no
  assignments/due dates/comments/labels/attachments/sprints/workflows, no
  integrations, no auth, no AI summarization or LLM issue extraction, no
  changes to live audio behavior, AI prompts, or export/share behavior.

See `docs/progress.md` for the Sprint 20 verification note.

### Sprint 21 — UI Information Architecture Polish v2

Twenty sprints of features, no matching pass on how they fit together.
Sprint 21 is navigation, hierarchy, and copy only - **no new features, no
AI behavior changes, no schema changes**. The goal: a user can tell where
to prepare, run, review, evaluate, and improve a meeting without the app
reading as a pile of unrelated screens.

**Five product areas**, reflected in copy and structure rather than a new
top-level nav (meetings move through these in order, they aren't
separate destinations):

- **Prepare** - Dashboard, New Meeting, Brief, Pilot Readiness.
- **Run** - Live, Live Capture, Manual Transcript, Still to Explore,
  Suggested Directions, Process so far.
- **Review** - Meeting Review, Process so far, Evidence, Needs
  clarification, Possible mismatches, Export, Share.
- **Improve** - Evaluate, Regression, Scenario Replay, Pilot Feedback,
  Tracked Pilot Issues.
- **Inspect** - Debug, AI run logs, raw state.

**What changed**:

- **Global nav simplified** (`app/Nav.tsx`) to exactly `Dashboard · New
  Meeting · Pilot · Regression`, each with a one-word hover hint
  ("All meetings" / "Real-use feedback" / "Scenario QA"). The old copy
  duplicated the full Brief/Live/Workflow/Review/Evaluate/Debug tab set
  in the global bar on every meeting page - that set now lives in one
  place.
- **New shared `MeetingHeader`** (`app/meetings/[meetingId]/
  MeetingHeader.tsx`), used by Brief, Live, Workflow, Review, and
  Evaluate: same name/badges/type/strategy/status treatment, same tab
  order, every time, plus a one-sentence purpose line per page. Status
  badges are now colored consistently everywhere (green for live, blue
  for completed, neutral otherwise) instead of only the Live page having
  color. Debug is reachable from the same nav bar but stays visually
  secondary - muted, pushed to the far side, never bold even when
  active - and keeps its own distinct dev-tool-styled page header, since
  making it blend in with the primary tabs would undercut "available but
  secondary." Share deliberately does **not** use `MeetingHeader` - it's
  meant to read as a clean external document, not an app screen with
  internal navigation.
- **Purpose lines added** to Dashboard, New Meeting, Brief, Live,
  Workflow, Review, Evaluate, Debug, Regression, and Pilot - one
  practical sentence each, no marketing language, no claim that AI
  output is ground truth.
- **Review page reordered**: review generation/summary, then export/
  share, then a visually separated "Internal only" zone (pilot
  checklist + tracked issues) with explicit copy - "Internal pilot notes
  are not included in shared or exported output." Nothing about what's
  saved or how changed, only the order and the visual boundary.
- **Pilot page reordered**: summary cards → tracked issues (now
  defaulting to the "Open" filter, so it reads as "open tracked issues"
  without hiding resolved/dismissed, which stay one click away) → a new
  "Meetings needing attention" section (a curated, compact list - missing
  consent/limitations, incomplete checklists, open issues/follow-ups -
  not another full table) → raw issues observed → open follow-ups → the
  full "All pilot meetings" table, now last instead of first.
- **Regression page reordered**: Replay scenario now comes before "Run
  regression on existing meeting" (replay is the more complete flow -
  creates its own meeting - so it leads), plus explicit copy on warn vs.
  fail ("Warn means an expected output was missing or weak - often
  normal model variance. Fail means a real safety/trust/app issue") and
  a corrected, no-longer-stale purpose line (the old copy still said "no
  automated transcript replay," which stopped being true in Sprint 17).
- **Label consistency audit**: a repo-wide sweep found the app was
  already disciplined about avoiding internal jargon in user-facing
  copy from prior sprints ("Needs clarification," "Possible mismatches,"
  "Process so far" were already correct everywhere) - the fixes that
  were needed were small: "Live HUD" → "Live" in a handful of leftover
  spots, and a couple of "gap" references in the Live page's derived
  summary line/empty states reworded to "still-unclear point" to match
  the "Still unclear" section they describe.
- **Empty-state copy** aligned to consistent, practical wording across
  Live, Workflow, and Regression (e.g. "Add a transcript segment or use
  live capture to generate suggested directions," "Process details will
  appear after the conversation reveals workflow steps").
- **Duplicate links removed**: every meeting page's own ad hoc "← Back to
  brief" / "Go to live HUD" style link row is gone, replaced by
  `MeetingHeader`'s single consistent tab set (Dashboard is already
  always one click away in the global nav, so it no longer needs
  repeating on every page too).

**Explicitly unchanged**: AI prompts, transcript/live audio behavior,
database schema (no migration this sprint), export/share behavior and
isolation, evidence validation, and every existing save/create/resolve/
dismiss/reopen action - this sprint touched presentation only.

See `docs/progress.md` for the Sprint 21 verification note.

### Sprint 22 — Batch Regression Runs v1

Sprint 16 could check one already-populated scenario meeting. Sprint 17
automated creating that meeting, but still one scenario at a time. Sprint
22 adds a **batch** flow that runs several (or all) scenario fixtures
back-to-back and aggregates the result - it does not add a new reasoning
path: every scenario in a batch runs through the exact same
`replayScenario` (Sprint 17) and `runRegression` (Sprint 16) functions a
single replay already uses. No LLM judge, no prompt tuning, no charts.

- **New tables** (migration `0022_batch_regression_runs.sql`):
  `batch_regression_runs` (one row per "run these scenarios" click -
  status `running`/`completed`/`partial`/`failed`, aggregate scenario/
  completed/failed counts and pass/warn/fail totals) and
  `batch_regression_run_items` (one row per scenario within the batch,
  linking to the real `scenario_replay_runs`/`meetings`/`regression_runs`
  rows that scenario's replay produced). Both additive, standard
  `set_updated_at()` triggers, cascades items on batch delete.
- **`lib/services/batchRegressionRunner.ts`** - `runBatchRegression({
  scenarioIds?, generateReview?, stopOnFailure? })` creates the parent
  row and one item per scenario immediately (so a batch is visible and
  inspectable from the first moment, not just after it finishes), then
  runs scenarios **sequentially** (never parallel - v1 scope, avoids
  hammering the OpenAI API/database with concurrent real calls) by
  calling `replayScenario` unchanged for each one. An item's `failed`
  status means the replay pipeline itself broke (couldn't create the
  meeting, a chunk submission threw, regression itself errored) - never
  that the regression's own checks came back `fail`. A completed replay
  whose regression has fail checks in it is still a `completed` item;
  those fail counts simply flow into the batch's aggregate totals, same
  as `warn`/`pass`. With `stopOnFailure: true`, remaining scenarios stay
  `pending` and the batch ends `failed`; with it `false` (the default),
  the batch keeps going through every scenario and ends `partial` if
  anything failed, `completed` if nothing did.
- **Routes**: `POST /api/regression/batch-runs` (body `{ scenarioIds?,
  generateReview?, stopOnFailure? }` - omitting `scenarioIds` runs every
  fixture; synchronous, same v1 reasoning as `replay-scenario` - a full
  six-scenario batch makes many real sequential OpenAI calls and can take
  several minutes, expected for a local QA tool), `GET
  /api/regression/batch-runs` (recent batches), `GET
  /api/regression/batch-runs/[batchRunId]` (one batch + its items).
- **`/regression` page**: a new "Batch regression" section, now first
  (ahead of single-scenario replay and existing-meeting regression) -
  an all/none scenario checklist (defaults to all selected), "Generate
  review after replay" and "Stop on first failure" checkboxes (the
  latter defaulting off, per the sprint brief), a confirmation dialog
  before kicking off real AI calls (mirroring the existing single-replay
  confirm, scaled to the batch's total chunk count), and a result table
  per scenario (status/checks/pass/warn/fail/Meeting/Regression/Debug
  links). "Regression" reuses the existing single-run viewer (`View` →
  populates the same "Latest result" panel every other flow already
  uses) rather than inventing a second results UI. A new "Recent batch
  runs" section closes out the page. Existing single-scenario replay and
  existing-meeting regression are otherwise unchanged, just reordered
  (see Sprint 21's own reordering note).
- **v1 limitations, explicitly**: sequential only, no parallel execution;
  synchronous/local-first, no background job queue, never runs
  automatically on app startup; no LLM-as-judge; no charts or trend
  history across batches (that's a candidate for a future "Regression
  Trend History v2"); scenario expected outputs are unchanged from
  Sprint 9/10's fixtures unless a real fixture bug was found and
  documented (none was, this sprint).

See `docs/progress.md` for the Sprint 22 verification note.

### Sprint 23 — Evidence Quality Hardening v1

Sprint 22's own batch regression run surfaced a real finding: a workflow
component ("Support agent") persisted as `evidence_type: "known"` with
`source_quote: "support agent"` - a real, non-fabricated substring of the
transcript, but useless as evidence, since it was just an echo of the
item's own label. **A real quote is not automatically good evidence.**
Sprint 23 closes that gap deterministically - no LLM-as-judge, no prompt
rewrite as the primary fix, just validation.

- **`lib/evidence/evidenceQuality.ts`** (new) - `assessEvidenceQuality()`,
  pure deterministic string/token checks, no AI, no network calls. Scores
  a quote against the claim it's supposed to support: real transcript
  substring (fake/unverifiable = fail), not trivially short unless it
  contains a specific noun/system/metric ("Salesforce", "Legal", "$500"),
  not generic filler ("yes", "it depends", "someone handles it"), not a
  bare echo of the item's own label, some topical overlap with the claim
  for medium-length quotes, and (when facilitator excerpts are available)
  never a facilitator's own question/hypothesis passed off as confirmed
  stakeholder evidence. Thresholds scale by `evidence_type`: `known` is
  strict, `inferred` tolerates a real-but-weak quote, `unknown` (gaps)
  only rejects outright fabrication. 31 scriptable assertions (`npx tsx
  lib/evidence/evidenceQuality.selftest.ts`) cover the real Sprint 22
  case plus every pass/fail example from the sprint brief - no test
  framework dependency added.
- **Persistence hardening** (`lib/services/workflowExtractorService.ts`):
  every AI-proposed step/component/gap now runs through this gate before
  `reconcileWorkflowSteps`/`Components`/`Gaps` ever see it. A `known`
  draft that doesn't pass is downgraded to `inferred` (the item is kept,
  never silently dropped) with the reason appended to
  `confidence_reason`; an untrustworthy quote (fake/unverifiable/
  facilitator-sourced) is stripped entirely, a real-but-weak one is kept
  for context. Gaps never have their `evidence_type` touched - only a
  fabricated quote gets stripped. Human-verified/locked rows are
  unaffected - the existing `pickEvidence`/`protectsHumanText` precedence
  in `workflows.ts` was untouched, and downgrading a draft to `inferred`
  *before* it reaches that precedence check means it can no longer
  outrank a human-protected item's existing evidence anyway. Every
  downgrade/drop is logged to `ai_run_logs.output.evidenceQualityDowngrades`,
  visible on the existing Debug page - no new UI needed.
- **Regression evidence-safety checks updated** to use the same shared
  helper (`lib/services/regressionRunner.ts`): the old crude "quote
  length < 5 or identical to label" rule is replaced by the full
  deterministic assessment, plus two new checks - inferred-evidence
  quotes only fail if fabricated (a weak-but-real one just warns), gap
  quotes only warn (never fail) on fabrication, since a gap never claims
  something is confirmed. Possible-mismatch (contradiction candidate)
  quote hardening from Sprint 12.1 was reviewed and left untouched - it
  already silently discards a fabricated candidate before saving.
- **A small, targeted prompt addition** (not a rewrite): the workflow
  extractor's evidence rules now explicitly tell the model not to quote
  generic confirmations or a component's own name back at itself, and to
  quote the surrounding description instead - e.g. for an actor labeled
  "Support agent", quote what they actually do, not just "support agent".
  Verified this measurably reduced how often the deterministic gate had
  to intervene, but the gate remains the enforced backstop either way -
  the model ignoring the hint can never result in a weak quote persisting
  as "known".
- **Verified against real data, not just unit tests**: a fresh single
  replay of the exact scenario that produced Sprint 22's fail, and a
  fresh 3-scenario batch including it, both came back with **zero**
  evidence-safety fails and healthy known-evidence counts - the same
  weak "Support agent" quote does not reproduce (the model now cites a
  full descriptive sentence on its own), and a genuinely new, different
  weak-evidence case (a "known" claim with no citable segment at all)
  was caught and correctly downgraded in the same run, something the
  pre-Sprint-23 regression check never even checked for workflow items.

See `docs/progress.md` for the Sprint 23 investigation notes and
verification results.

### Sprint 24 — Regression Result Review UX v1

A regression run has always computed the right pass/warn/fail answer -
what it never had was a way for a human to *read* the answer. A run with
13 warnings and 1 fail looked exactly as intimidating as a run with 1
fail and no warnings, because everything was one flat table, warn and
fail were indistinguishable at a glance, and raw category strings
("Process so far - steps", "People & systems - actors") required already
knowing the codebase to interpret. This sprint is **review UX only** -
no regression semantics changed, no failures hidden, no AI judgment
added.

- **`lib/services/regressionReviewClassify.ts`** (new, pure, no DB/AI) -
  `classifyRegressionCheck()` maps a raw check's `category` to a
  `reviewGroup` (one of 10 human-meaning buckets: Trust and evidence,
  Missing expected discovery output, Workflow structure, People and
  systems, Conversation state, Needs clarification / mismatches, Export/
  share safety, Scenario metadata, App/pipeline health, Other), a plain-
  language `likelyMeaning`, and a `suggestedInspectionTarget` (Workflow/
  Review/Share/Evaluate/Debug page to jump to). Severity (`info`/
  `warning`/`critical`) is a direct, unmodified reflection of the
  persisted pass/warn/fail result - this function only adds presentation
  metadata, never reinterprets the underlying check. `groupRegressionChecks()`
  groups and sorts (fail before warn before pass) in a fixed, canonical
  order. Also translates evidence-quality reason text (Sprint 23) into
  short plain-language sentences - e.g. "Quote only echoed the item's own
  label, not new information" instead of a raw reason code - falling back
  to showing the original notes untouched for older runs that predate
  reason codes.
- **`lib/services/regressionReview.ts`** (new, server-only) -
  `buildSingleRegressionReview(regressionRunId)` and
  `buildBatchRegressionReview(batchRunId)` turn a saved run into a
  review-ready model (classified/grouped checks, resolved meeting/
  scenario names, a per-scenario "main concern" for batches, and a
  batch-wide aggregate group summary). Read-only - never writes to
  `regression_runs`/`regression_checks`/`batch_regression_run_items`.
  Handles a deleted linked meeting and a batch item with no regression
  run yet (pending, or pipeline failed before reaching regression)
  gracefully instead of throwing.
- **`app/regression/SingleRunReview.tsx`** / **`BatchRunReview.tsx`** (new,
  shared client components) - summary strip/batch summary up top, a
  "Needs attention" section grouped by meaning (fail before warn, each
  card showing check/expected/actual/likely meaning/friendly evidence
  notes/an inspection link to the relevant meeting page), a collapsed
  passed-checks count that never crowds out real issues, and filter
  controls (Show: all/needs attention/fails only/warnings only/passes
  only; Group: by meaning or by original category). The original flat
  table is still available behind a "Show raw table" toggle. Batch adds
  its own scenario filter (all/needs attention/with failures/with
  warnings/pipeline failed/clean) and a batch-wide grouped summary
  ("Trust and evidence: 2 fail, 1 warn", ...) so a facilitator doesn't
  have to add up every scenario card by hand. Both components are reused
  by `/regression`'s inline "just ran it" result panel and by the new
  detail pages below - one implementation, not two.
- **`/regression/runs/[regressionRunId]`** and
  **`/regression/batch-runs/[batchRunId]`** (new detail pages) - every
  "View" link on `/regression`'s Recent runs / Recent batch runs lists
  now navigates here instead of loading inline, so a saved run is
  directly linkable and readable without rerunning anything. A deleted
  run/batch id renders a clean "doesn't exist" state instead of an error
  page.
- **Explanatory copy, not just data**: every review view states plainly
  that warnings usually mean an expected scenario detail was missing,
  weak, or incomplete, that failures mean a trust/evidence/export-safety/
  app-pipeline rule broke, and that a "completed" run/scenario status
  means the pipeline ran end-to-end - it does not mean every check
  passed.
- **Small, in-scope enrichment**: `checkEvidenceSafety` in
  `lib/services/regressionRunner.ts` now writes the evidence-quality
  helper's actual reason codes/text into a check's `notes` (previously
  only the affected item's label was recorded) - notes-formatting only,
  does not touch any check's category/label/expected/actual/result. This
  is what gives the new friendly-reason translation real content to work
  with for checks created from this sprint onward; older saved runs
  simply show their original notes as-is (Part H compatibility).

See `docs/progress.md` for the review-grouping model and QA results.

### Sprint 25 — Applied AI Opportunity Discovery Mode v1

Every prior sprint helped a facilitator run discovery and produce a
review. None of it was built to answer one specific, recurring question:
*is this workflow actually a good candidate for AI, or does it need
something else entirely?* Sprint 25 adds an **Applied AI Discovery**
meeting mode that exists to answer that question honestly - it supports
internal AI Labs work, freelance discovery calls, applied AI consulting,
and general process-improvement interviews equally, and it never assumes
AI is the right answer. See
[docs/applied-ai-discovery-playbook.md](docs/applied-ai-discovery-playbook.md)
for the full practical guide.

- **New meeting type** - `applied_ai_discovery` (label "Applied AI
  Discovery") joins the existing six `meeting_type` values (additive
  Postgres enum value, `0023_applied_ai_discovery.sql` - every existing
  meeting type and scenario is unaffected). Selectable from `/meetings/new`
  exactly like any other type.
- **`lib/lenses/appliedAiOpportunityLens.ts`** (new, pure config, no AI/DB
  calls) - the shared Applied AI opportunity lens: 11 discovery dimensions
  (workflow pain, task/intervention type, current process shape, data
  readiness, rule clarity, human review need, risk and constraints,
  integration/implementation surface, success metric, smallest useful
  experiment, recommendation type) and the 7 recommendation types (`ai_
  assist`, `rules_automation`, `workflow_redesign`, `reporting_
  visibility`, `human_process_change`, `not_ready`, `no_build`) with their
  labels/descriptions. Reused by the Setup Analyst, the fast-loop
  suggested-directions prompt, and the post-meeting assessment below, so
  the three can never quietly drift apart on what "good AI-opportunity
  evidence" means.
- **Setup Analyst enhancement** (`lib/services/setupAnalystService.ts`) -
  for `applied_ai_discovery` meetings only, the initial-queue lens
  coverage mechanism (previously automation_discovery-only) now also
  guarantees all 9 relevant lens dimensions get a starting discovery
  thread, and the model additionally populates a new `applied_ai_brief`
  field: suspected workflow pain, likely task/intervention type,
  data-readiness/risk-constraint/human-review/implementation-readiness
  questions, a smallest-useful-experiment hypothesis, and an explicit
  no-build/not-ready risk statement (`0024_applied_ai_brief.sql` adds the
  nullable `pre_meeting_briefs.applied_ai_brief` column - null for every
  other meeting type and every pre-existing brief). Every non-applied-AI
  brief is completely unaffected. Rendered on the Brief page as an
  "Applied AI Discovery prep" section.
- **Fast-loop suggested directions** (`lib/services/fastLoopService.ts`) -
  a new prompt section, scoped to `meeting_type: "applied_ai_discovery"`,
  prioritizes workflow pain, exception handling, decision rules, data
  availability, human review, risk/compliance/security/privacy,
  integration/system boundaries, success metrics, the smallest safe test,
  implementation ownership, and explicitly whether AI is even needed.
  General discovery mode's directions are unaffected; the existing 1-3
  direction / 1-2 question limits are unchanged.
- **`lib/services/appliedAiOpportunityAssessment.ts`** (new, server-only) -
  `generateAppliedAiOpportunityAssessment(meetingId)` produces a cautious,
  evidence-grounded recommendation (type, confidence, reasoning,
  supporting evidence with quotes, risks, missing information, a smallest
  useful experiment, suggested next questions, success metric candidates)
  grounded in the meeting's actual workflow model, open gaps/clarification
  items, and transcript - never a fabricated ROI/feasibility number, and
  `not_ready`/`no_build` are first-class, complete answers. Persisted via
  the existing `ai_run_logs` table (`run_type:
  "applied_ai_opportunity_assessment"`) rather than a new dedicated table -
  this is lightweight working guidance, not a structured, editable model.
  `getLatestAppliedAiOpportunityAssessment(meetingId)` reads it back.
- **Review page section** - for `applied_ai_discovery` meetings, a new
  "Applied AI opportunity assessment" card (with its own "Generate
  Applied AI assessment" / "Regenerate" button) shows the recommendation,
  confidence, reasoning, supporting evidence, risks, missing information,
  smallest useful experiment, suggested next questions, and success
  metric candidates - plus a **Copy summary** button that builds a
  9-section internal/client-friendly opportunity summary from the
  assessment (no extra AI call). Neither the assessment section nor the
  copyable summary is included in Share or Export by default.
- **New scenario fixture** - **Applied AI Intake Triage Demo**
  (`applied-ai-intake-triage`, `lib/scenarios/appliedAiIntakeTriage.ts`) -
  request intake triage across email/web form/spreadsheet with rule-based
  routing and department/customer-impact/compliance exceptions.
  Deliberately built so its tentative build direction (AI-assisted triage
  and completeness-checking, human sign-off retained) comes back
  `partially_supported` rather than `needs_reframing` - the counter-
  example to Document Intake Routing Demo's mismatch case. Runs through
  the existing scenario replay/regression/batch-regression pipeline
  unchanged - no runner code needed to change, since both are already
  fully scenario-fixture-driven (see the Scenario library section below).

See `docs/progress.md` for QA results and known limitations.

### Sprint 26 — Applied AI Pattern Library + Use Case Fit Lens v1

Sprint 25 could say *whether* a workflow was a good candidate for AI
(and which of seven intervention types fit). It couldn't say *which
specific shape* of AI assist - intake triage vs. RAG vs. a tool-using
agent vs. no build at all - or explain, in a transparent and
deterministic way, why. Sprint 26 adds that layer: an **Applied AI
Pattern Library** of 17 modern applied-AI implementation patterns and a
deterministic **Use Case Fit Lens** that scores every one of them against
a meeting's actual evidence - keeping newer patterns (RAG, tool-using
agents, voice agents) in view without chasing hype, and without ever
forcing agentic AI as the answer. See
[docs/applied-ai-pattern-library.md](docs/applied-ai-pattern-library.md)
for the full pattern list and fit-level semantics.

- **`lib/patterns/appliedAiPatterns.ts`** (new, pure config) - 17 typed
  patterns (`intake_triage_assistant`, `completeness_checker`,
  `structured_extraction`, `summarization_assistant`,
  `rag_knowledge_assistant`, `draft_generation_assistant`,
  `review_quality_assistant`, `decision_support_copilot`,
  `rules_automation`, `workflow_orchestration`, `tool_using_agent`,
  `human_in_the_loop_review_queue`, `monitoring_alerting_assistant`,
  `multimodal_intake_assistant`, `voice_conversation_agent`,
  `reporting_visibility_layer`, `no_build_process_fix`), each with
  `bestFor`/`signals`/`requiredEvidence`/`goodFirstVersion`/
  `notAFitWhen`/`risks`/`humanReviewNeeds`/`exampleQuestions`. Non-AI
  patterns (rules automation, reporting/visibility, no-build process fix)
  are first-class entries, not afterthoughts; agentic/voice patterns are
  written with narrow, explicit fit conditions and are never the default.
- **`lib/patterns/patternFit.ts`** (new, pure, no AI/network call ever -
  verified by a scriptable self-test, `patternFit.selftest.ts`) - scores
  every pattern deterministically from a meeting's workflow model, open
  gaps/ambiguity/clarification items, and (if generated) the Applied AI
  assessment's own risks/missing-information, via plain keyword/token-
  overlap heuristics (same convention as `lib/live/meaningfulSegments.ts`
  and `lib/evidence/evidenceQuality.ts`). Produces a ranked
  `PatternFitResult[]` with `fitLevel` (`strong`/`possible`/`weak`/
  `not_enough_info`/`not_fit`), `fitScore`, `supportingSignals`,
  `missingEvidence`, `risks`, `whyNotYet`, `suggestedValidationQuestions`,
  and `saferFirstVersion`. Two safety properties enforced in code: "strong"
  requires a pattern's required evidence to actually be present (never
  from signal-matching alone), and `tool_using_agent`/
  `voice_conversation_agent` have a hard fit-level ceiling - they can
  never reach "possible"/"strong" without their own required context
  (explicit tool permissions, or an explicit voice channel) confirmed,
  regardless of score.
- **Applied AI opportunity assessment enhancement** - `generateApplied
  AiOpportunityAssessment` (Sprint 25) now also computes `patternFits`
  (every pattern, ranked) and `topRecommendedPatternIds` (patterns at
  "possible" fit or better) via the deterministic scorer above. Pattern
  fits are never shown to or computed by the AI call - the AI's own
  reasoning can never override a fit level, by construction, since it
  never sees them. Every existing assessment field is unchanged.
- **Review page** - a new "Applied AI pattern fit" section renders under
  the existing Applied AI opportunity assessment (`applied_ai_discovery`
  meetings only): top fits first (with fit-level badge, why it fits,
  missing evidence, risks, safer first version, validation questions),
  explicit inline copy that "strong fit" ≠ "build immediately" and "not
  enough info" ≠ "not a fit" ≠ each other, and a collapsed "Show all 17
  pattern results" for the rest. Not included in Share/export, same as
  the rest of the Applied AI assessment.
- **Setup Analyst brief** - the `applied_ai_brief` field gained
  `patternsToValidate`, a short list of pattern names (drawn from the
  real pattern library, presented strictly as hypotheses to validate) -
  always includes at least one non-AI/no-build option alongside any AI
  patterns, and stays generic when the setup context is thin. Existing
  brief fields/behavior for every other meeting type are unaffected.
- **Fast-loop prompt** - a narrow, `applied_ai_discovery`-only addition:
  stay aware of common applied-AI patterns while proposing directions,
  but prefer a validation question over naming a pattern, and never
  suggest a tool-using agent or voice/conversation agent direction unless
  the transcript has already made data/actions/permissions/review
  boundaries explicit. General discovery mode and the existing 1-3
  direction / 1-2 question limits are unaffected.
- **Scenario + regression** - Applied AI Intake Triage Demo's
  `expectedOutputs` gained `expectedPatternFits` (intake triage/
  completeness checker/human-in-the-loop review queue expected at
  "possible" or better; tool-using agent and voice/conversation agent
  expected to stay capped below "possible"). `regressionRunner.ts` gained
  a new "Applied AI pattern fit" check group, gated on a scenario
  declaring `expectedPatternFits` and tolerant of "no assessment generated
  yet" (warns, never fails) - existing regression semantics and every
  other scenario are unaffected. `regressionReviewClassify.ts` gained a
  matching "Applied AI pattern fit" review group so the Sprint 24 review
  UX renders these checks with the same grouping/severity treatment as
  every other check category.

See `docs/progress.md` for QA results and known limitations.

### Sprint 27 — Scenario Library Expansion: Internal Ops + Client Workflows v1

Sprints 25-26 built the Applied AI Discovery mode and its pattern-fit
lens, but only had one scenario (Applied AI Intake Triage Demo) exercising
either. Sprint 27 expands the library to 6 more Applied AI Discovery
scenarios spanning both internal-ops and freelance/client-style discovery,
specifically to prepare for Sprint 28's likely Real Applied AI Field Test
Package - and, along the way, to stress-test judgment: the set includes a
scenario where AI is explicitly not the answer, one where rules automation
beats a generative pattern, and several where human-in-the-loop review is
non-negotiable.

- **6 new scenario fixtures** (`lib/scenarios/`) - **SMB Lead Intake
  Triage Demo** (`smb-lead-intake-triage`, freelance/client, no CRM/SOP -
  a second hallucination-guardrail case alongside Document Intake Routing
  Demo, this time with no system ever named), **Compliance Document
  Review Demo** (`compliance-document-review`, internal ops, checklist
  vs. policy-judgment split), **Knowledge Base Support Assistant Demo**
  (`knowledge-base-support-assistant`, internal ops, RAG fit gated on
  content freshness/ownership - `not_ready` is the intended primary
  recommendation), **Invoice Exception Handling Demo**
  (`invoice-exception-handling`, internal ops, rules automation vs.
  required human approval, with a deliberate `build_assumption_conflict`
  between the tentative "automated" framing and an explicit no-auto-
  payment statement), **Client Project Intake Discovery Demo**
  (`client-project-intake-discovery`, freelance/client, tests that a
  mentioned phone channel doesn't wrongly inflate `voice_conversation_agent`
  fit), and **Internal Reporting Visibility Demo**
  (`internal-reporting-visibility`, internal ops, a deliberate "AI is not
  the answer" trap scenario - `needs_reframing` is the intended review
  outcome).
- **Scenario metadata** (`lib/scenarios/types.ts`) - additive, optional
  fields on every `DiscoveryScenario`: `scenarioType`
  (`internal_ops`/`freelance_client`/`mixed`), `primaryDiscoveryMode`,
  `expectedPrimaryRecommendation`, `expectedTopPatterns`/
  `expectedWeakOrUnsafePatterns` (documentation-only, kept consistent
  with `expectedOutputs.expectedPatternFits`), `difficulty`
  (`basic`/`intermediate`/`messy`/`adversarial`), `fieldTestRelevance`,
  and a new `fieldTestUse` block (what real meeting each scenario
  approximates, what facilitator skill it tests, what DiscoveryOS
  behavior it stresses, what a successful real meeting would validate) -
  preparing directly for Sprint 28. Every field is optional, so every
  pre-Sprint-27 scenario keeps working unchanged.
- **Regression** (`lib/services/regressionRunner.ts`) - a new check
  compares a scenario's `expectedPrimaryRecommendation` against the
  persisted assessment's actual `recommendationType` - always a "warn"
  on mismatch, never a "fail" (recommendation type is AI judgment, not a
  trust/safety matter). Reuses Sprint 26's existing "Applied AI pattern
  fit" check group and category; existing regression semantics are
  unchanged.
- **Pattern-fit calibration fix** (`lib/patterns/patternFit.ts`) -
  verifying the 6 new scenarios surfaced a real scoring bug: generic
  words shared across almost any business-process description
  ("documents," "intake," "text") could push an unrelated pattern's
  signal-match ratio over threshold. Added a generic-word stoplist to
  signal/required-evidence matching (not applied to context-flag
  matching or corpus size, which were already precise/unaffected), and
  broadened `humanApprovalRequired`'s keyword coverage to catch phrasings
  like "signs off" and "I still make every call myself" that the
  original narrow list missed. Re-verified against the Sprint 26
  self-test (still 8/8) and the existing Applied AI Intake Triage Demo
  scenario (all expectations still hold) before and after the fix.
- **Scenario selector** - `getScenarioDisplayLabel()` (`lib/scenarios/
  index.ts`) prefixes every `applied_ai_discovery` scenario with
  `[Applied AI]` in both the New Meeting page's dropdown and the
  Regression Runner's scenario list/checkboxes, based on the scenario's
  own `meetingSetup.meetingType` (not the optional Part B metadata), so
  it works for Sprint 25's original Applied AI scenario too.

See `docs/progress.md` for QA results and known limitations.

### Sprint 28 — Real Applied AI Field Test Package v1

Every prior Applied AI sprint (25-27) built the reasoning and scenario
coverage; none of it had a defined process for actually running
DiscoveryOS in a real, non-scenario applied-AI discovery conversation and
judging whether it helped. Sprint 28 is a controlled-real-use readiness
package - process, an in-app debrief/scoring rubric, and documentation -
not a new AI reasoning feature. Nothing about Setup Analyst, fast-loop
directions, workflow extraction, the Applied AI opportunity assessment,
or pattern-fit scoring changed.

- **`field_tests` table** (`supabase/migrations/0028_field_tests.sql`) -
  one row per meeting, additive and orthogonal to `meeting_pilot_notes`
  (a field test can exist regardless of pilot mode), same "facilitator-
  entered only, never AI-populated, cascades on meeting delete" shape as
  Sprint 18's pilot readiness table. Tracks test context, facilitator
  goal, disclosure/capture-mode flags, facilitator/observer/debrief notes,
  7 ordinal 1-5 rubric scores (check-constrained), a `success_decision`
  (`strong_signal`/`mixed_signal`/`weak_signal`/`not_enough_data`), and
  next-iteration notes.
- **`lib/services/fieldTests.ts`** (new) - `getFieldTestForMeeting`/
  `upsertFieldTestForMeeting` (row-or-defaults, same pattern as
  `pilotReadiness.ts`), `listFieldTests(filters?)`, and
  `computeFieldTestSummary()` (a pure, deterministic helper - average
  score and a `needsNextIteration` flag - shared by the Review page
  section and the `/pilot` dashboard so the two can never disagree).
  `GET`/`POST /api/meetings/[meetingId]/field-test` and a read-only
  `GET /api/field-tests` for cross-meeting listing. Every page that reads
  field-test data catches a missing-table error and falls back to
  defaults, so an unapplied migration during local dev never breaks the
  Review page or `/pilot`.
- **Review page** - a new "Field test debrief (internal)" section
  (status, test context, facilitator goal, disclosure/capture-mode
  checkboxes, facilitator/observer/debrief notes, the 7-question 1-5
  rubric, success decision, next-iteration notes). Lives only on this
  page, exactly like the existing pilot checklist section - never added
  to `meetingExportBuilder.ts`/`meetingMarkdownExport.ts` or the Share
  page.
- **`/pilot` dashboard** - a new, deliberately separate "Field tests"
  section (own summary cards: completed, strong signals, mixed/weak
  signals, average overall usefulness, needing next iteration; plus a
  small table of every field test with a link back to its meeting) so it
  never crowds out the existing tracked-pilot-issues section. Pilot
  meeting rows also get a small field-test status/success-decision badge
  when a field test exists for that meeting.
- **Documentation** - `docs/real-applied-ai-field-test-guide.md` (new,
  15 sections: purpose, what the test should prove, when to run/not run
  one, disclosure language, setup checklist, suggested meeting types +
  first-test selection criteria, live operating rhythm, the Applied AI
  judgment checklist, post-meeting checklist, scoring rubric, success
  decision, evidence to capture, debrief questions, known limitations)
  and `docs/field-test-facilitator-checklist.md` (new, a short printable
  checklist: before/opening script/during/if-it-gets-distracting/after/
  debrief scoring). Disclosure language is explicitly flagged as **not**
  a legal-compliance statement.

See `docs/progress.md` for QA results and known limitations.

### Sprint 29 — AI Call Timeout + Retry Recovery UX v1

Adds timeout, retry, recovery, and user-facing failure handling for AI
calls so DiscoveryOS fails safely and preserves meeting state - a
resilience/UX sprint, not a reasoning change. Per the brief's strict
scope: no AI prompt/reasoning changes, no evidence-quality or regression
semantic changes, no new model providers, no auth/integrations/background
jobs, no cost tracking, no full observability dashboard.

- **`lib/ai/aiCallRunner.ts`** (new) - a pure (no DB/side effects) wrapper
  every AI call site spreads its request options through: configurable
  per-call-kind timeout, a bounded one-retry policy for transient
  failures only (`network`/`rate_limit`/`provider_error` 5xx/`timeout` on
  most kinds - never `schema_parse`/`validation`), and a consistent
  failure classification (`AiCallError`, `describeAiCallFailureForLog()`)
  every call site logs and shows to the user the same way.
- **7 high-risk call sites wrapped**: `setupAnalystService`,
  `fastLoopService`, `workflowExtractorService`,
  `postMeetingReviewService`, `appliedAiOpportunityAssessment`,
  `contradictionDetectorService`, `conversationStateAnalyzerService` -
  plus `audioTranscription` as an 8th. Each keeps its own
  `ai_run_logs` start/complete calls; `aiCallRunner.ts` never writes to
  the database itself.
- **Fail-soft fast loop** - `transcriptAnalysis.ts`'s per-chunk fast-loop
  call is now wrapped the same fail-soft way its workflow-extraction/
  contradiction-detection/conversation-state siblings already were: the
  transcript segment is always saved before analysis runs, and a
  fast-loop failure surfaces as `fastLoopWarning` instead of throwing.
- **Live HUD recovery UX** - the Manual transcript input shows "Transcript
  saved, but analysis failed or timed out. You can retry analysis." with
  a **Retry analysis** button (reusing the existing `/analyze-pending`
  route - no new endpoint), and `HudShell` shows the same banner
  HUD-wide so a live-audio-triggered failure is just as recoverable.
- **Brief/Review/Applied AI Assessment recovery copy** - each surface's
  existing retry button (already functional pre-Sprint-29) now pairs with
  explicit "your data is safe, try again" copy instead of a raw error
  string.
- **Batch regression / scenario replay** - verified, not changed:
  `batchRegressionRunner.ts` already marks items `running` → `completed`/
  `failed` correctly, continues past a failure unless `stopOnFailure`,
  and reports the batch as `partial` rather than hiding a failed item.
- **Debug page** - status badges for `timeout`/`retry_succeeded`/
  `retry_failed`, plus inline failure type/attempts/retryable for any
  failed run.
- **QA failure simulation** - `DISCOVERYOS_TEST_AI_TIMEOUT_KIND`/
  `DISCOVERYOS_TEST_AI_FAILURE_KIND` env vars (optionally
  `DISCOVERYOS_TEST_AI_FAILURE_TYPE`) deterministically simulate a
  timeout/failure for one `AiCallKind` - off by default, zero effect
  unless explicitly set.
- **Documentation** - new `docs/ai-timeout-retry-recovery.md` (purpose,
  timeout defaults, retry policy, per-surface recovery behavior, batch
  partial-failure behavior, debugging, what v1 does not solve, known
  limitations).

See `docs/progress.md` for QA results and known limitations.

### Sprint 30 — Live HUD Focus Polish v1

Polishes the Live HUD so the facilitator can stay present with the
conversation instead of reading a command center - hierarchy, focus
handling, attention control, and meeting ergonomics only. No AI prompt/
reasoning changes, no live audio/transcription behavior changes, no
evidence-quality or regression semantic changes, no new AI features,
integrations, auth, or charts, no export/share changes.

- **Hierarchy reorder** - Current focus and Suggested directions are now
  the clear primary surface. Order top to bottom: recovery banners →
  Current focus (with Suggested directions nested) → Still to explore →
  Live capture/Manual transcript (always visible) → Process so far
  (compact) → Captured transcript (collapsible) → Demo/scenario helper
  (collapsible, scenario-only, moved to the very bottom).
- **Current focus polish** - renamed from "Active focus"; now shows a
  priority badge, "Why it matters" (from the thread's own
  `why_it_matters`), a new **Defer** action alongside Release focus/Mark
  covered, a "View process" link, and a clearer empty state ("No active
  focus yet. Add transcript or choose a topic from Still to explore.").
- **Defer, a real action for once** - `deferred` was already a valid
  `ThreadStatus` (used by directions' own defer action) but had no
  thread-level route. `lib/services/threadFocus.ts` gained `deferThread()`
  (same shape as `markThreadCovered`) and a new
  `POST /api/meetings/[meetingId]/threads/[threadId]/defer` route.
  `ensureDefaultActiveThread` was also updated to skip `deferred` threads
  during auto-promotion, so deferring the only thread left in queue can't
  instantly re-surface it.
- **Still to explore polish** - open and deferred threads are now split:
  open items show highest-priority-first (display-only, never touches
  `sort_order`), capped at 4 by default with a "Show N more" expand;
  deferred items sit collapsed in a "Deferred (N)" `<details>`. New
  helper copy: "Topics to return to if the conversation opens space."
- **Suggested directions polish** - new copy: "Use these during a natural
  pause. They are prompts, not instructions." (Used/dismissed directions
  were already filtered out server-side, so they never crowded active
  ones - no change needed there.)
- **Process so far, now a compact preview** - `WorkflowPanel.tsx` is
  collapsed by default, showing only the workflow name/confidence, a
  one-line summary, and a calm "N need clarification" pill (renamed from
  "Still unclear" for label consistency) - full step/component/gap detail
  and all its edit/lock/verify actions are one click away behind "Show
  process details," unchanged otherwise.
- **Live capture ergonomics** - `LiveAudioPanel.tsx`'s dense diagnostic
  readout (chunk counts, timestamps, detection reasons, signal terms) is
  now collapsed behind "Show capture details"; the always-visible status
  line uses calmer wording ("Live capture off," "Paused," "Unanalyzed
  text waiting"). No capture/transcription logic changed - presentation
  only.
- **Quiet mode / Focus only** - two new session-only (not persisted)
  toggles in `HudShell.tsx`. Quiet mode collapses Suggested directions to
  a "Show N suggested directions (quiet mode)" teaser; Focus only hides
  Process so far/Captured transcript/Demo helper entirely, showing just
  Current focus + Suggested directions. Capture controls and recovery
  banners are never touched by either mode.
- **Captured transcript** - now collapsible (collapsed by default),
  matching the rest of the secondary surfaces.
- **Label consistency** - "Still unclear" → "Needs clarification"; no
  forbidden internal terms (queue item, ambiguity flag, contradiction
  candidate, workflow gap, AI run) appear on the Live page outside the
  pre-existing Debug-link tooltip.

See `docs/progress.md` for the full hierarchy audit, QA results, and
known limitations.

### Sprint 31 — Real Applied AI Field Test #1 v1

A field-learning sprint, not a feature sprint: ran and evaluated the
first controlled applied-AI discovery field test using DiscoveryOS, per
the brief's own principle - "capture what happened, score usefulness,
log issues, and decide what should change after the evidence is
reviewed," not rush to build fixes mid-test. No AI prompts, Applied AI
assessment behavior, pattern-fit scoring, live capture behavior, or
regression semantics were changed during the test itself.

- **Field test #1** - a self-run simulation (no live human participant
  was available), clearly labeled as such throughout. The stakeholder
  dialogue was adapted from the Sprint 27 `internal-reporting-visibility`
  scenario fixture but submitted manually, one transcript chunk at a
  time, through the same routes a real facilitator uses - never through
  the automated scenario-replay pipeline - so every Suggested-direction
  use/dismiss/defer, thread focus/defer/mark-covered, and observation was
  a genuine, in-the-moment judgment call, not a scripted replay.
- **Result: `strong_signal`** (scores 4/4/4/4/5/4/4 - helped ask better
  questions, reduced missed follow-ups, improved workflow understanding,
  stayed non-distracting, evidence trustworthy, Applied AI judgment
  useful, overall usefulness). The pattern-fit scorer correctly buried
  `summarization_assistant` (the literal original "AI summary" idea) at
  a fit score of -10, well below `no_build_process_fix` (56) and
  `reporting_visibility_layer` (46) - concretely demonstrating that
  DiscoveryOS resisted the AI-first framing the scenario was designed to
  tempt it toward.
- **2 tracked pilot issues opened** from real findings, not manufactured
  ones: (1) the contradiction detector flagged two candidates that were
  false positives on review - complementary (not conflicting) facts, and
  a single utterance's own paraphrase mistaken for two separate claims;
  (2) Suggested directions repeated already-covered ground for one full
  round right after the conversation's most important pivot, instead of
  engaging the new signal.
- **No code fixes were needed** - nothing crashed, all field-test data
  (scores, debrief, tracked issues) persisted and rendered on `/pilot`,
  and Share/export stayed clean (zero leakage of internal field-test
  notes, confirmed by direct grep). One unrelated build-cache artifact
  (`.next/dev/types/validator.ts`, corrupted by the dev server itself,
  not by any source change) was cleared during QA - not a product bug.
- **Documentation** - full field-test summary, debrief, and known
  limitations in `docs/progress.md`'s Sprint 31 section.

See `docs/progress.md` for the full field-test debrief, QA results, and
known limitations.

### Sprint 32 — Remote Conversation Capture Readiness v1

Lightweight support for the practical problem Field Test #1 flagged:
browser mic capture often can't reliably hear a remote participant.
Setup guidance, an audio test workflow, a minimal manual fallback, and
capture-quality scoring - not a meeting-platform integration, not a
transcription provider change. No Zoom/Teams/Meet integration, no
meeting bot, no AI reasoning/prompt/pattern-fit changes.

- **`docs/remote-conversation-capture-guide.md`** (new) - compares 5
  capture setups (BlackHole/virtual audio routing, two laptops + external
  mic, two laptops + built-in mic, same laptop + speakers, same laptop +
  headphones-only), a pre-call audio test checklist, practical BlackHole
  setup notes (explicitly not guaranteed across every app/browser/OS),
  external-mic fallback setup, during-call operating rules, capture-
  quality scoring definitions, and known limitations.
- **`remote_capture_readiness` table** (new,
  `supabase/migrations/0032_remote_capture_readiness.sql`) - one row per
  meeting, the *pre-call* setup checklist (capture setup selected,
  pre-call test completed, remote audio captured clearly, user voice
  dominated, manual backup ready). Same additive, cascade-on-delete,
  facilitator-only shape as `meeting_pilot_notes`/`field_tests`.
  `lib/services/remoteCaptureReadiness.ts` (row-or-defaults, fail-soft)
  plus `GET`/`POST /api/meetings/[meetingId]/remote-capture-readiness`.
- **`field_tests` gains 6 *post-call* capture-quality columns** (same
  migration) - `remote_audio_clarity_score`, `user_voice_balance_score`,
  `transcript_usefulness_score` (each 1-5), `manual_notes_needed`/
  `hud_distraction_level` (low/medium/high), `capture_setup_used`.
  Deliberately on `field_tests` rather than a second table, since these
  are debrief scoring, conceptually distinct from the pre-call checklist
  above.
- **Live page** - new collapsible "Remote capture setup" panel (default
  collapsed) next to Live Capture/Manual transcript, and a new **Quick
  anchor note** - a one-line input ("Stakeholder said…") that submits
  through the existing manual-transcript route (no new data model).
  Both stay visible in Quiet mode/Focus-only, alongside the capture
  controls they belong next to.
- **Field Test Debrief** - new "Capture quality (remote calls)" block
  (only relevant for remote calls; blank is fine for in-person tests),
  linking back to the Live page's setup panel.
- **`/pilot`** - a small "Capture quality (remote calls)" summary row
  inside the existing Field tests section, shown only once at least one
  field test has recorded a capture setup.

See `docs/progress.md` for the schema decision, QA results, and known
limitations.

## Scenario 1 test path

A manual smoke test covering the full flow, useful after any change to the
setup/brief/live pipeline:

1. `/meetings/new` — create an `automation_discovery` meeting with a
   tentative build direction (e.g. "AI-assisted document classification
   and routing").
2. On the brief page, click **Generate Discovery Brief** — confirm all 9
   sections render, and that the build-direction warning actually
   challenges the tentative direction rather than restating it as settled.
3. Click **Start meeting** — on the live HUD, confirm the queue shows the
   Setup Analyst's initial threads (or the hardcoded automation-discovery
   fallback if no brief was generated) and that exactly one thread is
   active.
4. Paste a transcript chunk into **Manual transcript input** and click
   **Analyze Chunk** — confirm the HUD refreshes with an updated
   understanding level and new question directions with reasons.
5. Exercise **Use**, **Defer**, and **Dismiss** on a direction; confirm
   deferring creates a queued thread with `why_it_matters` populated.
6. Click a queued thread to focus it; confirm the previous active thread
   returns to the queue and the new one shows the focus lock indicator.
   Release focus, then Mark covered, and confirm the next queued thread is
   promoted automatically.

### Scenario 1 Workflow Extraction Test

Run alongside step 4 above, on the same `automation_discovery` meeting, to
exercise the workflow extractor across a run of chunks. Paste each chunk
separately and click **Analyze Chunk** before pasting the next one, and
check the **Workflow** panel after each:

1. *"So when a document comes in, someone on the team has to open it up and
   take a look at it first. They review it to figure out what kind of
   document it actually is — is it a standard item, some kind of state
   filing, whatever. Once they've identified what type it is, they route it
   into the right queue for whoever handles that type next."*
   Expect steps for **reviewing the document**, **identifying the document
   type**, and **routing to a queue** — with trigger, rules, systems, and
   failure handling still open gaps (none of those were actually said yet).
2. *"We usually send standard items to Finance, but if it is a state filing
   issue, Operations handles it — that's kind of the main fork in the road
   right now, standard item versus state filing determines who picks it
   up."*
   Expect **Finance** and **Operations** to show up as actor components
   (Finance for standard items, Operations for state filing issues — do not
   reverse this), plus a decision-rule component for the
   standard-item-vs-state-filing fork.
3. *"Actually, for the state filing ones there's one more wrinkle — those
   have to go through Legal for approval before Operations can actually file
   anything. So it's not just Operations, Legal has to sign off first on the
   state filing ones."*
   Expect a Legal approval component to be added as a new branch — check
   that nothing in the known/unknown summary or gaps calls this a
   "contradiction"; it's additive information.
4. *"Honestly, figuring out whether something's a standard item or a state
   filing is usually pretty easy, that part's rarely the issue. The hard
   part is once you know it's a state filing, figuring out which state's
   rules actually apply, and then who on Legal is even the right reviewer
   for that state — that's the part that trips people up."*
   Expect this to sharpen the unknown summary / gaps toward **state-rule
   interpretation** and **reviewer determination** — and NOT add a new
   "classification" step or component just because it was called easy.
5. *"There was actually a case a few months back where a state filing got
   routed to Finance by mistake instead of Operations, and nobody caught it
   until weeks later when someone noticed the filing deadline had already
   passed. There's no real alert or check right now that catches that kind
   of misroute early — it's usually just somebody stumbling onto it
   later."*
   Expect a failure-detection component (or gap) capturing that misrouting
   and delayed discovery is a live failure mode with no current automated
   detection.

### Scenario 1 Evidence Test

Run across the same five chunks above, checking each item's evidence via
**View evidence** in the WorkflowPanel after it appears:

1. **Review incoming document** and **Identify document type** (steps) —
   should link to chunk 1 and quote something like "looks at the document" /
   "figures out what type it is".
2. **Route standard item to Finance** — should link to chunk 2 and quote
   something like "standard items to Finance".
   **Route state filing issue to Operations** — should link to chunk 2 and
   quote something like "state filing issue, Operations handles it".
3. **Legal approval** (component) — should link to chunk 3 and quote
   something like "Legal has to approve".
4. **State-rule interpretation difficulty** and **reviewer determination
   difficulty** (gaps) — should link to chunk 4 and quote something like
   "hard part is knowing which state rule applies" / "who needs to review
   it".
5. **Incorrect routing / delayed filing detection** — should link to chunk 5
   and quote something like "something gets routed wrong" or "filing is
   delayed".

Throughout, **Systems/tools** should remain an `unknown`-evidence open gap —
no chunk above names a concrete system or tool, so nothing should ever show
up as a `system` component with a source quote backing it. Exact wording is
model-dependent (this is a live OpenAI call, not a fixture), so check for
quotes that are genuinely close paraphrases/substrings of the transcript
chunk, not exact string equality.

### Hallucination Guardrail Test

Using a fresh meeting (or the same one, watching for regressions as later
chunks are pasted):

1. Paste a chunk that never names a concrete system/tool (e.g. chunk 1
   above). Confirm no `system` component appears in the WorkflowPanel — the
   generic "queue" language should surface only as a `handoff` (low
   confidence) or stay folded into the **Systems/tools** gap, never promoted
   to a `system` component.
2. Confirm no step/component ever shows `evidence_type: known` with an empty
   or missing source quote — open **View evidence** on a few `Known`-badged
   items and confirm the source quote is real transcript text, not
   boilerplate.
3. Confirm no item cites a transcript segment whose text doesn't actually
   support it — cross-check the drawer's "Transcript segment" panel against
   the "Source quote" and "Confidence reason" shown above it.

### Browser Evidence Drawer Test

1. On the live HUD after running a few chunks, click **View evidence** on a
   step, a component, and a gap. Confirm the drawer opens on the right with
   the item's title, an Known/Inferred/Unknown badge, ordinal confidence
   (steps/components only — gaps have none), confidence reason, source
   quote (or "No direct quote cited"), and the full transcript segment with
   its timestamp (or "No transcript segment linked").
2. Confirm clicking the backdrop or **Close** closes the drawer, and that
   pressing **Escape** also closes it.
3. Confirm the inline Known/Inferred/Unknown badges and short source quotes
   render directly in the WorkflowPanel list (not just inside the drawer)
   for items that have one.

Confidence is always ordinal: `unclear` / `emerging` / `likely` /
`confirmed` — never a numeric percentage. Queueing lives on
`discovery_threads` (`in_queue`, `sort_order`) — there is no separate queue
table. Route handlers stay thin; logic lives in `lib/services`.

### Scenario 1 expected evaluation checklist notes

When scoring this run on `/meetings/[meetingId]/evaluate`: workflow
extraction accuracy should pass cleanly (steps/actors/decision rule/Legal
approval/failure-detection all evidenced above); evidence correctness
should pass (every source quote above is a real substring, and
**Systems/tools** correctly stays an open gap rather than a fabricated
`system`); hallucination checks should pass on both the no-fake-system
check and the no-unsupported-quote check. Gap quality should reflect that
state-rule interpretation and reviewer determination stay open, specific
gaps rather than being padded out with restated/duplicate gaps.

## Scenario 2: Employee Onboarding Access Request Demo

A second, cleaner end-to-end demo script (added in Sprint 8), covering the
same ground as Scenario 1 but exercising gap narrowing (Part B) and the
relationally-described-actor fix (Part C) specifically. Create the meeting
via `/meetings/new` with these fields:

- **Meeting name:** Employee Onboarding Access Request Demo
- **Meeting type:** Automation Discovery
- **Discovery strategy:** Deep Validation
- **Goal:** Validate whether the employee onboarding access request
  process is a good candidate for automation, and identify where delays,
  unclear ownership, approval gaps, and system handoffs create risk.
- **Current understanding:** When a new employee joins, their manager
  requests access to the systems the employee needs. Different teams may
  approve or fulfill different types of access, and delays can affect the
  employee's first week.
- **Tentative build direction:** AI-assisted onboarding access request
  triage and routing.
- **Assumptions:**
  - Access requests follow predictable patterns based on role and
    department.
  - Most delays come from routing requests to the wrong team or missing
    required approval information.
- **Risks / unknowns:**
  - Some access decisions may require manager, Security, or system-owner
    approval before fulfillment.
  - The process may rely on tribal knowledge rather than documented
    rules.
- **Pasted context:** This is a demo scenario for DiscoveryOS. The meeting
  is about the employee onboarding access request process. The current
  idea is AI-assisted request triage and routing, but the discovery
  should validate whether routing is actually the problem, whether
  approval rules are documented, which systems and teams are involved,
  how failures are detected, and what delays mean for the new employee
  experience.

After starting the meeting, paste these five chunks into **Manual
transcript input**, one at a time, clicking **Analyze Chunk** between each:

1. *"When a new hire starts, the manager usually sends a request with the
   employee's role, department, start date, and the tools they think the
   person needs. Someone on People Ops reviews it first and checks whether
   anything obvious is missing."*
2. *"For basic tools like email and Slack, IT can usually provision access
   directly. But for finance tools or customer data systems, Security or
   the system owner has to approve it first."*
3. *"The tricky part is that managers often ask for tools using informal
   names, so People Ops has to figure out what system they actually mean.
   Sometimes they also forget to include the department or start date."*
4. *"If a request is wrong or incomplete, it usually sits in the IT queue
   until someone notices and sends a follow-up message. That can delay
   access by two or three days, which is a big problem for employees
   starting on Monday."*
5. *"We track requests in Jira Service Management, but the approval rules
   are mostly in people's heads. There is a spreadsheet that lists common
   roles and the tools they usually need, but it is not always up to
   date."*

**Expect the WorkflowPanel to capture**, across the five chunks: **Manager**,
**People Ops**, **IT**, **Security**, and **System Owner** as actor
components (the last one specifically exercises the Sprint 8 fix for
relationally-described roles - "the system owner" - not just fixed
department names); **Jira Service Management** and the **spreadsheet** as
system components; steps/gaps covering informal tool names needing
normalization, missing department/start date on intake, the IT queue
delay, and the two-to-three-day access delay. No system should ever appear
that wasn't actually named in the transcript.

**Expect the generated post-meeting review's build-direction assessment**
to land on `partially_supported` or `needs_reframing` — not a clean
`supported` for narrow "triage and routing" — naming the real opportunity
as broader than routing alone: intake validation, tool-name
normalization, approval-rule clarification, reliable role-to-tool
mapping, and escalation/failure detection for incomplete requests. The
original idea isn't wrong, but routing in isolation undersells what the
transcript actually surfaces.

**Expect the Workflow page** (`/meetings/[meetingId]/workflow`, added
Sprint 9) to render all 7 steps in order (send request, review request,
provision basic tools, approval for finance/customer-data tools, clarify
informal tool names, check for missing information, detect incomplete
requests) with Actors/Systems/Open gaps side panels populated from the
same components captured above.

**Expect "Points needing clarification" on the same page** (Sprint 9
ambiguity flags — never labeled contradictions or shown as alerts) to
include, at minimum: informal tool names needing interpretation
(chunk 3), and undocumented/informal approval rules (chunk 5). The model
inconsistently also catches unclear ownership of the IT-queue follow-up
(chunk 4) and unclear system-owner approval criteria (chunk 2) on any
given run — this is a real, documented `gpt-4o-mini` under-generation
limitation (see the Sprint 9 note in `docs/progress.md`), not a logic bug;
nothing fabricated has ever been observed, only conservative
under-flagging.

### Scenario 2 expected evaluation checklist notes

When scoring this run: workflow extraction accuracy should mostly pass,
with one known, pre-existing gap worth noting in the scorecard's notes
field rather than treated as a new failure — the "Manager" actor (who
sends the request in chunk 1) is not reliably captured as its own actor
component, even though the system-owner actor fix from Sprint 8 works
correctly for the other relationally-described roles in this transcript.
Evidence correctness and hallucination checks should both pass (no
fabricated systems, all quotes real substrings). Demo readiness should
pass on the ambiguity flags rendering non-disruptively and using soft,
non-accusatory language throughout.

## Scenario library (Sprint 10)

Every demo scenario is a typed `DiscoveryScenario` fixture in
`lib/scenarios/` — this is now the source of truth for meeting-setup
fields, transcript chunks, and expected outputs; the detailed walkthrough
sections above (Scenario 1 and Scenario 2) describe the same content the
fixtures hold, kept as prose for readers who'd rather not open the code.

| Scenario | `id` | Fixture | Tests |
| --- | --- | --- | --- |
| Document Intake Routing Demo | `document-intake-routing` | `documentIntakeRouting.ts` | Hallucination guardrail — no system is ever named, so none should be fabricated |
| Employee Onboarding Access Request Demo | `employee-onboarding-access` | `employeeOnboardingAccess.ts` | Relationally-described actors, gap narrowing, ambiguity flags |
| Support Escalation Workflow Demo | `support-escalation-workflow` | `supportEscalationWorkflow.ts` | Vague ticket language as an ambiguity (not a gap), SLA risk, partly-documented rules |
| Spreadsheet Reporting Automation Demo | `spreadsheet-reporting-automation` | `spreadsheetReportingAutomation.ts` | Multi-source system capture, "not hard"-framing not suppressing a real risk gap |
| Procurement Approval Workflow Demo | `procurement-approval-workflow` | `procurementApprovalWorkflow.ts` | Numeric threshold rule as a decision_rule, compliance branch (Security/Legal), bounce-back failure loop |
| Customer Onboarding Handoff Demo | `customer-onboarding-handoff` | `customerOnboardingHandoff.ts` | Unbranded-but-described system (a Google Doc template), failure discovered downstream rather than at the point of handoff |
| Applied AI Intake Triage Demo | `applied-ai-intake-triage` | `appliedAiIntakeTriage.ts` | Sprint 25's Applied AI Discovery mode - AI-assist-with-human-review direction validated as `partially_supported` rather than reframed, plus compliance-exception and sensitive-data risk; Sprint 26 pattern fit expects intake triage/completeness checker/human-in-the-loop review queue at "possible"+ and tool-using/voice agents capped below "possible" |
| SMB Lead Intake Triage Demo | `smb-lead-intake-triage` | `smbLeadIntakeTriage.ts` | Sprint 27 freelance/client scenario - no CRM/SOP exists at all (hallucination guardrail: no system should be fabricated), owner explicitly rejects auto-booking |
| Compliance Document Review Demo | `compliance-document-review` | `complianceDocumentReview.ts` | Sprint 27 internal-ops scenario - deterministic checklist items vs. genuine policy-exception judgment, firm human sign-off |
| Knowledge Base Support Assistant Demo | `knowledge-base-support-assistant` | `knowledgeBaseSupportAssistant.ts` | Sprint 27 internal-ops scenario - RAG pattern fit gated on content freshness/ownership, `not_ready` as the intended recommendation |
| Invoice Exception Handling Demo | `invoice-exception-handling` | `invoiceExceptionHandling.ts` | Sprint 27 internal-ops scenario - rules automation vs. required human/manager approval, `build_assumption_conflict` against an explicit no-auto-payment statement |
| Client Project Intake Discovery Demo | `client-project-intake-discovery` | `clientProjectIntakeDiscovery.ts` | Sprint 27 freelance/client scenario - tests that a mentioned phone channel doesn't wrongly inflate `voice_conversation_agent` fit |
| Internal Reporting Visibility Demo | `internal-reporting-visibility` | `internalReportingVisibility.ts` | Sprint 27 internal-ops "trap" scenario - the tentative AI-summary build direction should be reframed, not endorsed |

Each fixture's `expectedOutputs`/`evaluationNotes` fields hold the same
kind of detail spelled out in prose for Scenario 1/2 above — steps,
actors, systems, gaps, evidence checks, a review-assessment expectation,
expected ambiguity flags, and (Sprint 12) expected contradiction-detector
clarification needs — open the fixture file directly for the full
transcript chunks and expectations of any scenario not narrated in prose
here.

### How to load a demo scenario

On `/meetings/new`, the **Load demo scenario** dropdown at the top of the
form lists every fixture in `lib/scenarios/` by name (plus "Blank
meeting"). Selecting one prefills every setup field below it — name,
type, strategy, goal, current understanding, tentative build direction,
assumptions, risks, pasted context — from the fixture. Nothing is created
yet at this point: every field stays fully editable, and creating the
meeting only happens when the form is submitted, exactly like a blank
meeting. The created meeting's `scenario_id` is set to the fixture's
`id`, which is what powers the next two sections.

### How to use demo transcript chunks

If a meeting has `scenario_id` set (i.e. it was created via the scenario
dropdown), the Live HUD shows a collapsible **Demo transcript chunks**
panel above the manual transcript box, listing that scenario's chunks
with **Copy** and **Insert** buttons. **Insert** drops the chunk's text
directly into the transcript input for review; **Copy** puts it on the
clipboard instead. Either way, nothing is submitted or analyzed
automatically — you still click **Analyze Chunk** yourself for each one,
same as pasting transcript text by hand. Meetings without a `scenario_id`
(including every meeting created before Sprint 10) simply don't show this
panel; manual transcript input works exactly as it always has.

### How scenario-aware evaluation works

If a meeting has `scenario_id` set, the `/evaluate` page shows an
open-by-default **Scenario: {name}** panel above the scorecard with the
fixture's full expected-outputs reference (steps/actors/systems/gaps/
evidence checks/review assessment/ambiguities) and its evaluation notes,
plus a short relevant-fields hint under each rubric category heading so
you don't have to cross-reference the fixture file by hand while scoring.
The scenario name field pre-fills from the fixture (still editable). None
of this changes how scoring works — it's reference material for a human
filling out the same Pass/Fail checklist from Sprint 9; there is still no
automated/AI-judged scoring and no regression runner. Meetings without a
`scenario_id` see the exact same evaluation page as before Sprint 10.

### Live audio (Sprint 11 prototype, continuous mode since Sprint 13)

Browser-microphone capture exists now, feeding the same manual-transcript
pipeline, with an explicit consent step before recording starts - see the
Sprint 11 and Sprint 13 sections above for the mechanism, and
`docs/live-audio-readiness.md` for the full plan plus its "Sprint 11
prototype status" and "Sprint 13 continuous-mode status" sections marking
exactly what's implemented versus still just planned. Short version:
in-person/self-test browser-mic recording only, chunked internally every
~15s but buffered and gated through deterministic meaningful-segment
detection (Sprint 13) before becoming a transcript segment, rather than
one segment per chunk (Sprint 11's original behavior).
**Not implemented**: Zoom/Teams or other remote-meeting audio, system/tab
audio capture, virtual audio devices, a meeting bot, speaker diarization,
true streaming/partial-token transcription, or any production-grade
consent/compliance certification - the consent modal is a plain
confirmation dialog, not an audited compliance flow, and this prototype
does not certify legal sufficiency in any jurisdiction. The Live HUD's
Live Audio panel states current mode/recording/analysis/pending-buffer
status plainly at all times; manual transcript input is always available
alongside it, never disabled by anything live audio does.

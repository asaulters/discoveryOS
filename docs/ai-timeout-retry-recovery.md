# AI Timeout, Retry & Recovery (Sprint 29)

## Purpose

Every AI call in DiscoveryOS runs over the network to OpenAI, and every
network call can hang, time out, or fail transiently. Before Sprint 29, a
stuck or failed AI call could leave a route hanging indefinitely, or throw
in a way that discarded work the facilitator had already entered (a pasted
transcript chunk, a live-audio segment). The product principle behind this
sprint: **AI failure should not destroy meeting state or make the user
guess.** DiscoveryOS should be transparent about what failed, what was
saved, what can be retried, and what to do next.

This sprint deliberately does **not** touch AI prompts, AI reasoning
behavior, evidence-quality rules, or regression semantics - see "What v1
does not solve" below.

## What failures this handles

- **Timeouts** - an OpenAI call that takes too long is aborted at a
  per-call-kind timeout instead of hanging the request indefinitely.
- **Rate limits and provider errors** - 429s and 5xx-class provider
  failures are classified and, for most call kinds, retried once.
- **Network errors** - connection failures/aborts are classified as
  `network` and retried once.
- **Schema/validation failures** - a model response that doesn't parse
  into the expected structured-output schema, or a pre-flight input
  problem, is classified as `schema_parse`/`validation` and **never**
  retried (retrying an identical request won't fix a shape mismatch).

All of this is centralized in `lib/ai/aiCallRunner.ts` - a small, pure
(no DB, no side effects) wrapper every real AI call site spreads its
request options through:

```ts
const { data, attempts } = await runAiCallOrThrow({
  kind: "fast_loop",
  fn: (requestOptions) => client.chat.completions.parse({ ... }, requestOptions),
});
```

`runAiCallOrThrow` throws an `AiCallError` (carrying `failureType`,
`retryable`, `attempts`, `durationMs`) on failure; call sites catch it
exactly like any other error and use `describeAiCallFailureForLog()` to
turn it into a rich `ai_run_logs` entry. `aiCallRunner.ts` never calls
`startAiRunLog`/`completeAiRunLog` itself - each service keeps its own
logging calls, so a service with substantial persistence logic after the
API call (e.g. `workflowExtractorService.ts`) doesn't get a duplicate log
row, and `getLatestAppliedAiOpportunityAssessment()`'s direct read of
`ai_run_logs.output` still gets exactly the shape it always has.

## Timeout defaults

| Call kind | Timeout |
| --- | --- |
| `fast_loop` | 25s |
| `workflow_extraction` | 35s |
| `conversation_state` | 25s |
| `contradiction_detection` | 25s |
| `setup_brief` | 45s |
| `post_meeting_review` | 60s |
| `applied_ai_assessment` | 60s |
| `transcription` | 45s |
| `scenario_replay` / `batch_regression` | 60s (orchestration-level fallback only - see "Route-level timeout notes") |

Overridable per call via `runAiCall`'s `timeoutMs` option; these are the
defaults used everywhere today.

## Retry policy

- Retried: `network`, `rate_limit`, `provider_error` (only if the HTTP
  status is 5xx or unknown - a 4xx won't succeed on retry), and `timeout`
  for most call kinds.
- **Never** retried: `schema_parse`, `validation`, `unknown`.
- `fast_loop` and `transcription` do **not** retry a `timeout`
  specifically - these are live/synchronous calls a facilitator is
  actively waiting on, so a timeout fails fast rather than doubling an
  already-live wait. A `network`/`rate_limit`/`provider_error` on these
  kinds still retries once.
- Max **one retry** (v1, per the sprint's own scope). A small fixed
  backoff (300ms × attempt + up to 200ms jitter) separates attempts.
- The OpenAI SDK's own built-in retries are disabled (`maxRetries: 0`
  passed through) so `aiCallRunner.ts` is the single source of retry
  behavior - no doubled-up retry logic.

## User-facing recovery behavior

| Surface | Behavior on AI failure |
| --- | --- |
| Live HUD / manual transcript | The transcript segment is always saved **before** analysis runs. A fast-loop failure surfaces as `fastLoopWarning` (both inline on the input box and as a HUD-wide banner) with a **Retry analysis** button - the text is never lost, and analysis can be re-run without resubmitting it. |
| Generate Brief | The meeting is unaffected; a failure shows "Meeting saved, but brief generation failed. Try again." with the button still available to retry. |
| Generate Review | Existing meeting data and any prior review are untouched; a failure shows "Meeting data is intact, but review generation failed. Try again." - never a partial/misleading review. |
| Applied AI Assessment | The Review page and any prior assessment stay fully usable; a failure shows an inline error with retry, isolated from the rest of the page. |
| Scenario Replay | The replay row (`scenario_replay_runs`) always exists; the meeting it created remains linked and usable. See the fail-soft note below for what does/doesn't mark a replay "failed" today. |
| Batch Regression | Item statuses track `running` → `completed`/`failed` individually; a failed item's `error_message` is preserved, other items continue unless `stopOnFailure` is set, and the batch's own status is `partial` (some items failed) rather than silently reporting success. |

Retrying always goes through the exact same code path as the original
call - there is no separate "recovery" reasoning path, and a retry never
fabricates a result. A recovered/retried success is logged as
`retry_succeeded`, not `succeeded`, so the distinction is visible in
`ai_run_logs` (and `getLatestAppliedAiOpportunityAssessment()`'s read-back
query explicitly accepts both statuses, so a retry-recovered assessment
is never invisible to the Review page).

## Batch regression partial failure behavior

`batchRegressionRunner.ts` already had (pre-Sprint-29, verified unchanged
this sprint) the right shape for this: each item is marked `running`
before it starts, `failed` with `error_message` set if `replayScenario`
throws, and the loop continues to the next scenario unless
`stopOnFailure` is true. The batch's own `status` is `completed` (no
failures), `partial` (some failed, ran to completion), or `failed`
(stopped early). **Quality-check failures never become pipeline
failures**: a scenario that completes with `checks_fail > 0` is still a
`completed` item - `failed` means the replay/regression pipeline itself
didn't finish, not that its checks came back negative.

**Known interaction with Part D's fail-soft fast loop**: `submitTranscriptChunk`'s
per-chunk analysis (fast-loop, workflow extraction, contradiction
detection, conversation-state) is fail-soft end-to-end - each catches its
own failure and surfaces a warning rather than throwing. This was already
true for three of the four before this sprint; Sprint 29 makes fast-loop
consistent with the other three per Part D's "never lose transcript, always
allow retry" requirement. One direct consequence, confirmed live during
QA: **an AI failure during a scenario replay's per-chunk analysis no
longer fails the replay item** - it's swallowed as a warning the replay
result doesn't currently surface, and the item still completes normally.
`runRegression` itself makes no AI calls (it's deterministic checks
against already-persisted data), so today the only things that can mark a
batch item `failed` are non-AI failures (an unknown scenario id, a
database error) - see "Known limitations."

## Debugging AI failures

The per-meeting Debug page (`/meetings/[meetingId]/debug`) lists every
`ai_run_logs` row for that meeting with: call type, status badge
(`succeeded`/`retry_succeeded` green, `failed`/`retry_failed` red,
`timeout` amber, anything else neutral), model, latency, timestamp, and,
for any failure whose `output` matches the shape `aiCallRunner.ts`
writes, an inline failure type, attempt count, and retryable flag, in
addition to the full input/output JSON already available in the
expandable details. This is intentionally simple (per the sprint's own
scope) - not a cross-meeting or aggregate observability dashboard.

## Route-level timeout notes

`aiCallRunner.ts` bounds an individual OpenAI call's wall-clock time. It
does **not** bound how long a Next.js route handler itself runs - a route
that makes several sequential AI calls (e.g. batch regression across
several scenarios, each running the full replay pipeline) can still take
several minutes end to end, and your deployment platform (Vercel, or any
other host with its own function/request timeout) may still cut that
request off before it finishes, independent of anything in this sprint.
Locally, `next dev` has no such limit, which is why batch regression and
scenario replay are documented as local/dev tools rather than promised
production-safe long-running operations. **v1 solves individual AI call
timeouts, not a full background-job/async-queue system** - if batch
regression needs to run reliably in a deployed environment with a strict
request timeout, that's a background-job architecture change, not
something this sprint attempts.

## What v1 does not solve

- **No background/scheduled jobs.** Nothing here turns a long-running
  operation into an async job with its own worker/queue - `runAiCall`
  bounds a single OpenAI call's wall-clock time, nothing more.
- **No route-level timeout guarantee.** See "Route-level timeout notes"
  below - a batch regression run making many sequential real AI calls can
  still take longer than your deployment platform's own request timeout,
  independent of anything in `aiCallRunner.ts`.
- **No cost/latency tracking beyond `durationMs`.** Per the sprint's
  scope, no new cost-tracking fields were added.
- **No new model providers, auth, or integrations.**
- **No change to AI prompts, reasoning, evidence-quality rules, or
  regression check semantics.**

## Known limitations

- An AI failure during scenario replay/batch regression's per-chunk
  analysis phase does not fail the item (see "Batch regression partial
  failure behavior" above) - only a non-AI failure can today. Making a
  persistently-failing analysis step visible at the replay/batch level
  (not just per-chunk) is a reasonable future enhancement, not solved in
  v1.
- The Live HUD's `fastLoopWarning` (and the pre-existing
  `workflowExtractionWarning`/`contradictionDetectionWarning`/
  `conversationStateWarning`) are transient - they only appear on the
  response immediately after the analysis that produced them, and are
  cleared by the HUD's next 4-second poll. If the facilitator doesn't
  notice/act within that window, the retry option is still available (the
  underlying data is safely saved and `/analyze-pending` always re-runs
  against whatever's accumulated), just not still visibly flagged.
- Retry count is only visible in `ai_run_logs.output` for **failed**
  calls; a successful call that needed a retry is visible as the
  `retry_succeeded` status but the exact attempt count isn't
  surface-level on every successful business object (most services
  persist their own domain result as `output`, not `aiCallRunner`'s
  metadata).
- `scenario_replay`/`batch_regression` are defined as `AiCallKind` values
  for completeness but are not passed to `runAiCall` by any real call
  site today - both orchestrators rely entirely on the timeouts of the
  individual AI calls they make, not a wrapper around the orchestration
  itself.

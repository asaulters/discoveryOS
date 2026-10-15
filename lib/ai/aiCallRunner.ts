import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  RateLimitError,
  APIError,
} from "openai";

/**
 * Sprint 29 Part A: a central, pure (no DB/side effects) wrapper for AI
 * calls - configurable timeout, a small bounded retry policy for clearly
 * transient failures, and a consistent failure classification every call
 * site can log and show to the user the same way. This module never
 * touches ai_run_logs itself - each service keeps its own
 * startAiRunLog/completeAiRunLog calls (unchanged shape, so nothing that
 * reads a service's persisted output - e.g. getLatestAppliedAiOpportunity
 * Assessment reading `output` back directly - breaks), and uses
 * `describeAiCallFailureForLog()` below to log the richer status/failure
 * metadata this sprint adds.
 *
 * Design principle: AI failure should never look like success, never lose
 * already-saved user data, and should always tell the facilitator what
 * failed, what's retryable, and what happened after N attempts - see
 * docs/ai-timeout-retry-recovery.md.
 */

export const AI_CALL_KINDS = [
  "setup_brief",
  "fast_loop",
  "workflow_extraction",
  "slow_reasoning",
  "contradiction_detection",
  "conversation_state",
  "post_meeting_review",
  "applied_ai_assessment",
  "transcription",
  "scenario_replay",
  "batch_regression",
  "unknown",
] as const;

export type AiCallKind = (typeof AI_CALL_KINDS)[number];

export const AI_CALL_FAILURE_TYPES = [
  "timeout",
  "rate_limit",
  "network",
  "provider_error",
  "schema_parse",
  "validation",
  "unknown",
] as const;

export type AiCallFailureType = (typeof AI_CALL_FAILURE_TYPES)[number];

export type AiCallResult<T> =
  | { ok: true; data: T; durationMs: number; attempts: number }
  | {
      ok: false;
      failureType: AiCallFailureType;
      message: string;
      durationMs: number;
      attempts: number;
      retryable: boolean;
      rawError?: unknown;
    };

/** Request options every wrapped call site should spread into its OpenAI SDK call - disables the SDK's own hidden retries (maxRetries: 0) so this wrapper is the single source of truth for retry behavior, and lets the SDK enforce `timeout` itself (see docs/ai-timeout-retry-recovery.md section 3). */
export interface AiCallRequestOptions {
  timeout: number;
  maxRetries: 0;
  signal?: AbortSignal;
}

/** Thrown by a call site's `fn` when the model returned no/invalid structured output - never retried, since retrying an already-well-formed request won't fix a schema mismatch. */
export class SchemaParseError extends Error {}

/** Thrown by a call site's `fn` for a pre-flight input problem (not a model/network issue) - never retried. */
export class AiCallValidationError extends Error {}

/** Thrown by `runAiCallOrThrow` on failure - carries the same classification `AiCallResult` does, so a catch block can build a rich, consistent ai_run_logs entry without re-deriving it. */
export class AiCallError extends Error {
  readonly failureType: AiCallFailureType;
  readonly retryable: boolean;
  readonly durationMs: number;
  readonly attempts: number;
  readonly rawError?: unknown;

  constructor(result: Extract<AiCallResult<unknown>, { ok: false }>) {
    super(result.message);
    this.name = "AiCallError";
    this.failureType = result.failureType;
    this.retryable = result.retryable;
    this.durationMs = result.durationMs;
    this.attempts = result.attempts;
    this.rawError = result.rawError;
  }
}

export interface RunAiCallOptions<T> {
  kind: AiCallKind;
  /** Overrides DEFAULT_TIMEOUT_MS[kind]. */
  timeoutMs?: number;
  /** Overrides DEFAULT_MAX_RETRIES (1) - total attempts made is 1 + maxRetries. */
  maxRetries?: number;
  /** Performs the actual call - must spread `requestOptions` into the underlying OpenAI SDK call so timeout/signal/maxRetries take effect. */
  fn: (requestOptions: AiCallRequestOptions) => Promise<T>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Recommended defaults per Sprint 29 Part A - deliberately generous for "click a button and wait" flows, tighter for the live/synchronous ones. */
const DEFAULT_TIMEOUT_MS: Record<AiCallKind, number> = {
  fast_loop: 25_000,
  workflow_extraction: 35_000,
  conversation_state: 25_000,
  contradiction_detection: 25_000,
  setup_brief: 45_000,
  post_meeting_review: 60_000,
  applied_ai_assessment: 60_000,
  transcription: 45_000,
  slow_reasoning: 60_000,
  // Orchestration-level kinds - not expected to wrap a single OpenAI call
  // directly (scenarioReplayRunner/batchRegressionRunner rely on the
  // underlying per-call timeouts above), kept here only so the type stays
  // total and a stray direct use still gets a sane default.
  scenario_replay: 60_000,
  batch_regression: 60_000,
  unknown: 30_000,
};

const DEFAULT_MAX_RETRIES = 1;

/**
 * Kinds where the facilitator is actively watching a live UI for a
 * response - retrying a timeout here just doubles an already-live wait,
 * so a timeout fails fast instead. Every other kind gets one retry on
 * timeout too, since a bit more latency to get a real answer beats
 * failing a "click and wait" flow on a single slow response.
 */
const NO_TIMEOUT_RETRY_KINDS: ReadonlySet<AiCallKind> = new Set(["fast_loop", "transcription"]);

function isRetryable(failureType: AiCallFailureType, kind: AiCallKind, httpStatus?: number): boolean {
  switch (failureType) {
    case "network":
      return true;
    case "rate_limit":
      return true;
    case "provider_error":
      // Only a 5xx (or a status-less provider error) is transient enough
      // to retry - a 4xx (bad request, auth, etc.) will fail identically
      // on retry.
      return httpStatus === undefined || httpStatus >= 500;
    case "timeout":
      return !NO_TIMEOUT_RETRY_KINDS.has(kind);
    case "schema_parse":
    case "validation":
    case "unknown":
      return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small fixed backoff + jitter between retries - see Part A's "keep it simple" guidance, no exponential backoff needed for a single retry. */
function backoffMs(attempt: number): number {
  return 300 * attempt + Math.random() * 200;
}

// ---------------------------------------------------------------------------
// Part I: deterministic QA failure simulation - env-var gated, off by
// default, read fresh on every call so it never lingers across requests
// once unset. Simulated failures still go through the exact same
// classification/retry/logging path as a real failure, so they're a
// faithful test of the recovery UX, not a separate code path.
// ---------------------------------------------------------------------------

class SimulatedAiTimeoutError extends Error {
  constructor(kind: AiCallKind) {
    super(`Simulated timeout for AI call kind "${kind}" (DISCOVERYOS_TEST_AI_TIMEOUT_KIND)`);
    this.name = "SimulatedAiTimeoutError";
  }
}

class SimulatedAiFailureError extends Error {
  readonly failureType: AiCallFailureType;
  constructor(kind: AiCallKind, failureType: AiCallFailureType) {
    super(`Simulated ${failureType} failure for AI call kind "${kind}" (DISCOVERYOS_TEST_AI_FAILURE_KIND)`);
    this.name = "SimulatedAiFailureError";
    this.failureType = failureType;
  }
}

const VALID_FAILURE_TYPES: ReadonlySet<string> = new Set(AI_CALL_FAILURE_TYPES);

/** A short, non-blocking delay so a simulated timeout still exercises real async timing (loading states, etc.) without actually waiting out the real timeout window. */
const SIMULATED_DELAY_MS = 150;

async function maybeThrowSimulatedFailure(kind: AiCallKind): Promise<void> {
  if (process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND === kind) {
    await sleep(SIMULATED_DELAY_MS);
    throw new SimulatedAiTimeoutError(kind);
  }
  if (process.env.DISCOVERYOS_TEST_AI_FAILURE_KIND === kind) {
    const requestedType = process.env.DISCOVERYOS_TEST_AI_FAILURE_TYPE ?? "provider_error";
    const failureType: AiCallFailureType = VALID_FAILURE_TYPES.has(requestedType)
      ? (requestedType as AiCallFailureType)
      : "provider_error";
    await sleep(SIMULATED_DELAY_MS);
    throw new SimulatedAiFailureError(kind, failureType);
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classify(
  err: unknown,
  kind: AiCallKind
): { failureType: AiCallFailureType; message: string; retryable: boolean } {
  if (err instanceof SimulatedAiTimeoutError) {
    return { failureType: "timeout", message: err.message, retryable: isRetryable("timeout", kind) };
  }
  if (err instanceof SimulatedAiFailureError) {
    return {
      failureType: err.failureType,
      message: err.message,
      retryable: isRetryable(err.failureType, kind),
    };
  }
  if (err instanceof SchemaParseError) {
    return { failureType: "schema_parse", message: err.message, retryable: false };
  }
  if (err instanceof AiCallValidationError) {
    return { failureType: "validation", message: err.message, retryable: false };
  }
  if (err instanceof APIConnectionTimeoutError) {
    return { failureType: "timeout", message: err.message || "Request timed out", retryable: isRetryable("timeout", kind) };
  }
  if (err instanceof APIUserAbortError) {
    // A caller-triggered abort (not our timeout) - treat like a network
    // interruption rather than a fresh classification we don't have.
    return { failureType: "network", message: err.message || "Request aborted", retryable: isRetryable("network", kind) };
  }
  if (err instanceof RateLimitError) {
    return { failureType: "rate_limit", message: err.message || "Rate limited", retryable: isRetryable("rate_limit", kind) };
  }
  if (err instanceof APIConnectionError) {
    return { failureType: "network", message: err.message || "Network error", retryable: isRetryable("network", kind) };
  }
  if (err instanceof APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    return {
      failureType: "provider_error",
      message: err.message || `Provider error${status ? ` (${status})` : ""}`,
      retryable: isRetryable("provider_error", kind, status),
    };
  }
  const message = err instanceof Error ? err.message : "Unknown AI call failure";
  return { failureType: "unknown", message, retryable: false };
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/**
 * Runs `fn` with a configurable timeout and a small bounded retry policy
 * for clearly transient failures - never retries schema/validation
 * failures, never retries a timeout for a live/synchronous call kind, and
 * never retries more than `maxRetries` (default 1) times total. Always
 * resolves (never throws) - callers that want a thrown error on failure
 * should use `runAiCallOrThrow` instead.
 */
export async function runAiCall<T>(options: RunAiCallOptions<T>): Promise<AiCallResult<T>> {
  const { kind, fn } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS[kind];
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxAttempts = 1 + maxRetries;

  const startedAt = Date.now();
  let attempts = 0;

  for (;;) {
    attempts++;
    try {
      await maybeThrowSimulatedFailure(kind);
      const data = await fn({ timeout: timeoutMs, maxRetries: 0 });
      return { ok: true, data, durationMs: Date.now() - startedAt, attempts };
    } catch (err) {
      const classified = classify(err, kind);
      const canRetry = classified.retryable && attempts < maxAttempts;
      if (canRetry) {
        await sleep(backoffMs(attempts));
        continue;
      }
      return {
        ok: false,
        failureType: classified.failureType,
        message: classified.message,
        durationMs: Date.now() - startedAt,
        attempts,
        retryable: classified.retryable,
        rawError: err,
      };
    }
  }
}

/** Convenience wrapper: throws `AiCallError` on failure instead of returning a discriminated union - reduces most call sites' integration to "wrap the existing try body, use the thrown AiCallError in the existing catch." */
export async function runAiCallOrThrow<T>(
  options: RunAiCallOptions<T>
): Promise<{ data: T; attempts: number; durationMs: number }> {
  const result = await runAiCall(options);
  if (!result.ok) {
    throw new AiCallError(result);
  }
  return { data: result.data, attempts: result.attempts, durationMs: result.durationMs };
}

// ---------------------------------------------------------------------------
// Logging helpers (Part C) - deliberately produce plain data, not DB
// writes, so aiCallRunner.ts stays a pure utility. Each call site still
// owns its own startAiRunLog/completeAiRunLog calls; these just compute
// the richer status/output/message values Sprint 29 adds.
// ---------------------------------------------------------------------------

export type AiRunLogStatus = "succeeded" | "failed" | "timeout" | "retry_succeeded" | "retry_failed";

export interface AiCallFailureLogInfo {
  status: AiRunLogStatus;
  /** Safe to persist as `output` on a failed run - nothing reads a non-"succeeded" row's `output` back for logic, only Debug displays it. */
  output: {
    failureType: AiCallFailureType;
    attempts: number;
    durationMs: number;
    retryable: boolean;
    callKind: AiCallKind;
  };
  message: string;
}

/** For a successful call: "succeeded" on the first attempt, "retry_succeeded" if a retry was needed. */
export function aiCallSuccessStatus(attempts: number): Extract<AiRunLogStatus, "succeeded" | "retry_succeeded"> {
  return attempts > 1 ? "retry_succeeded" : "succeeded";
}

/**
 * If `err` came from this wrapper (`AiCallError`), returns everything a
 * catch block needs to log a rich, consistent failure - otherwise `null`
 * so the caller can fall back to its existing generic error handling
 * (e.g. a persistence-layer error thrown after a successful AI call).
 */
export function describeAiCallFailureForLog(err: unknown, kind: AiCallKind): AiCallFailureLogInfo | null {
  if (!(err instanceof AiCallError)) {
    return null;
  }
  const status: AiRunLogStatus =
    err.failureType === "timeout" ? "timeout" : err.attempts > 1 ? "retry_failed" : "failed";
  return {
    status,
    output: {
      failureType: err.failureType,
      attempts: err.attempts,
      durationMs: err.durationMs,
      retryable: err.retryable,
      callKind: kind,
    },
    message: err.message,
  };
}

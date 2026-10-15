/**
 * Sprint 29 Part A/K (QA1): scriptable assertions for
 * lib/ai/aiCallRunner.ts - no live OpenAI calls, no database.
 * Run with: npx tsx lib/ai/aiCallRunner.selftest.ts
 */
import { APIConnectionError, APIError } from "openai";
import {
  runAiCall,
  runAiCallOrThrow,
  AiCallError,
  SchemaParseError,
  AiCallValidationError,
  describeAiCallFailureForLog,
  aiCallSuccessStatus,
} from "./aiCallRunner";

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

async function run() {
  // Make sure no simulation env vars are lingering from the shell this runs in.
  delete process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND;
  delete process.env.DISCOVERYOS_TEST_AI_FAILURE_KIND;
  delete process.env.DISCOVERYOS_TEST_AI_FAILURE_TYPE;

  // ---------------------------------------------------------------------
  // 1. Successful call returns ok:true with duration and attempts.
  // ---------------------------------------------------------------------
  {
    const result = await runAiCall({
      kind: "fast_loop",
      fn: async () => "hello",
    });
    check("1. successful call ok:true", result.ok === true, result);
    if (result.ok) {
      check("1. data is returned", result.data === "hello", result);
      check("1. attempts is 1", result.attempts === 1, result);
      check("1. durationMs is a number >= 0", typeof result.durationMs === "number" && result.durationMs >= 0, result);
    }
    check("1. aiCallSuccessStatus(1) is 'succeeded'", aiCallSuccessStatus(1) === "succeeded");
    check("1. aiCallSuccessStatus(2) is 'retry_succeeded'", aiCallSuccessStatus(2) === "retry_succeeded");
  }

  // ---------------------------------------------------------------------
  // 6. Timeout/failure simulation is off by default (env vars unset above).
  //    Covered again explicitly here as its own check, distinct from #1.
  // ---------------------------------------------------------------------
  {
    check(
      "6. DISCOVERYOS_TEST_AI_TIMEOUT_KIND is unset by default",
      process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND === undefined
    );
    check(
      "6. DISCOVERYOS_TEST_AI_FAILURE_KIND is unset by default",
      process.env.DISCOVERYOS_TEST_AI_FAILURE_KIND === undefined
    );
    const result = await runAiCall({ kind: "post_meeting_review", fn: async () => 42 });
    check("6. a normal call succeeds with simulation unset", result.ok === true, result);
  }

  // ---------------------------------------------------------------------
  // 2. Simulated timeout returns failureType 'timeout'.
  // ---------------------------------------------------------------------
  {
    process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND = "post_meeting_review";
    const result = await runAiCall({ kind: "post_meeting_review", fn: async () => "should not run" });
    delete process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND;
    check("2. simulated timeout is ok:false", result.ok === false, result);
    if (!result.ok) {
      check("2. failureType is 'timeout'", result.failureType === "timeout", result);
      // post_meeting_review is not a live/synchronous kind, so timeout is retryable -> 2 attempts.
      check("2. timeout on a non-live kind retries once (2 attempts)", result.attempts === 2, result);
    }

    // Live/synchronous kind (fast_loop) should NOT retry a timeout.
    process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND = "fast_loop";
    const liveResult = await runAiCall({ kind: "fast_loop", fn: async () => "should not run" });
    delete process.env.DISCOVERYOS_TEST_AI_TIMEOUT_KIND;
    check("2b. fast_loop timeout does not retry (1 attempt)", !liveResult.ok && liveResult.attempts === 1, liveResult);
  }

  // ---------------------------------------------------------------------
  // 3. Simulated provider/network failure returns classified failure.
  // ---------------------------------------------------------------------
  {
    process.env.DISCOVERYOS_TEST_AI_FAILURE_KIND = "workflow_extraction";
    process.env.DISCOVERYOS_TEST_AI_FAILURE_TYPE = "network";
    const result = await runAiCall({ kind: "workflow_extraction", fn: async () => "should not run" });
    delete process.env.DISCOVERYOS_TEST_AI_FAILURE_KIND;
    delete process.env.DISCOVERYOS_TEST_AI_FAILURE_TYPE;
    check("3. simulated network failure is ok:false", result.ok === false, result);
    if (!result.ok) {
      check("3. failureType is 'network'", result.failureType === "network", result);
      check("3. network failure is retryable (2 attempts)", result.attempts === 2, result);
    }
  }

  // ---------------------------------------------------------------------
  // 4. Non-retryable schema/validation failure does not retry.
  // ---------------------------------------------------------------------
  {
    let callCount = 0;
    const result = await runAiCall({
      kind: "setup_brief",
      fn: async () => {
        callCount++;
        throw new SchemaParseError("Model returned no structured output");
      },
    });
    check("4. schema_parse failure is ok:false", result.ok === false, result);
    if (!result.ok) {
      check("4. failureType is 'schema_parse'", result.failureType === "schema_parse", result);
      check("4. schema_parse is not retryable", result.retryable === false, result);
      check("4. schema_parse only attempted once", result.attempts === 1 && callCount === 1, { result, callCount });
    }

    let validationCallCount = 0;
    const validationResult = await runAiCall({
      kind: "setup_brief",
      fn: async () => {
        validationCallCount++;
        throw new AiCallValidationError("Bad input");
      },
    });
    check(
      "4b. validation failure is not retryable and only attempted once",
      !validationResult.ok && validationResult.failureType === "validation" && validationCallCount === 1,
      { validationResult, validationCallCount }
    );
  }

  // ---------------------------------------------------------------------
  // 5. Retryable failure retries once if configured, then can succeed.
  // ---------------------------------------------------------------------
  {
    let callCount = 0;
    const result = await runAiCall({
      kind: "post_meeting_review",
      fn: async () => {
        callCount++;
        if (callCount === 1) {
          throw new APIConnectionError({ message: "simulated connection blip" });
        }
        return "recovered";
      },
    });
    check("5. retry-then-succeed is ok:true", result.ok === true, result);
    if (result.ok) {
      check("5. data reflects the successful retry", result.data === "recovered", result);
      check("5. attempts is 2", result.attempts === 2, result);
    }
    check("5. fn was actually called twice", callCount === 2, callCount);
  }

  // ---------------------------------------------------------------------
  // Extra: runAiCallOrThrow + AiCallError + describeAiCallFailureForLog
  // round-trip, since every real call site uses this path, not runAiCall directly.
  // ---------------------------------------------------------------------
  {
    let threw: unknown = null;
    try {
      await runAiCallOrThrow({
        kind: "applied_ai_assessment",
        fn: async () => {
          throw new APIError(503, undefined, "service unavailable", undefined as never);
        },
      });
    } catch (err) {
      threw = err;
    }
    check("extra. runAiCallOrThrow throws AiCallError on failure", threw instanceof AiCallError, threw);
    if (threw instanceof AiCallError) {
      check("extra. AiCallError.failureType is 'provider_error'", threw.failureType === "provider_error", threw);
      check("extra. 503 provider_error is retryable (2 attempts)", threw.attempts === 2, threw);

      const logInfo = describeAiCallFailureForLog(threw, "applied_ai_assessment");
      check("extra. describeAiCallFailureForLog returns info for an AiCallError", logInfo !== null, logInfo);
      check("extra. logInfo.status is 'retry_failed'", logInfo?.status === "retry_failed", logInfo);
      check("extra. logInfo.output.callKind is 'applied_ai_assessment'", logInfo?.output.callKind === "applied_ai_assessment", logInfo);
    }

    const nonAiCallError = new Error("a plain persistence-layer error");
    check(
      "extra. describeAiCallFailureForLog returns null for a non-AiCallError",
      describeAiCallFailureForLog(nonAiCallError, "unknown") === null
    );
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exit(1);
  }
}

run();

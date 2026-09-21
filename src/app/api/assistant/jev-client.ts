import {
  APITimeoutError,
  APIUserAbortError,
  TypeSafeClient,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import type { Answers, Ask } from "@/lib/assistant/jev";

/**
 * Jev, through TypeSafe's SDK, with the server's key.
 *
 * Only the route imports this, so the key never reaches the browser — the
 * SDK refuses to run there anyway unless told to. It retries rate limits,
 * 5xx answers and dropped connections on its own; what it does not have is a
 * budget for the whole call, so each request carries a deadline, sized so
 * both passes of `interpret` fit inside the 30 s the chat waits.
 */

const ATTEMPT_TIMEOUT_MS = 6_000;
const REQUEST_BUDGET_MS = 13_000;

export function createJevAsk(apiKey: string, model: string): Ask {
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: model,
    timeout: ATTEMPT_TIMEOUT_MS,
    retry: { maxRetries: 1 },
  });

  return async (state, questions) => {
    const result = await client.systemOne(
      { state, questions },
      { signal: AbortSignal.timeout(REQUEST_BUDGET_MS) },
    );
    // Every question the assistant asks is a Choice, so every answer is one.
    return result.answers as Answers;
  };
}

/** Out of time: one attempt, or the whole budget. */
export function isTimeout(error: unknown): boolean {
  return error instanceof APITimeoutError || error instanceof APIUserAbortError;
}

/** Anything else the SDK reports — an HTTP error, an unreachable service. */
export function isServiceError(error: unknown): boolean {
  return error instanceof TypeSafeError;
}

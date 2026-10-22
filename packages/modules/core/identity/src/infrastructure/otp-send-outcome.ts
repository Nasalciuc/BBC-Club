import { defineRequestState, hasRequestState } from "@better-auth/core/context";

/** Why a code mail failed. Never the address, never the code. */
export type OtpSendFailure = {
  /** inactive_recipient: Postmark refuses the address (ErrorCode 406, or a 422 with no code); timeout: no answer within
   *  the sender's timeout; provider_error: anything else (a bad token is a 401 here). */
  reason: "inactive_recipient" | "timeout" | "provider_error";
  /** Postmark's HTTP status, when the sender got one. */
  status?: number;
  /** Postmark's ErrorCode from the answer's body, when it had one. */
  postmarkErrorCode?: number;
};

/** The Postmark sender throws `Postmark <status>: <body, first 200 characters>`; a timeout is the fetch's TimeoutError. */
export function classifyOtpSendError(err: unknown): OtpSendFailure {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return { reason: "timeout" };
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const status = /^Postmark (\d{3})\b/.exec(message)?.[1];
  const errorCode = /"ErrorCode"\s*:\s*(\d+)/.exec(message)?.[1];
  const failure = {
    status: status ? Number(status) : undefined,
    postmarkErrorCode: errorCode ? Number(errorCode) : undefined,
  };
  const inactive =
    failure.postmarkErrorCode === 406 ||
    failure.status === 406 ||
    (failure.status === 422 && failure.postmarkErrorCode === undefined);
  return { reason: inactive ? "inactive_recipient" : "provider_error", ...failure };
}

/** Per request (Better Auth's request state: one per HTTP request or `auth.api` call). Better Auth 1.6.31's
 *  runInBackgroundOrAwait swallows the sender's error and the route answers 200 whatever happened; the send callback
 *  writes its outcome here and club-guards' after-hook reads it. It is awaited in the same request because no
 *  `advanced.backgroundTasks` handler is configured — keep it that way. */
const outcome = defineRequestState<{ failure: OtpSendFailure | null }>(() => ({ failure: null }));

export async function recordOtpSendFailure(failure: OtpSendFailure): Promise<void> {
  if (!(await hasRequestState())) return;
  (await outcome.get()).failure = failure;
}

/** The failure this request's send recorded, or null. */
export async function otpSendFailure(): Promise<OtpSendFailure | null> {
  if (!(await hasRequestState())) return null;
  return (await outcome.get()).failure;
}

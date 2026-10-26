/**
 * What a CRM call throws, and whether the same call made again can succeed (ADR-IMPL-065). `send-requests` reads
 * `retryable`: false gives the request up at once (the CRM refused it as it is); true tries it again five minutes later,
 * six times in all. Messages name the call and the status, never the body, the secret or the member's details.
 */

/** Every outbound CRM call gets this ceiling: a partner slower than this is an outage. */
export const CRM_TIMEOUT_MS = 5000;

/** The partner did not answer in time. Fail fast and retry; do not hold a pooled connection. */
export class CrmTimeoutError extends Error {
  readonly code = "CRM_TIMEOUT" as const;
  readonly retryable = true;
  constructor(method: string, ms = CRM_TIMEOUT_MS) {
    super(`CRM ${method} timed out after ${ms}ms`);
    this.name = "CrmTimeoutError";
  }
}

/** The CRM could not be reached (DNS, a refused or reset connection, TLS): tried again. `reason` is the network
 *  error's code (`ConnectionRefused`), never its text, which may hold the address. */
export class CrmUnreachableError extends Error {
  readonly code = "CRM_UNREACHABLE" as const;
  readonly retryable = true;
  constructor(method: string, reason: string) {
    super(`CRM ${method} unreachable (${reason})`);
    this.name = "CrmUnreachableError";
  }
}

/** Statuses worth sending the same request again for: a timeout the server noticed, a rate limit, its own failure. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** The CRM answered, but not 2xx. Retryable for 408, 429 and 5xx; any other status (another 4xx, a redirect) means the
 *  CRM refused this request as it is, and would refuse it again. The answer's body is never read into the error: it may
 *  repeat the member's details. */
export class CrmHttpError extends Error {
  readonly code = "CRM_HTTP" as const;
  readonly retryable: boolean;
  constructor(
    method: string,
    readonly status: number,
  ) {
    const retryable = isRetryableStatus(status);
    super(`CRM ${method} answered ${status} (${retryable ? "retryable" : "permanent"})`);
    this.name = "CrmHttpError";
    this.retryable = retryable;
  }
}

/** A request the adapter will not send: without its reference there is no Idempotency-Key, and a resend could not be
 *  told from a new request. Sending it again changes nothing. */
export class CrmRequestInvalidError extends Error {
  readonly code = "CRM_REQUEST_INVALID" as const;
  readonly retryable = false;
  constructor(method: string, reason: string) {
    super(`CRM ${method} not sent: ${reason}`);
    this.name = "CrmRequestInvalidError";
  }
}

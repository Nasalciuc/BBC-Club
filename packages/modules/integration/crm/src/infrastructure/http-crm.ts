import { createHmac } from "node:crypto";
import type { CrmFacade, CrmRequestPayload } from "../api";
import {
  CRM_TIMEOUT_MS,
  CrmHttpError,
  CrmRequestInvalidError,
  CrmTimeoutError,
  CrmUnreachableError,
} from "../domain/errors";

/** `CRM_ADAPTER=http` (ADR-IMPL-065). */
export type HttpCrmConfig = {
  /** CRM_API_URL: where each request is POSTed. */
  url: string;
  /** CRM_API_SECRET: signs each call. It never leaves the server, in a header or a log. */
  secret: string;
  /** The ceiling of one call; 5 s. Tests pass less. */
  timeoutMs?: number;
  /** Seconds since the epoch, for `X-BBC-Timestamp`. Tests pin it. */
  now?: () => number;
};

/** The signature of one call: hex HMAC-SHA256, keyed with CRM_API_SECRET, over `<X-BBC-Timestamp>.<body>` — the body's
 *  exact bytes as sent (ADR-IMPL-065, which shows the CRM how to check it). */
export function signCrmCall(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * What the CRM receives for a request: the payload `send-requests` built, without what only the e-mail uses — the
 * operator links (each one moves the request; over http the CRM reports a status through
 * `POST /v1/internal/requests/:id/status`, with `_request_id`) and the attempt number. A resend is then the same body
 * under the same Idempotency-Key: a copy the CRM can drop.
 */
export function crmRequestBody(payload: CrmRequestPayload): Omit<CrmRequestPayload, "_actions" | "_attempt"> {
  const body: CrmRequestPayload = { ...payload };
  delete body._actions;
  delete body._attempt;
  return body;
}

/** The network error's code (`ConnectionRefused`, `ECONNRESET`), or its name: never its message, which may hold the
 *  address. */
function networkReason(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Za-z_]{1,40}$/.test(code)) return code;
  const name = err instanceof Error ? err.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "network error";
}

/**
 * The CRM over https. `submitRequest` POSTs the request, signed (`X-BBC-Timestamp`, `X-BBC-Signature`) and keyed on its
 * reference (`Idempotency-Key`), within the call's ceiling. Any answer but a 2xx throws (`CrmHttpError`, retryable for
 * 408, 429 and 5xx), as do a timeout and a network error (retryable): `send-requests` stores the failure and tries
 * again, or gives up at once on a refusal. Nothing is logged here; the answer's body is not read.
 *
 * `findByEmail` answers null, as the e-mail adapter does: it runs inside the profile's insert, at sign-up, and a call
 * there would hold the transaction on the CRM and make joining depend on it. Matching a member to the CRM is the mirror's
 * job (stage 5, MODULE.md). `createActivity` records nothing: no code calls it, and the CRM has no endpoint for it yet.
 */
export function httpCrm(config: HttpCrmConfig): CrmFacade {
  const ms = config.timeoutMs ?? CRM_TIMEOUT_MS;
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));
  return {
    async findByEmail() {
      return null;
    },
    async createActivity() {
      return { id: null };
    },
    async submitRequest(raw, opts) {
      const payload = raw as CrmRequestPayload;
      const reference = typeof payload?.reference === "string" ? payload.reference.trim() : "";
      if (!reference) throw new CrmRequestInvalidError("submitRequest", "the request has no reference");
      const body = JSON.stringify(crmRequestBody(payload));
      const timestamp = String(now());
      const ceiling = AbortSignal.timeout(ms);
      const signal = opts?.signal ? AbortSignal.any([opts.signal, ceiling]) : ceiling;
      let res: Response;
      try {
        res = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": reference,
            "X-BBC-Timestamp": timestamp,
            "X-BBC-Signature": signCrmCall(config.secret, timestamp, body),
          },
          body,
          signal,
          // A redirect is a wrong address: refused, never followed with the member's details.
          redirect: "manual",
        });
      } catch (err) {
        if (signal.aborted) throw new CrmTimeoutError("submitRequest", ms);
        throw new CrmUnreachableError("submitRequest", networkReason(err));
      }
      // Not read: nothing in it is needed, and it may repeat the member's details.
      await res.body?.cancel().catch(() => undefined);
      if (res.status < 200 || res.status > 299) throw new CrmHttpError("submitRequest", res.status);
      return { crmRequestId: `http:${reference}` };
    },
  };
}

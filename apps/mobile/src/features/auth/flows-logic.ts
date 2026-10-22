import { authMessage } from "@bbc/shared/auth-messages";

/** What an auth flow answers its screen (flows.ts). */
export type FlowResult = { ok: true; message?: string } | { ok: false; message: string; code?: string };

/** A limit that lifts with time. Not TOO_MANY_ATTEMPTS: that code was tried five times and better-auth deleted it
 *  (atomicVerifyOTP) — waiting does not bring it back, a new code does (verify-code-logic.ts). */
const RATE_LIMIT_CODES = new Set(["RATE_LIMITED", "TOO_MANY_REQUESTS"]);

/** A Better Auth error in the club's voice, with the code a screen decides on. */
export function fail(err: { code?: string; message?: string; status?: number } | null | undefined): FlowResult {
  const code =
    err?.status === 429 || (err?.code != null && RATE_LIMIT_CODES.has(err.code)) ? "RATE_LIMITED" : err?.code;
  return { ok: false, message: authMessage(code), code };
}

/**
 * The account deletion is never sent without a password: better-auth 1.6.31 checks it only when one is given
 * (`if (ctx.body.password)`), so an empty one deletes the account of any session younger than a day. Null: send it.
 */
export function refuseEmptyPassword(password: string): FlowResult | null {
  if (password.trim().length > 0) return null;
  return { ok: false, code: "INVALID_PASSWORD", message: "Enter your password." };
}

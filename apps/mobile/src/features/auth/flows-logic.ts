import { authMessage } from "@bbc/shared/auth-messages";
import { RESET_DONE_NOTICE, RESET_DONE_SIGN_IN } from "./reset-flow-logic";

export { RESET_DONE_SIGN_IN };

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
 * How a session ends on this phone. `signOut` / `deleted`: the member chose to leave — what was theirs goes with them.
 * `revoked`: the server ended it (a 401: a password changed or reset elsewhere, an expiry) — the member did not leave and
 * usually signs in again, so the requests saved offline stay with their owner (lib/queue.ts adoptQueue gives them back
 * to that member and sets them aside for any other), as do the saved items, recent searches, onboarded flag and their
 * owner marker (local-owner.ts adoptLocalData clears them if another member signs in).
 */
export type ExitKind = "signOut" | "deleted" | "revoked";
export type ExitPlan = { clearQueue: boolean; clearMemberData: boolean; forgetOwner: boolean };

export function exitPlan(kind: ExitKind): ExitPlan {
  const chosen = kind !== "revoked";
  return { clearQueue: chosen, clearMemberData: chosen, forgetOwner: chosen };
}

/** The phone's stores a session's end may clear (flows.ts passes the real ones). */
export type ExitStores = {
  clearQueue: () => void;
  resetUnreadQuotes: () => void;
  clearMemberData: () => void;
  forgetLocalOwner: () => void;
  clearPendingPassword: () => void;
};

/** Clear what `kind` says. The Requests dot's number and a pending password never outlive any session. */
export function clearOnExit(kind: ExitKind, stores: ExitStores): void {
  const plan = exitPlan(kind);
  if (plan.clearQueue) stores.clearQueue();
  stores.resetUnreadQuotes();
  if (plan.clearMemberData) stores.clearMemberData();
  if (plan.forgetOwner) stores.forgetLocalOwner();
  stores.clearPendingPassword();
}

/**
 * After a reset that succeeded, the sign-in with the new password. Its failure — 429 because the wrong sign-ins before
 * the reset used /sign-in/email's 5 per 10 min, another refusal, no connection (`"network"`) — is never the reset's:
 * the password is set and the code spent, so the member is sent to Sign in with RESET_DONE_NOTICE, never offered
 * Continue again. No retry loop.
 */
export function afterResetSignIn(error: { code?: string; status?: number } | "network" | null): FlowResult {
  if (error === null) return { ok: true };
  return { ok: false, code: RESET_DONE_SIGN_IN, message: RESET_DONE_NOTICE };
}

/**
 * The account deletion is never sent without a password: better-auth 1.6.31 checks it only when one is given
 * (`if (ctx.body.password)`), so an empty one deletes the account of any session younger than a day. Null: send it.
 */
export function refuseEmptyPassword(password: string): FlowResult | null {
  if (password.trim().length > 0) return null;
  return { ok: false, code: "INVALID_PASSWORD", message: "Enter your password." };
}

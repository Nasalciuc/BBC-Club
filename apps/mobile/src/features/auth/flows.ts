import { authClient, waitForSessionCookie } from "./client";
import { authMessage, CONSTANT_OTP_SENT, CONSTANT_RESET_SENT } from "@bbc/shared/auth-messages";
import { postAccountPassword } from "@/lib/api";
import { unregisterPushDevice } from "@/lib/push";
import { clearQueue } from "@/lib/queue";
import { appStorage, ONBOARDED_KEY } from "@/lib/storage-keys";
import { NetworkError, networkFail, withAuthTimeout } from "@/lib/timeout";
import type { AuthPurpose } from "@/lib/auth-purpose";

/** Unregister push, drop pending queue, clear onboarded — then auth ends. */
async function clearLocalSession(): Promise<void> {
  await unregisterPushDevice().catch(() => undefined);
  clearQueue();
  appStorage.remove(ONBOARDED_KEY);
}

type Result = { ok: true; message?: string } | { ok: false; message: string; code?: string };

/** Cookie not in SecureStore yet (or lost) — set-password would 401 with "Please sign in." */
const SESSION_NOT_READY = "Your session isn't ready. Verify your email code again.";

const RATE_LIMIT_CODES = new Set(["RATE_LIMITED", "TOO_MANY_REQUESTS", "TOO_MANY_ATTEMPTS"]);

function fail(err: { code?: string; message?: string; status?: number } | null | undefined): Result {
  const code =
    err?.status === 429 || (err?.code != null && RATE_LIMIT_CODES.has(err.code)) ? "RATE_LIMITED" : err?.code;
  return { ok: false, message: authMessage(code), code };
}

function fromNetwork(e: unknown): Result {
  const n = networkFail(e instanceof NetworkError ? e : e);
  return { ok: false, message: n.message, code: n.code };
}

async function requireSessionCookie(): Promise<Result | null> {
  if (await waitForSessionCookie()) return null;
  return { ok: false, message: SESSION_NOT_READY, code: "UNAUTHORIZED" };
}

/** Sign In: email + password. */
export async function signIn(email: string, password: string): Promise<Result> {
  try {
    const { error } = await withAuthTimeout(authClient.signIn.email({ email, password }));
    if (error) return fail(error);
    return (await requireSessionCookie()) ?? { ok: true };
  } catch (e) {
    return fromNetwork(e);
  }
}

/**
 * Join Path A (ADR-PROD-001 / identity MODULE.md): email only → sign-in OTP.
 * Constant-shape outcome (no email oracle).
 */
export async function join(email: string): Promise<Result> {
  await withAuthTimeout(authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })).catch(() => undefined);
  return { ok: true, message: CONSTANT_OTP_SENT };
}

/** Consume join OTP — creates user + session when the email is new (Path A). */
export async function verifyJoin(email: string, otp: string): Promise<Result> {
  try {
    const { error } = await withAuthTimeout(authClient.signIn.emailOtp({ email, otp }));
    if (error) return fail(error);
    // Without a SecureStore cookie, set-password's POST /v1/account/password is 401 "Please sign in."
    return (await requireSessionCookie()) ?? { ok: true };
  } catch (e) {
    return fromNetwork(e);
  }
}

export async function resendCode(email: string, purpose: AuthPurpose): Promise<Result> {
  try {
    const type = purpose === "reset" ? "forget-password" : "sign-in";
    const { error } = await withAuthTimeout(authClient.emailOtp.sendVerificationOtp({ email, type }));
    return error ? fail(error) : { ok: true };
  } catch (e) {
    return fromNetwork(e);
  }
}

/** Forgot password: request a reset code. Constant-shape outcome. */
export async function requestReset(email: string): Promise<Result> {
  await withAuthTimeout(authClient.emailOtp.sendVerificationOtp({ email, type: "forget-password" })).catch(
    () => undefined,
  );
  return { ok: true, message: CONSTANT_RESET_SENT };
}

/** Reset with code + new password, then sign in so the member lands in the gate. */
export async function resetPassword(email: string, otp: string, password: string): Promise<Result> {
  try {
    const { error } = await withAuthTimeout(authClient.emailOtp.resetPassword({ email, otp, password }));
    if (error) return fail(error);
    const signedIn = await withAuthTimeout(authClient.signIn.email({ email, password }));
    if (signedIn.error) return fail(signedIn.error);
    return (await requireSessionCookie()) ?? { ok: true };
  } catch (e) {
    return fromNetwork(e);
  }
}

/** First-time password after Path A OTP session — club route, not Better Auth client setPassword. */
export async function setPassword(newPassword: string): Promise<Result> {
  const missing = await requireSessionCookie();
  if (missing) return missing;
  const result = await postAccountPassword(newPassword);
  if (!result.ok) {
    if (result.code === "UNAUTHORIZED" || result.status === 401) {
      return { ok: false, message: SESSION_NOT_READY, code: "UNAUTHORIZED" };
    }
    return { ok: false, message: result.message, code: result.code };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await clearLocalSession();
  await withAuthTimeout(authClient.signOut()).catch(() => undefined);
}

/** Account deletion (Apple 5.1.1(v)); the confirmation sheet re-asks the password before calling this. */
export async function deleteAccount(): Promise<Result> {
  try {
    await clearLocalSession();
    const { error } = await withAuthTimeout(authClient.deleteUser({}));
    return error ? fail(error) : { ok: true };
  } catch (e) {
    return fromNetwork(e);
  }
}

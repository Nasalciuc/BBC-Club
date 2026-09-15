import { authClient } from "./client";
import { authMessage, CONSTANT_OTP_SENT, CONSTANT_RESET_SENT } from "@bbc/shared/auth-messages";
import { postAccountPassword } from "@/lib/api";
import type { AuthPurpose } from "@/lib/auth-purpose";

type Result = { ok: true; message?: string } | { ok: false; message: string; code?: string };

function fail(err: { code?: string; message?: string } | null | undefined): Result {
  return { ok: false, message: authMessage(err?.code), code: err?.code };
}

/** Sign In: email + password. */
export async function signIn(email: string, password: string): Promise<Result> {
  const { error } = await authClient.signIn.email({ email, password });
  return error ? fail(error) : { ok: true };
}

/**
 * Join Path A (ADR-PROD-001 / identity MODULE.md): email only → sign-in OTP.
 * Constant-shape outcome (no email oracle).
 */
export async function join(email: string): Promise<Result> {
  await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }).catch(() => undefined);
  return { ok: true, message: CONSTANT_OTP_SENT };
}

/** Consume join OTP — creates user + session when the email is new (Path A). */
export async function verifyJoin(email: string, otp: string): Promise<Result> {
  const { error } = await authClient.signIn.emailOtp({ email, otp });
  return error ? fail(error) : { ok: true };
}

export async function resendCode(email: string, purpose: AuthPurpose): Promise<Result> {
  const type = purpose === "reset" ? "forget-password" : "sign-in";
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type });
  return error ? fail(error) : { ok: true };
}

/** Forgot password: request a reset code. Constant-shape outcome. */
export async function requestReset(email: string): Promise<Result> {
  await authClient.emailOtp.sendVerificationOtp({ email, type: "forget-password" }).catch(() => undefined);
  return { ok: true, message: CONSTANT_RESET_SENT };
}

/** Reset with code + new password, then sign in so the member lands in the gate. */
export async function resetPassword(email: string, otp: string, password: string): Promise<Result> {
  const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
  if (error) return fail(error);
  const signedIn = await authClient.signIn.email({ email, password });
  return signedIn.error ? fail(signedIn.error) : { ok: true };
}

/** First-time password after Path A OTP session — club route, not Better Auth client setPassword. */
export async function setPassword(newPassword: string): Promise<Result> {
  const result = await postAccountPassword(newPassword);
  if (!result.ok) return { ok: false, message: result.message, code: result.code };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}

/** Account deletion (Apple 5.1.1(v)); the confirmation sheet re-asks the password before calling this. */
export async function deleteAccount(): Promise<Result> {
  const { error } = await authClient.deleteUser({});
  return error ? fail(error) : { ok: true };
}

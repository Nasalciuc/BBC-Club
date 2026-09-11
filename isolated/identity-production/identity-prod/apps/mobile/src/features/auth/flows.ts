import { authClient } from "./client";
import { authMessage, CONSTANT_OTP_SENT, CONSTANT_RESET_SENT } from "@bbc/shared/auth-messages";

type Result = { ok: true; message?: string } | { ok: false; message: string; code?: string };

function fail(err: { code?: string; message?: string } | null | undefined): Result {
  return { ok: false, message: authMessage(err?.code), code: err?.code };
}

/** Sign In: email + password. */
export async function signIn(email: string, password: string): Promise<Result> {
  const { error } = await authClient.signIn.email({ email, password });
  return error ? fail(error) : { ok: true };
}

/** Join: create the account and let the server send the verification code.
 *  Constant-shape outcome: the UI shows CONSTANT_OTP_SENT whether the email is new or not. */
export async function join(email: string, password: string): Promise<Result> {
  const { error } = await authClient.signUp.email({ email, password, name: "" });
  if (error && error.code !== "USER_ALREADY_EXISTS") return fail(error);
  if (error?.code === "USER_ALREADY_EXISTS") {
    // Existing account: send a sign-in code instead of revealing existence.
    await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }).catch(() => undefined);
  }
  return { ok: true, message: CONSTANT_OTP_SENT };
}

/** Verify the code sent at sign-up. autoSignInAfterVerification → session established. */
export async function verifyEmail(email: string, otp: string): Promise<Result> {
  const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
  return error ? fail(error) : { ok: true };
}

export async function resendCode(email: string, type: "email-verification" | "forget-password"): Promise<Result> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type });
  return error ? fail(error) : { ok: true };
}

/** Forgot password: request a reset code. Constant-shape outcome. */
export async function requestReset(email: string): Promise<Result> {
  await authClient.emailOtp.sendVerificationOtp({ email, type: "forget-password" }).catch(() => undefined);
  return { ok: true, message: CONSTANT_RESET_SENT };
}

/** Reset with code + new password, then sign in so the member lands in the feed. */
export async function resetPassword(email: string, otp: string, password: string): Promise<Result> {
  const { error } = await authClient.emailOtp.resetPassword({ email, otp, password });
  if (error) return fail(error);
  const signedIn = await authClient.signIn.email({ email, password });
  return signedIn.error ? fail(signedIn.error) : { ok: true };
}

export async function signOut(): Promise<void> { await authClient.signOut(); }

/** Account deletion (Apple 5.1.1(v)); the confirmation sheet re-asks the password before calling this. */
export async function deleteAccount(): Promise<Result> {
  const { error } = await authClient.deleteUser({});
  return error ? fail(error) : { ok: true };
}

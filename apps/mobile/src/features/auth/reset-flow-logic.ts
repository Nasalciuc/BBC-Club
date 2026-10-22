/** Codes that say the reset code itself no longer works: a new one is asked for on Verify, where its boxes are. */
const CODE_PROBLEMS = new Set(["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]);

/** The reset succeeded but the sign-in with the new password after it did not (flows.ts resetPassword). */
export const RESET_DONE_SIGN_IN = "RESET_DONE_SIGN_IN";
/** Sign in's notice then: /sign-in/email allows 5 tries per 10 min per IP, which the wrong ones before may have used. */
export const RESET_DONE_NOTICE = "Your new password is set. Sign in with it in a few minutes.";

/**
 * Where set-password leaves the member after a failed reset (Forgot password). `stay`: the message under the field and
 * the code kept for the next Continue — a refused password (breached, too short), no connection, a limit. `verify`:
 * back to Verify with the same email, Resend open at once and words for why (verify-code-logic.ts afterResetNotice) —
 * never the code in the params. `signIn`: the password is set and the code spent; Sign in, with RESET_DONE_NOTICE.
 * Only a missing email goes to Sign in otherwise, and set-password decides that before asking.
 */
export function nextAfterResetFailure(code: string | undefined): "stay" | "verify" | "signIn" {
  if (code === RESET_DONE_SIGN_IN) return "signIn";
  return code !== undefined && CODE_PROBLEMS.has(code) ? "verify" : "stay";
}

/** set-password's word to Verify when the reset found the code expired and it asked for a new one, which did not go. */
export const OTP_EXPIRED_UNSENT = "OTP_EXPIRED_UNSENT";

/**
 * The `notice` set-password hands Verify after a reset that refused the code. An expired code is replaced by
 * set-password itself, on the member's Continue (`sent`: whether that send went) — Verify never mails on its own because
 * of what its params say, since a link can open it with any.
 */
export function noticeForVerify(code: string, sent: boolean): string {
  if (code !== "OTP_EXPIRED") return code;
  return sent ? "OTP_EXPIRED" : OTP_EXPIRED_UNSENT;
}

/** Sign in's `notice` param: only one value has words. */
export function signInNotice(notice: string | undefined): string | null {
  return notice === "reset" ? RESET_DONE_NOTICE : null;
}

/** Codes that say the reset code itself no longer works: a new one is asked for on Verify, where its boxes are. */
const CODE_PROBLEMS = new Set(["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]);

/**
 * Where set-password leaves the member after a failed reset (Forgot password). `stay`: the message under the field and
 * the code kept for the next Continue — a refused password (breached, too short), no connection, a limit. `verify`:
 * back to Verify with the same email, Resend open at once and words for why (verify-code-logic.ts afterResetNotice) —
 * never the code in the params. Only a missing email goes to Sign in, and set-password decides that before asking.
 */
export function nextAfterResetFailure(code: string | undefined): "stay" | "verify" {
  return code !== undefined && CODE_PROBLEMS.has(code) ? "verify" : "stay";
}

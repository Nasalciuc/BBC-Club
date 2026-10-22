import { authMessage } from "@bbc/shared/auth-messages";

/**
 * Resend waits as long as the server does before it mails again: identity `otp-cooldown.ts` OTP_COOLDOWN_SECONDS (30;
 * the app cannot import server code). The per-IP send limit (10 per 15 min) stops abuse, and a 429 on Resend shows the
 * rate-limit copy (flows.ts resendCode).
 */
export const RESEND_SECONDS = 30;

/** When Resend opens, for a code asked for at `now` (ms). */
export function resendDeadline(now: number): number {
  return now + RESEND_SECONDS * 1000;
}

/** Whole seconds until Resend opens, on the wall clock: time spent in the Mail app counts. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** The code was tried five times: better-auth deleted it (403 TOO_MANY_ATTEMPTS), and the server mails a new one on
 *  Resend. App-side words: the shared AUTH_MESSAGES copy says to wait, which does not help here. */
export const TOO_MANY_ATTEMPTS_COPY = "That code was tried too many times. Ask for a new one below.";

/** What Verify does after the server refused a code. */
export type VerifyErrorPlan = {
  /** Ask for a new code now. */
  resend: boolean;
  /** Open Resend at once: the code is dead, and the member asks for the next one. */
  resendNow: boolean;
  /** Empty the six boxes: the code in them can no longer work. */
  clear: boolean;
  /** The app's own words, or null for the result's message. */
  message: string | null;
};

export function afterVerifyError(code: string | undefined): VerifyErrorPlan {
  if (code === "TOO_MANY_ATTEMPTS")
    return { resend: false, resendNow: true, clear: true, message: TOO_MANY_ATTEMPTS_COPY };
  // "That code has expired. We'll send you a new one." (shared AUTH_MESSAGES): Verify sends it, so the words are true.
  if (code === "OTP_EXPIRED") return { resend: true, resendNow: false, clear: true, message: null };
  return { resend: false, resendNow: false, clear: false, message: null };
}

/** Back from set-password: the code passed Verify's check but the reset refused it (it was replaced, or used up). */
export const CODE_NO_LONGER_WORKS = "That code no longer works. Ask for a new one below.";

/**
 * Verify opened by set-password after a reset refused the code (reset-flow-logic.ts): the `notice` param names why —
 * a code, never the OTP itself. Each known one is handled as on Verify itself; any other value changes nothing.
 */
export function afterResetNotice(notice: string | undefined): VerifyErrorPlan | null {
  if (notice === "INVALID_OTP") return { resend: false, resendNow: true, clear: true, message: CODE_NO_LONGER_WORKS };
  if (notice === "OTP_EXPIRED") return { ...afterVerifyError(notice), message: authMessage("OTP_EXPIRED") };
  if (notice === "TOO_MANY_ATTEMPTS") return afterVerifyError(notice);
  return null;
}

export function formatResendCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

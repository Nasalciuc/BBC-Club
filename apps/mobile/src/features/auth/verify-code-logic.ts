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

export function formatResendCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

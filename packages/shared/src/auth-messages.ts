/** Better Auth error codes → the club's voice. One file, every screen imports from here.
 *  Codes we deliberately do NOT surface verbatim: USER_ALREADY_EXISTS / USER_NOT_FOUND (membership oracle). */
export const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That doesn't match what we have. Try again, or reset your password.",
  INVALID_EMAIL: "Please enter a valid email address.",
  PASSWORD_TOO_SHORT: "Your password needs at least 8 characters.",
  PASSWORD_COMPROMISED: "This password has appeared in a data breach. Please choose a different one.",
  INVALID_OTP: "That code isn't right. Try again.",
  OTP_EXPIRED: "That code has expired. We'll send you a new one.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a few minutes and try again.",
  EMAIL_NOT_VERIFIED: "Please verify your email first — we've sent you a code.",
  RATE_LIMITED: "Let's slow down for a moment. Please try again shortly.",
  NETWORK: "We couldn't reach the club. Check your connection and try again.",
  UNKNOWN: "Something didn't go as planned. Please try again.",
};
/** Constant-shape copy used regardless of whether the email exists (no oracle). */
export const CONSTANT_OTP_SENT = "If this email is new to us, you'll receive a code shortly.";
export const CONSTANT_RESET_SENT = "If we have this email on file, a code is on its way.";

export function authMessage(code?: string | null, fallback = AUTH_MESSAGES.UNKNOWN): string {
  if (!code) return fallback;
  return AUTH_MESSAGES[code] ?? fallback;
}

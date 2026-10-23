/**
 * Holds a reset OTP in process memory only.
 * Must never be written to route params, SecureStore, or logs — Expo Router
 * serializes params into the URL (web) and persisted navigation state (all platforms).
 */
let pendingOtp: string | null = null;

export function setPendingOtp(value: string) {
  pendingOtp = value;
}

/** Returns the held code and keeps it: set-password reads it for each Continue and clears it once the reset is done
 *  (or the screen goes). */
export function peekPendingOtp(): string | null {
  return pendingOtp;
}

/** Returns the held code and clears it. */
export function takePendingOtp(): string | null {
  const value = pendingOtp;
  pendingOtp = null;
  return value;
}

export function clearPendingOtp() {
  pendingOtp = null;
}

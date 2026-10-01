/** Which confirmation the member sees after a request. Frames: Offer 135:856 · Search 476:8871 · saved offline 135:855. */
export type RequestSource = "offer" | "search";
export type ConfirmationKind = "offer" | "search" | "saved";
export function confirmationKind(source: RequestSource, queuedOffline: boolean): ConfirmationKind {
  return queuedOffline ? "saved" : source;
}

/** Minutes to show on the "too many requests" screen (frame 481:9061). Retry-After is seconds; never show 0 or a fraction. */
export function retryMinutes(retryAfterS: number | undefined): number {
  if (retryAfterS === undefined || !Number.isFinite(retryAfterS) || retryAfterS <= 0) return 1;
  return Math.max(1, Math.ceil(retryAfterS / 60));
}

/** Call buttons exist only when a verified support number is configured (EXPO_PUBLIC_SUPPORT_PHONE) — the rule since #39. */
export function telHref(phone: string | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return digits.length >= 8 ? `tel:${digits}` : null;
}

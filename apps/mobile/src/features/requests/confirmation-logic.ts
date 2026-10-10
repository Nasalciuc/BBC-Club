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

/**
 * Why a request's details cannot go, in the sheet's own words — the first problem only, calmly, with what to do
 * (DESIGN.md, Product Content). Checked before a request is sent or saved on the phone: a request saved with details
 * the server refuses could never leave it.
 */
export function bodyProblem(issues: readonly { path: readonly (string | number)[]; message: string }[]): string | null {
  const first = issues[0];
  if (!first) return null;
  const where = first.path.join(".");
  if (where === "contact.name") return "Add your name, so your specialist knows who to ask for.";
  if (where === "contact.email") return "Add an email address we can write to.";
  if (where === "contact.phone") return first.message;
  if (where === "note") return "Keep the note under 500 characters.";
  if (where.startsWith("legs")) return "Check your dates and try again.";
  return first.message;
}

/** The words a request's state shows (Figma 26:20) — pure, so it is tested without React Native. */
export const STATUS_COPY = {
  received: "Received",
  quote_ready: "Quote ready",
  booked: "Booked",
  not_sent: "Not sent",
} as const;

/** A badge's state. The API's `quoted` is Quote ready. */
export type BadgeStatus = keyof typeof STATUS_COPY;

/** The badge a status reads as: `quoted` is Quote ready; anything else unknown reads as Received, and says so. Own keys
 *  only — `toString` or `constructor` is no state. */
export function badgeOf(status: string): { badge: BadgeStatus; known: boolean } {
  const normalized = status === "quoted" ? "quote_ready" : status;
  return Object.prototype.hasOwnProperty.call(STATUS_COPY, normalized)
    ? { badge: normalized as BadgeStatus, known: true }
    : { badge: "received", known: false };
}

/** The words a badge shows for a status — for a card's spoken label. */
export function statusCopy(status: string): string {
  return STATUS_COPY[badgeOf(status).badge];
}

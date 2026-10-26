/** The words a request's state shows (component sheet 41) — pure, so it is tested without React Native. */
export const STATUS_COPY = {
  received: "Received",
  quote_ready: "Quote ready",
  booked: "Booked",
  closed: "Closed",
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

/** A step of a request's progress (sheet 41, the horizontal stepper): `done` — reached; `current` — where the request
 *  is; `todo` — still to come. */
export type StepState = "done" | "current" | "todo";

export type TimelineStep = {
  /** For the step's testID (`request.timeline.quoted`). */
  key: string;
  /** `Received`, `Quote ready`, `Booked`. */
  label: string;
  /** `Oct 16`: the day the step was reached, in the phone's zone; null — not reached, or not on record. */
  date: string | null;
  state: StepState;
};

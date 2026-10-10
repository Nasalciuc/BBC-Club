import type { BadgeStatus } from "@bbc/ui/status-copy";

/** One mapping for the requests list and the detail screen — pure, so it is tested without React Native. */

export type RequestBadge = BadgeStatus;

/**
 * What a request's detail shows, per Figma's frames (233:4248 received, 325:8136 specialist review, 233:4171 quote
 * ready, 233:4388 booked, 325:8229 closed, 325:8295 not sent).
 */
export type RequestView = {
  badge: RequestBadge | null;
  showTimeline: boolean;
  /** Status handed to Timeline. `queued` keeps every step hollow. */
  timelineStatus: string;
  sentence: string | null;
  /** Current-step caption the frames actually show. Null when the frame has none. */
  caption: string | null;
  closedLine: string | null;
  /** `REQUEST PROGRESS` over the timeline: received, quote ready, booked — not specialist review, not a request that
   *  has not reached a specialist. */
  progressLabel: boolean;
  /** `WE WILL CALL`, the member's number and the booking note: received and quote ready (233:4242). */
  callback: boolean;
  /** The call itself. `specialist` — `Call your specialist`, a white pill on a hairline (296:5916), once a quote is
   *  ready. `us` — a request we could not pass on: the member calls us, the screen's one filled button. */
  call: "specialist" | "us" | null;
  /** `Send now` (325:8384): a request still on the phone that may still go out. */
  sendNow: boolean;
  /** 16 pt between the detail's groups on the not-sent frame (325:8295), 24 pt on the others. */
  compact: boolean;
};

/** Figma 325:8295, for a request that waits on the phone. */
export const NOT_SENT = "Saved on your phone. It goes out when you’re back online.";

/** A request that will not go out by itself: the server gave up passing it on (six attempts, ADR-IMPL-042), or refused
 *  the copy on the phone for good. No frame draws it; the words point at the one thing left to do. */
export const NOT_PASSED_ON = "We couldn’t pass this on. Call us and we’ll take it from here.";

/** When the request was closed: its latest `closed` event (a request reopened and closed again shows the second
 *  date), or null when the timeline has none — the creation date is not a closing date. */
export function closedAt(r: { timeline: readonly { status: string; at: string }[] }): string | null {
  for (let k = r.timeline.length - 1; k >= 0; k--) {
    const event = r.timeline[k];
    if (event?.status === "closed") return event.at;
  }
  return null;
}

const NONE = {
  closedLine: null,
  progressLabel: false,
  callback: false,
  call: null,
  sendNow: false,
  compact: false,
} as const;

/**
 * The detail of a request in a given state. `queued` is a request waiting on the phone; `rejected` one the server
 * refused for good; `not_sent` one the server holds but gave up passing on. `timeZone` is for tests: the phone's own
 * zone otherwise.
 */
export function requestView(status: string, at?: string | null, timeZone?: string): RequestView {
  switch (status) {
    case "received":
      return {
        ...NONE,
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: "We have your request. A specialist will call shortly to discuss your flight.",
        caption: "We have your travel details.",
        progressLabel: true,
        callback: true,
      };
    case "assigned":
      // Figma 325:8136: the sentence and the timeline — no section name, no number to call yet.
      return {
        ...NONE,
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: "A specialist is reviewing your request.",
        caption: "A specialist will call you shortly.",
      };
    case "quoted":
      return {
        ...NONE,
        badge: "quote_ready",
        showTimeline: true,
        timelineStatus: status,
        sentence: "Your quote is ready. A specialist will call shortly to confirm the details.",
        caption: "Review the quote with your specialist.",
        progressLabel: true,
        callback: true,
        call: "specialist",
      };
    case "booked":
      return {
        ...NONE,
        badge: "booked",
        showTimeline: true,
        timelineStatus: status,
        sentence: "Your specialist completed this booking by phone. Your itinerary was sent by email.",
        caption: "Your specialist confirms your flights.",
        progressLabel: true,
      };
    case "closed":
      return {
        ...NONE,
        badge: null,
        showTimeline: false,
        timelineStatus: status,
        sentence: "This request is closed.",
        caption: null,
        closedLine: closedLine(at, timeZone),
      };
    case "queued":
      return {
        ...NONE,
        badge: "not_sent",
        showTimeline: true,
        timelineStatus: "queued",
        sentence: NOT_SENT,
        caption: null,
        sendNow: true,
        compact: true,
      };
    case "not_sent":
    case "rejected":
      return {
        ...NONE,
        badge: "not_sent",
        showTimeline: true,
        timelineStatus: "queued",
        sentence: NOT_PASSED_ON,
        caption: null,
        call: "us",
        compact: true,
      };
    default:
      return {
        ...NONE,
        badge: "received",
        showTimeline: true,
        timelineStatus: status,
        sentence: null,
        caption: null,
      };
  }
}

/**
 * The line under the in-progress list (Figma 233:4639 · Just received, 240:5199 · Not sent). One request that was just
 * received is reassured; a request waiting on the phone is pointed at its `Send now`; one that will not go out by
 * itself, at the call. Nothing otherwise.
 */
export function listHints(open: readonly { status: string }[]): string[] {
  const waiting = open.filter((r) => r.status === "queued").length;
  const stuck = open.filter((r) => r.status === "not_sent" || r.status === "rejected").length;
  const total = waiting + stuck;
  if (total > 0) {
    return [
      total === 1 ? "One request needs your attention." : `${total} requests need your attention.`,
      waiting > 0 ? "Open your request to check the details and try again." : "Call us and we’ll take it from here.",
    ];
  }
  if (open.length === 1 && open[0]?.status === "received") {
    return ["Your request is with us. A specialist will call shortly."];
  }
  return [];
}

/** `Closed · Oct 3`, in the phone's own zone — the day the member lived it, not the day in UTC. */
export function closedLine(at?: string | null, timeZone?: string): string {
  if (!at) return "Closed";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "Closed";
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
  return `Closed · ${date}`;
}

/** Requests whose quote is ready: the Requests tab's dot (DESIGN.md, 6 pt `accent-warm`). */
export function unreadQuotes(items: readonly { status: string }[]): number {
  return items.filter((r) => r.status === "quoted").length;
}

/** Profile's `Recent requests` (233:4453): the newest three by when they were made — the server lists requests in
 *  progress first (ADR-IMPL-042), which is the Requests tab's order, not recency. */
export function recentRequests<T extends { createdAt: string }>(items: readonly T[], n = 3): T[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, n);
}

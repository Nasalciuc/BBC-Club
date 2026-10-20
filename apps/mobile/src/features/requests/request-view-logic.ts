import type { BadgeStatus, StepState, TimelineStep } from "@bbc/ui/status-copy";

/** One mapping for the requests list and the detail screen — pure, so it is tested without React Native. */

export type RequestBadge = BadgeStatus;

/** The message card under the request's progress (11, 30–33): what is happening, in a title and a line. */
export type RequestNotice = { title: string; body: string | null; icon: "phone" | "info" };

/**
 * What a request's detail shows, per the 3.0 images (11 quote ready, 30 received, 31 booked, 32 not sent, 33 closed)
 * and the states 1.0 drew that 3.0 keeps (just received, specialist review, not passed on).
 */
export type RequestView = {
  /** The request's state in words: the card's badge on Requests (09), and beside the title where `titleBadge`. */
  badge: RequestBadge;
  /** Beside the detail's title only for a request not sent or closed (32, 33): the steps say the others. */
  titleBadge: boolean;
  notice: RequestNotice | null;
  /** The line under the notice (`Review the quote with your specialist.`). */
  caption: string | null;
  closedLine: string | null;
  /** `We will call` with the member's number, and the booking note under it: received and quote ready (11, 30). */
  callback: boolean;
  /** `Your fare` — the fare the quote is for: a quote ready only (11). */
  fare: boolean;
  /** The call, the screen's one filled pill. `specialist` — `Call your specialist`, once a quote is ready (11). `us` — a
   *  request we could not pass on: the member calls us. A closed request offers none (ADR-IMPL-055 §9). */
  call: "specialist" | "us" | null;
  /** `Send now` (32): a request still on the phone that may still go out. */
  sendNow: boolean;
};

/** 32, for a request that waits on the phone. */
export const NOT_SENT: RequestNotice = {
  title: "Saved on your phone.",
  body: "It goes out when you’re back online.",
  icon: "phone",
};

/** A request that will not go out by itself: the server gave up passing it on (six attempts, ADR-IMPL-042), or refused
 *  the copy on the phone for good. No image draws it; the words point at the one thing left to do. */
export const NOT_PASSED_ON: RequestNotice = {
  title: "We couldn’t pass this on.",
  body: "Call us and we’ll take it from here.",
  icon: "phone",
};

/** When the request was closed: its latest `closed` event (a request reopened and closed again shows the second
 *  date), or null when the timeline has none — the creation date is not a closing date. */
export function closedAt(r: { timeline: readonly { status: string; at: string }[] }): string | null {
  return latestAt(r.timeline, "closed");
}

function latestAt(timeline: readonly { status: string; at: string }[], status: string): string | null {
  for (let k = timeline.length - 1; k >= 0; k--) {
    const event = timeline[k];
    if (event?.status === status) return event.at;
  }
  return null;
}

const NONE = {
  titleBadge: false,
  caption: null,
  closedLine: null,
  callback: false,
  fare: false,
  call: null,
  sendNow: false,
} as const;

/**
 * The detail's state for a request the server holds. A request received but not passed on to the specialists yet is
 * just received (30): its reference comes with the passing on, a minute or so after it was sent.
 */
export function serverState(r: { status: string; reference: string }): string {
  return r.status === "received" && r.reference.trim() === "" ? "just_received" : r.status;
}

/**
 * The detail of a request in a given state. `just_received` is a request the server holds but has not passed on yet
 * (serverState); `queued` one waiting on the phone; `rejected` one the server refused for good; `not_sent` one the
 * server holds but gave up passing on. `timeZone` is for tests: the phone's own zone otherwise.
 */
export function requestView(status: string, at?: string | null, timeZone?: string): RequestView {
  switch (status) {
    case "just_received":
      // 30: the shorter line, the number we call under it.
      return {
        ...NONE,
        badge: "received",
        notice: { title: "We have your request.", body: "A specialist will call shortly.", icon: "phone" },
        caption: "We have your travel details.",
        callback: true,
      };
    case "received":
      return {
        ...NONE,
        badge: "received",
        notice: {
          title: "We have your request.",
          body: "A specialist will call shortly to discuss your flight.",
          icon: "phone",
        },
        caption: "We have your travel details.",
        callback: true,
      };
    case "assigned":
      // A specialist has it: no number to call yet.
      return {
        ...NONE,
        badge: "received",
        notice: { title: "A specialist is reviewing your request.", body: null, icon: "phone" },
        caption: "A specialist will call you shortly.",
      };
    case "quoted":
      return {
        ...NONE,
        badge: "quote_ready",
        notice: {
          title: "Your quote is ready.",
          body: "A specialist will call shortly to confirm the details.",
          icon: "phone",
        },
        caption: "Review the quote with your specialist.",
        callback: true,
        fare: true,
        call: "specialist",
      };
    case "booked":
      return {
        ...NONE,
        badge: "booked",
        notice: {
          title: "Your specialist completed this booking by phone.",
          body: "Your itinerary was sent by email.",
          icon: "phone",
        },
        caption: "Your specialist confirms your flights.",
      };
    case "closed":
      // 33 without its call (ADR-IMPL-055 §9): the badge, the day it closed, the message.
      return {
        ...NONE,
        badge: "closed",
        titleBadge: true,
        notice: { title: "This request is closed.", body: null, icon: "info" },
        closedLine: closedLine(at, timeZone),
      };
    case "queued":
      return { ...NONE, badge: "not_sent", titleBadge: true, notice: NOT_SENT, sendNow: true };
    case "not_sent":
    case "rejected":
      return { ...NONE, badge: "not_sent", titleBadge: true, notice: NOT_PASSED_ON, call: "us" };
    default:
      return { ...NONE, badge: "received", notice: null };
  }
}

/** The timeline event a request's state is at: a request just received is at its `received`. */
const STEP_EVENT: Record<string, string> = {
  just_received: "received",
  received: "received",
  assigned: "assigned",
  quoted: "quoted",
  booked: "booked",
};

/**
 * The line under the message (11): what comes next, in the club's words — unless the specialist left a note on the
 * state the request is at. The note wins, the latest one, so a second quote's note replaces the first (ADR-IMPL-041).
 * A request closed, on the phone or not passed on is at no step: its line stays the club's.
 */
export function stepCaption(
  state: string,
  view: Pick<RequestView, "caption">,
  timeline: readonly { status: string; note?: string | null }[],
): string | null {
  const status = STEP_EVENT[state];
  if (status) {
    for (let k = timeline.length - 1; k >= 0; k--) {
      const event = timeline[k];
      if (event?.status !== status) continue;
      const note = event.note?.trim();
      if (note) return note;
      break;
    }
  }
  return view.caption;
}

/** `Oct 16`, in the phone's own zone — the day the member lived it. Null for a time that does not parse. */
export function shortDay(at: string | null | undefined, timeZone?: string): string | null {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
}

type Timed = { status: string; at: string };

/**
 * The three steps of a request's progress (11, 30–33): Received, Quote ready, Booked — each reached step with its day
 * from the timeline (`Received` from the request's own day when the timeline has no event for it). A request the
 * server holds is at least received; one still on the phone has reached none. A closed request keeps the steps it
 * reached and is at none of them: the badge and the message say it is closed.
 */
export function progressSteps(
  state: string,
  r: { createdAt: string; timeline: readonly Timed[] },
  timeZone?: string,
): TimelineStep[] {
  const day = (status: string) => shortDay(latestAt(r.timeline, status), timeZone);
  const receivedDay = shortDay(r.timeline.find((e) => e.status === "received")?.at ?? r.createdAt, timeZone);
  const states = stepStates(state, r.timeline);
  return [
    { key: "received", label: "Received", date: states[0] === "todo" ? null : receivedDay, state: states[0] },
    { key: "quoted", label: "Quote ready", date: states[1] === "todo" ? null : day("quoted"), state: states[1] },
    { key: "booked", label: "Booked", date: states[2] === "todo" ? null : day("booked"), state: states[2] },
  ];
}

function stepStates(state: string, timeline: readonly Timed[]): [StepState, StepState, StepState] {
  switch (state) {
    case "queued":
    case "not_sent":
    case "rejected":
      return ["todo", "todo", "todo"];
    case "quoted":
      return ["done", "current", "todo"];
    case "booked":
      return ["done", "done", "done"];
    case "closed": {
      const booked = timeline.some((e) => e.status === "booked");
      const quoted = booked || timeline.some((e) => e.status === "quoted");
      return ["done", quoted ? "done" : "todo", booked ? "done" : "todo"];
    }
    default:
      // Received, just received, a specialist reviewing it — and a state this app does not know yet.
      return ["current", "todo", "todo"];
  }
}

/**
 * The card over the list (28): requests on the phone or not passed on, which need the member. A request waiting on the
 * phone is pointed at its `Send now`; one that will not go out by itself, at the call. Null otherwise.
 */
export function listAttention(open: readonly { status: string }[]): { title: string; body: string } | null {
  const waiting = open.filter((r) => r.status === "queued").length;
  const stuck = open.filter((r) => r.status === "not_sent" || r.status === "rejected").length;
  const total = waiting + stuck;
  if (total === 0) return null;
  return {
    title: total === 1 ? "One request needs your attention." : `${total} requests need your attention.`,
    body:
      waiting > 0 ? "Open your request to check the details and try again." : "Call us and we’ll take it from here.",
  };
}

/** `Closed · Oct 3`, in the phone's own zone — the day the member lived it, not the day in UTC. */
export function closedLine(at?: string | null, timeZone?: string): string {
  const day = shortDay(at, timeZone);
  return day ? `Closed · ${day}` : "Closed";
}

/** Requests whose quote is ready: the Requests tab's dot (DESIGN.md, a 6-pt navy dot). */
export function unreadQuotes(items: readonly { status: string }[]): number {
  return items.filter((r) => r.status === "quoted").length;
}

/** Profile's `My trips` (12): the newest by when they were made — the server lists requests in progress first
 *  (ADR-IMPL-042), which is the Requests tab's order, not recency. */
export function recentRequests<T extends { createdAt: string }>(items: readonly T[], n = 6): T[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, n);
}

/** The status filters of Requests (09): All, then one per badge a member can pick. */
export type RequestFilter = "all" | "quote_ready" | "received" | "booked" | "closed";

export const REQUEST_FILTERS: readonly { key: RequestFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "quote_ready", label: "Quote ready" },
  { key: "received", label: "Received" },
  { key: "booked", label: "Booked" },
  { key: "closed", label: "Closed" },
];

/** A card shows under a filter when its badge is the filter's; All shows every card, requests not sent included. */
export function inFilter(filter: RequestFilter, badge: RequestBadge): boolean {
  return filter === "all" || filter === badge;
}

/** Under a filter with no card: what there is none of, calmly. */
export function filterEmptyLine(filter: Exclude<RequestFilter, "all">): string {
  switch (filter) {
    case "quote_ready":
      return "No quotes are ready yet.";
    case "received":
      return "No requests are waiting for a quote.";
    case "booked":
      return "No bookings yet.";
    case "closed":
      return "No closed requests.";
  }
}

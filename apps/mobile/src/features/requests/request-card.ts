import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { requestDates, requestRoute } from "@bbc/shared/requests/display";
import { statusCopy } from "@bbc/ui/status-copy";

import { closedAt, requestView, type RequestBadge } from "./request-view-logic";

/**
 * What a request card and a request's detail say (Figma 233:4069, 233:4171, 233:4453) — pure, so it is tested without
 * React Native. A request still on the phone is read with the server's own functions (`@bbc/shared/requests/display`),
 * so the two never drift.
 */

type Leg = { from: string; to: string; date: string };
type TripType = "round" | "oneway" | "multi";
type Passengers = { adult: number; child: number; infant: number };

/** Figma 240:5199: the second line of a card whose request waits on the phone to go out. */
export const NOT_SENT_LINE = "Your travel details are saved";

function count(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/** `1 ADULT`, `2 ADULTS · 1 CHILD · 1 INFANT`. */
export function travelersLine(p: Passengers): string {
  return [count(p.adult, "adult", "adults"), count(p.child, "child", "children"), count(p.infant, "infant", "infants")]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
}

type CardSource = Pick<RequestVM, "route" | "cabin" | "dates" | "passengers"> & { city?: string | null };

/**
 * The card's title: the destination's city; the route when the server named none (an older server). Never a route that
 * comes back where it started — an older server read every round trip as `JFK → JFK`.
 */
export function requestTitle(r: { city?: string | null; route: string }): string {
  const city = r.city?.trim();
  if (city) return city;
  const [from, to] = r.route.split(" → ");
  if (from && to && from !== to) return r.route;
  return "Your request";
}

/** `JFK → LHR · BUSINESS` */
export function cardFacts(r: Pick<RequestVM, "route" | "cabin">): string {
  return [r.route, r.cabin === "first" ? "First" : "Business"].filter(Boolean).join(" · ").toUpperCase();
}

/**
 * Figma 233:4069: `London` · `JFK → LHR · BUSINESS` · `OCT 12–19 · 1 ADULT`. A request waiting on the phone says so on
 * its second line (240:5199); a closed one says when it closed.
 */
export function cardLines(
  r: CardSource,
  state: { waiting?: boolean; closedLine?: string | null } = {},
): { title: string; facts: string; when: string } {
  const when = state.waiting
    ? NOT_SENT_LINE
    : state.closedLine
      ? state.closedLine.toUpperCase()
      : [r.dates, travelersLine(r.passengers)].filter(Boolean).join(" · ").toUpperCase();
  return { title: requestTitle(r), facts: cardFacts(r), when };
}

const MONTH_NAMES: Record<string, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

/** `Oct 30–Nov 6` read aloud: `October 30 to November 6`. */
function spokenDates(dates: string): string {
  return dates
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTH_NAMES[m] ?? m)
    .replace(/–/g, " to ");
}

/** A line read mid-sentence: `Closed, October 3` → `closed, October 3` — the month keeps its capital. */
function midSentence(line: string): string {
  return line.charAt(0).toLowerCase() + line.slice(1);
}

/**
 * What a screen reader says for a card, in words rather than the printed mono lines: `London, quote ready, JFK to LHR,
 * business, October 12 to 19, 1 adult` — never "right arrow" or "middle dot".
 */
export function spokenCard(
  r: CardSource,
  state: { badge: RequestBadge | null; waiting?: boolean; closedLine?: string | null },
): string {
  const when = state.waiting
    ? NOT_SENT_LINE.toLowerCase()
    : state.closedLine
      ? midSentence(spokenDates(state.closedLine).replace(" · ", ", "))
      : [spokenDates(r.dates), travelersLine(r.passengers).replace(/ · /g, ", ").toLowerCase()]
          .filter(Boolean)
          .join(", ");
  return [
    // A title that fell back to the route is read as words too.
    requestTitle(r).replace(/ → /g, " to "),
    state.badge ? statusCopy(state.badge).toLowerCase() : null,
    r.route.replace(/ → /g, " to "),
    r.cabin === "first" ? "first" : "business",
    when,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Everything a card shows for a request, wherever it is listed (Requests, Profile): its lines, its badge and what a
 * screen reader says — a closed request says when it closed (in the phone's zone; `timeZone` is for tests) and has no
 * badge. A request still on the phone passes `onPhone`, as its detail reads it: only one waiting to go (`queued`) says
 * its details are saved (240:5199). One that will not go out by itself — refused for good (`rejected`), or held by a
 * server that gave up passing it on (`not_sent`) — keeps its dates and its `Not sent` badge: its detail says "We
 * couldn’t pass this on" and offers the call.
 */
export function requestCard(
  r: CardSource & Pick<RequestVM, "status" | "createdAt" | "timeline">,
  timeZone?: string,
  onPhone?: "queued" | "rejected",
): {
  title: string;
  facts: string;
  when: string;
  badge: RequestBadge | null;
  spoken: string;
} {
  const status = onPhone ?? r.status;
  const view = requestView(status, closedAt(r), timeZone);
  const state = { waiting: status === "queued", closedLine: view.closedLine };
  return {
    ...cardLines(r, state),
    badge: view.badge,
    spoken: spokenCard(r, { ...state, badge: view.badge }),
  };
}

/** Figma 233:4171: `JFK → LHR · OCT 12–19 · ROUND TRIP · 1 ADULT` (a one-way trip names no trip type, 233:4248). */
export function detailFacts(r: Pick<RequestVM, "route" | "dates" | "passengers"> & { tripType?: TripType }): string {
  const trip = r.tripType === "round" ? "Round trip" : r.tripType === "multi" ? "Multi-city" : null;
  return [r.route, r.dates, trip, travelersLine(r.passengers)].filter(Boolean).join(" · ").toUpperCase();
}

/** A request still on the phone (offline queue), read as the server would answer it. */
export function queuedView(q: {
  id: string;
  enqueuedAt: string;
  city?: string | null;
  body: {
    tripType: TripType;
    cabin: RequestVM["cabin"];
    legs: Leg[];
    passengers: Passengers;
    priceAtRequest?: number | null;
    contact: { phone: string };
  };
}): RequestVM {
  return {
    id: q.id,
    reference: "",
    route: requestRoute(q.body.legs, q.body.tripType),
    city: q.city ?? null,
    tripType: q.body.tripType,
    phone: q.body.contact.phone || null,
    dates: requestDates(q.body.legs),
    cabin: q.body.cabin,
    passengers: q.body.passengers,
    priceAtRequest: q.body.priceAtRequest ?? null,
    status: "not_sent",
    createdAt: q.enqueuedAt,
    timeline: [],
  };
}

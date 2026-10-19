import type { RequestVM } from "@bbc/shared/api/v1/requests";
import { requestDates, requestRoute } from "@bbc/shared/requests/display";
import { statusCopy } from "@bbc/ui/status-copy";

import { closedAt, requestView, type RequestBadge } from "./request-view-logic";

/**
 * What a request card and a request's detail say (09, 11, 28, 30–33) — pure, so it is tested without React Native. A
 * request still on the phone is read with the server's own functions (`@bbc/shared/requests/display`), so the two never
 * drift.
 */

type Leg = { from: string; to: string; date: string };
type TripType = "round" | "oneway" | "multi";
type Passengers = { adult: number; child: number; infant: number };

/** 28: the line of a card whose request waits on the phone to go out. */
export const NOT_SENT_LINE = "Your travel details are saved";

function count(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/** `1 adult`, `2 adults · 1 child · 1 infant`. */
export function travelersText(p: Passengers): string {
  return [count(p.adult, "adult", "adults"), count(p.child, "child", "children"), count(p.infant, "infant", "infants")]
    .filter(Boolean)
    .join(" · ");
}

/** `Round trip`, `One way`, `Multi-city`; null when an older server did not say. */
export function tripText(tripType: TripType | undefined): string | null {
  if (tripType === "round") return "Round trip";
  if (tripType === "oneway") return "One way";
  if (tripType === "multi") return "Multi-city";
  return null;
}

/**
 * The server's days with room around the dash, as the images write them (09: `Nov 12 – 19`): `Oct 12–19` → `Oct 12 –
 * 19`, `Oct 30–Nov 6` → `Oct 30 – Nov 6`. The server gives no year (ADR-IMPL-055 report); none is guessed here.
 */
export function spacedDates(dates: string): string | null {
  const trimmed = dates.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s*–\s*/g, " – ");
}

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

/** The airports a route joins (`JFK → LHR`); null when the route says nothing usable. */
export function routeCodes(route: string): { from: string; to: string } | null {
  const [from, to] = route.split(" → ").map((s) => s.trim());
  return from && to && /^[A-Z]{3}$/.test(from) && /^[A-Z]{3}$/.test(to) ? { from, to } : null;
}

/**
 * The detail's title (11): `New York to London` — the origin's city, which the request does not carry, looked up by
 * its code; the code while it is unknown (`JFK to London`). The card's title when the destination's city is unknown.
 */
export function detailTitle(r: { city?: string | null; route: string }, originCity: string | null): string {
  const city = r.city?.trim();
  const codes = routeCodes(r.route);
  if (!city || !codes) return requestTitle(r);
  return `${originCity?.trim() || codes.from} to ${city}`;
}

/** Between two facts on a request's page: the dot with two spaces either side, as 11 and 30–33 set it. */
export const DETAIL_SEPARATOR = "  ·  ";

/**
 * The facts under the detail's title (11, 30–33): the days and the trip; then the route, the airline the request was
 * made for — where the server recorded one (ADR-IMPL-056) — and the travelers. The images print no cabin there.
 */
export function detailLines(
  r: Pick<RequestVM, "route" | "dates" | "passengers"> & {
    tripType?: TripType;
    carrier?: { name: string } | null;
  },
): string[] {
  const first = [spacedDates(r.dates), tripText(r.tripType)].filter(Boolean).join(DETAIL_SEPARATOR);
  const second = [r.route, r.carrier?.name?.trim() || null, travelersText(r.passengers)]
    .filter(Boolean)
    .join(DETAIL_SEPARATOR);
  return [first, second].filter(Boolean);
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

/** `Oct 30 – Nov 6` read aloud: `October 30 to November 6`. */
export function spokenDates(dates: string): string {
  return dates
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTH_NAMES[m] ?? m)
    .replace(/\s*–\s*/g, " to ");
}

type CardSource = Pick<RequestVM, "route" | "dates" | "passengers"> & { city?: string | null; tripType?: TripType };

export type RequestCardModel = {
  city: string;
  route: string;
  dates: string | null;
  trip: string | null;
  travelers: string | null;
  /** `Your travel details are saved`: a request waiting on the phone (28). */
  note: string | null;
  badge: RequestBadge;
  /** What a screen reader says: words, never an arrow or a middle dot. */
  spoken: string;
  /** The destination's code, for its photograph. */
  to: string | null;
};

/**
 * Everything a card shows for a request (09, 28): the city, its state, the route, the days, the trip and the travelers.
 * A request still on the phone passes `onPhone`, as its detail reads it: only one waiting to go (`queued`) says its
 * details are saved. One that will not go out by itself — refused for good (`rejected`), or held by a server that gave
 * up passing it on (`not_sent`) — says nothing more: its detail says "We couldn’t pass this on" and offers the call.
 * `timeZone` is for tests.
 */
export function requestCard(
  r: CardSource & Pick<RequestVM, "status" | "createdAt" | "timeline">,
  timeZone?: string,
  onPhone?: "queued" | "rejected",
): RequestCardModel {
  const status = onPhone ?? r.status;
  const view = requestView(status, closedAt(r), timeZone);
  const note = status === "queued" ? NOT_SENT_LINE : null;
  const dates = spacedDates(r.dates);
  const trip = tripText(r.tripType);
  const travelers = travelersText(r.passengers) || null;
  const city = requestTitle(r);
  const spoken = [
    // A title that fell back to the route is read as words too.
    city.replace(/ → /g, " to "),
    statusCopy(view.badge).toLowerCase(),
    r.route.replace(/ → /g, " to "),
    dates ? spokenDates(dates) : null,
    note?.toLowerCase(),
    trip?.toLowerCase(),
    travelers?.replace(/ · /g, ", "),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    city,
    route: r.route,
    dates,
    trip,
    travelers,
    note,
    badge: view.badge,
    spoken,
    to: routeCodes(r.route)?.to ?? null,
  };
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
    dates: requestDates(q.body.legs, { year: true }),
    cabin: q.body.cabin,
    passengers: q.body.passengers,
    priceAtRequest: q.body.priceAtRequest ?? null,
    status: "not_sent",
    createdAt: q.enqueuedAt,
    timeline: [],
  };
}

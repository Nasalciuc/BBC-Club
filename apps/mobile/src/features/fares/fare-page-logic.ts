import { type FareVM, isCalendarDay } from "@bbc/shared/api/v1/fares";

import { formatPrice } from "../../lib/format";

type Fare = Pick<
  FareVM,
  "carrier" | "cabin" | "nonstop" | "durationMinutes" | "departAt" | "departLocal" | "departDate" | "price"
>;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const cabinWord = (cabin: "business" | "first") => (cabin === "first" ? "First" : "Business");

/** `OCT 12` for a day the calendar has (`isCalendarDay`); null for anything else — `2026-02-30`, `2026-13-01`, `12 Oct`. */
function namedDay(ymd: string | null | undefined): string | null {
  if (!ymd || !isCalendarDay(ymd)) return null;
  return `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}`;
}

/**
 * Figma 135:845: `British Airways · Business · Nonstop` — the airline, the cabin (not the product), the stops. The
 * catalog knows nonstop or not, never how many stops: a connecting fare says so without counting them.
 */
export function carrierLine(fare: Pick<Fare, "carrier" | "cabin" | "nonstop">): string {
  return `${fare.carrier.name} · ${cabinWord(fare.cabin)} · ${fare.nonstop ? "Nonstop" : "Connecting"}`;
}

/** `7H 05M`. */
export function durationLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, "0")}M`;
}

/**
 * The departure's day at the origin airport (`OCT 12`) — never the phone's zone, which would move a JFK evening
 * departure to the next day in Europe (ADR-IMPL-019). The server names the day from the airport's zone
 * (`departDate`); an older server's answer leaves it to the instant and the airport's wall clock, where the offset
 * that turns the one into the other is taken from −12 to +14 hours — the band a UTC+13 origin shares with UTC−11.
 */
export function departDayLabel(
  departAt: string | null,
  departLocal: string | null,
  departDate?: string | null,
): string | null {
  // A day the calendar has; anything else falls through to the instant and the clock.
  const named = namedDay(departDate);
  if (named) return named;
  if (!departAt) return null;
  const instant = new Date(departAt);
  if (Number.isNaN(instant.getTime())) return null;
  let offset = 0;
  const clock = departLocal ? /^(\d{2}):(\d{2})$/.exec(departLocal) : null;
  if (clock) {
    const local = Number(clock[1]) * 60 + Number(clock[2]);
    const utc = instant.getUTCHours() * 60 + instant.getUTCMinutes();
    offset = local - utc;
    if (offset > 14 * 60) offset -= 24 * 60;
    if (offset < -12 * 60) offset += 24 * 60;
  }
  const there = new Date(instant.getTime() + offset * 60_000);
  return `${MONTHS[there.getUTCMonth()]} ${there.getUTCDate()}`;
}

/** Figma 135:845: `OCT 12 · ONE WAY · 7H 05M` — a fare is one flight; what is not known is left out. */
export function factsLine(fare: Pick<Fare, "departAt" | "departLocal" | "departDate" | "durationMinutes">): string {
  const day = departDayLabel(fare.departAt, fare.departLocal, fare.departDate);
  const duration = fare.durationMinutes != null ? durationLabel(fare.durationMinutes) : null;
  return [day, "ONE WAY", duration].filter(Boolean).join(" · ");
}

/**
 * What the club's fare saves, in whole units — the difference of the two prices as the page prints them (each rounded
 * to the unit, as `formatPrice` prints it), so `$5,000 − $1,001` never reads `= $4,000`.
 */
export function savings(price: FareVM["price"]): number | null {
  if (price.published == null) return null;
  return Math.round(price.published) - Math.round(price.offer);
}

/** Figma 135:847: `$7,850 published − $4,200 your fare = $3,650 difference.` */
export function comparisonLine(price: FareVM["price"]): string | null {
  const saved = savings(price);
  if (price.published == null || saved == null) return null;
  const money = (n: number) => formatPrice(n, price.currency);
  return `${money(price.published)} published − ${money(price.offer)} your fare = ${money(saved)} difference.`;
}

/**
 * Figma 135:847's note: when the published fare was recorded, then the specialist's promise. The day is read from the
 * end of its source (`Sabre · 16 Sep`, `BA published · 16 September`); a source without one leaves the promise alone.
 */
export function aboutFareNote(fare: Pick<Fare, "carrier" | "price">): string {
  const promise = "Your specialist will confirm current availability and fare conditions before booking.";
  const match = /(\d{1,2})\s+([A-Za-z]{3,})\.?\s*$/.exec(fare.price.publishedSource ?? "");
  const month = match ? MONTH_NAMES.find((m) => m.toLowerCase().startsWith(match[2]!.toLowerCase().slice(0, 3))) : null;
  if (!match || !month) return promise;
  return `The published ${fare.carrier.name} fare was recorded on ${Number(match[1])} ${month}. ${promise}`;
}

/** What closed, as Figma 135:848 names it: the day, the route by its cities, the airline and cabin — what is known. */
export type ClosedFare = {
  from: string;
  to: string;
  fromCity?: string | null;
  toCity?: string | null;
  carrier?: string | null;
  cabin?: "business" | "first" | null;
  /** The departure's day at the origin, `YYYY-MM-DD`. */
  departDate?: string | null;
};

export function closedFareLines(fare: ClosedFare): { day: string; route: string; carrier: string | null } {
  const named = namedDay(fare.departDate);
  const day = named ? `${named} · ONE WAY` : "ONE WAY";
  const route = fare.fromCity && fare.toCity ? `${fare.fromCity} to ${fare.toCity}` : `${fare.from} → ${fare.to}`;
  const carrier = fare.carrier
    ? [fare.carrier, fare.cabin ? cabinWord(fare.cabin) : null].filter(Boolean).join(" · ")
    : null;
  return { day, route, carrier };
}

/** `October 12, 2026` for a day the calendar has; null otherwise. */
export function longDay(ymd: string | null | undefined): string | null {
  if (!ymd || !isCalendarDay(ymd)) return null;
  return `${MONTH_NAMES[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}, ${ymd.slice(0, 4)}`;
}

type AboutFare = Pick<FareVM, "carrier" | "cabin" | "product" | "from" | "to"> & { day: string | null };

/**
 * `About this fare` (20), in what the club knows: the fare is one way, for one adult, the route by its cities and codes,
 * its day; then the cabin, the airline and its seat, and what the specialist does. 20's `indicative round-trip fare`
 * and `a spacious seat` are not this fare's facts (ADR-IMPL-055 §8).
 */
export function aboutFareLines(fare: AboutFare): [string, string] {
  const day = longDay(fare.day);
  const route = `from ${fare.from.city} (${fare.from.code}) to ${fare.to.city} (${fare.to.code})`;
  const first = `This fare is one way, for one adult flying ${route}${day ? ` on ${day}` : ""}. Your specialist confirms availability and the final fare.`;
  const product = fare.product?.trim();
  const second = `Travel in ${cabinWord(fare.cabin)} with ${fare.carrier.name}${product ? ` (${product})` : ""}. Your specialist confirms the cabin details and arranges the booking by phone.`;
  return [first, second];
}

/** What the phone's share sheet carries (05's share): the route, the cabin, the fare one way, and the fare's link. */
export function shareFareText(fare: Pick<FareVM, "id" | "cabin" | "from" | "to" | "price">): string {
  const price = formatPrice(fare.price.offer, fare.price.currency);
  return `${fare.from.city} to ${fare.to.city} in ${cabinWord(fare.cabin)}, ${price} one way, with BuyBusinessClass Club: bbcclub://fare/${fare.id}`;
}

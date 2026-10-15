import type { FareVM } from "@bbc/shared/api/v1/fares";

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
  const named = departDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(departDate) : null;
  const month = named ? MONTHS[Number(named[2]) - 1] : undefined;
  const day = named ? Number(named[3]) : 0;
  // A day the calendar has; anything else falls through to the instant and the clock.
  if (month && day >= 1 && day <= 31) return `${month} ${day}`;
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
  const ymd = fare.departDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fare.departDate) : null;
  const month = ymd ? MONTHS[Number(ymd[2]) - 1] : undefined;
  const day = ymd && month ? `${month} ${Number(ymd[3])} · ONE WAY` : "ONE WAY";
  const route = fare.fromCity && fare.toCity ? `${fare.fromCity} to ${fare.toCity}` : `${fare.from} → ${fare.to}`;
  const carrier = fare.carrier
    ? [fare.carrier, fare.cabin ? cabinWord(fare.cabin) : null].filter(Boolean).join(" · ")
    : null;
  return { day, route, carrier };
}

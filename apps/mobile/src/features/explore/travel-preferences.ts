/**
 * The three travel-preference chips on Home (Figma 89:387: `Oct · flexible` · `Business` · `1 traveler`), the one-line
 * mono summary the empty states show instead (89:390: `OCT · FLEXIBLE   ·   BUSINESS` / `1 TRAVELER`), and the rule
 * that picks the copy for a route with neither a fare nor an estimate (A4 on 536:11155 vs 89:390).
 */
import type { AirportVM } from "@bbc/shared/api/v1/fares";

export type SearchDates = { depart: string | null; return: string | null; flexible: boolean };
export type Cabin = "business" | "first";
export type Passengers = { adult: number; child: number; infant: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parts(iso: string): { month: string; day: number } {
  const m = Number(iso.slice(5, 7));
  return { month: MONTHS[m - 1] ?? iso.slice(0, 7), day: Number(iso.slice(8, 10)) };
}

/** `Oct · flexible` with no date (the current month), `Oct 12 – 19` for a round trip, `Oct 12` for one way. */
export function datesChipLabel(dates: SearchDates, now: Date = new Date()): string {
  if (!dates.depart) return `${MONTHS[now.getMonth()]} · flexible`;
  const a = parts(dates.depart);
  if (!dates.return) return `${a.month} ${a.day}`;
  const b = parts(dates.return);
  return a.month === b.month ? `${a.month} ${a.day} – ${b.day}` : `${a.month} ${a.day} – ${b.month} ${b.day}`;
}

export function cabinLabel(cabin: Cabin): string {
  return cabin === "first" ? "First" : "Business";
}

/** Figma says traveler, not adult: `1 traveler`, `2 travelers`. Children and infants count. */
export function travelersLabel(p: Passengers): string {
  const n = p.adult + p.child + p.infant;
  return `${n} ${n === 1 ? "traveler" : "travelers"}`;
}

/** The two mono lines of the empty states (89:390, 89:391, 536:11155). */
export function preferencesLines(
  dates: SearchDates,
  cabin: Cabin,
  p: Passengers,
  now: Date = new Date(),
): [string, string] {
  return [
    `${datesChipLabel(dates, now).toUpperCase()}   ·   ${cabinLabel(cabin).toUpperCase()}`,
    travelersLabel(p).toUpperCase(),
  ];
}

/** `when` for GET /v1/search: noon UTC of the chosen departure day; none while the dates are flexible (ADR-IMPL-037 —
 *  an estimate exists only for an undated search). */
export function searchWhen(dates: SearchDates): string | undefined {
  return dates.depart ? `${dates.depart}T12:00:00.000Z` : undefined;
}

/**
 * The formula prices only routes touching North America (ADR-IMPL-037), so a route with no fare and no estimate that
 * touches it is "no fares right now" (89:390), and one that does not is "fares on request" (536:11155). Until the
 * server sends a coverage field, the app decides by country: the three continental codes the site publishes from.
 */
export const NORTH_AMERICA = new Set(["US", "CA", "MX"]);

export type NoFareCopy = { kind: "no_fare_now" | "on_request"; title: string; body: string };

export function noFareCopy(
  from: Pick<AirportVM, "city" | "countryCode"> | null,
  to: Pick<AirportVM, "countryCode"> | null,
): NoFareCopy {
  const touchesNorthAmerica =
    (from !== null && NORTH_AMERICA.has(from.countryCode)) || (to !== null && NORTH_AMERICA.has(to.countryCode));
  if (from && !touchesNorthAmerica) {
    return {
      kind: "on_request",
      title: `Fares from ${from.city} are on request.`,
      body: "We publish fares from North America for now. Tell us where you're going — your specialist will find the fare.",
    };
  }
  return {
    kind: "no_fare_now",
    title: "Let us find your fare.",
    body: "No fares match this route right now. Tell us your plans and a specialist will call you shortly.",
  };
}

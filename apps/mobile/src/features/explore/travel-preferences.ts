/**
 * The trip's three chips (13, 04: `Nov 12 – 19, 2026` · `Business` · `1 adult`), the title over the fares, and the rule
 * that picks the copy for a route with neither a fare nor an estimate (A4 on 536:11155 vs 89:390).
 */
import type { AirportVM } from "@bbc/shared/api/v1/fares";

export type SearchDates = { depart: string | null; return: string | null; flexible: boolean };
export type Cabin = "business" | "first";
export type Passengers = { adult: number; child: number; infant: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parts(iso: string): { year: string; month: string; day: number } {
  const m = Number(iso.slice(5, 7));
  return { year: iso.slice(0, 4), month: MONTHS[m - 1] ?? iso.slice(0, 7), day: Number(iso.slice(8, 10)) };
}

/**
 * `Nov 12 – 19, 2026` for a round trip (13), `Oct 28 – Nov 2, 2026` across a month, `Dec 28, 2026 – Jan 4, 2027`
 * across a year, `Nov 12, 2026` one way; `Flexible dates` while none is chosen.
 */
export function datesChipLabel(dates: Pick<SearchDates, "depart" | "return">): string {
  if (!dates.depart) return "Flexible dates";
  const a = parts(dates.depart);
  if (!dates.return) return `${a.month} ${a.day}, ${a.year}`;
  const b = parts(dates.return);
  if (a.year !== b.year) return `${a.month} ${a.day}, ${a.year} – ${b.month} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${a.month} ${a.day} – ${b.month} ${b.day}, ${b.year}`;
  return `${a.month} ${a.day} – ${b.day}, ${b.year}`;
}

export function cabinLabel(cabin: Cabin): string {
  return cabin === "first" ? "First" : "Business";
}

/** 13: `1 adult`, `2 adults`; a party with children counts everyone — `3 travelers`. */
export function travelersLabel(p: Passengers): string {
  if (p.child + p.infant === 0) return `${p.adult} ${p.adult === 1 ? "adult" : "adults"}`;
  return `${p.adult + p.child + p.infant} travelers`;
}

/** The title over the fares: `Flight option` over one (13), `Flight options` over several (04). */
export function flightOptionsTitle(count: number): string {
  return count === 1 ? "Flight option" : "Flight options";
}

/** The travelers sheets edit adults only: children and infants already in the party stay, never reset to 0. One adult
 *  at least (the request's minimum). */
export function withAdults(party: Passengers | undefined, adult: number): Passengers {
  return { adult: Math.max(1, adult), child: party?.child ?? 0, infant: party?.infant ?? 0 };
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

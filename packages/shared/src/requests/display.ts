/**
 * How a request reads wherever it is shown — the member's list and detail (RequestVM), the operator's page, the
 * quote-ready push, and a request still waiting on the phone (ADR-IMPL-042). One implementation for the server and the
 * app, so the two never drift. Pure: no Node, no React Native.
 */

type LegLike = { from?: unknown; to?: unknown; date?: unknown } | null | undefined;

/**
 * The ends a request is about: the outbound leg for a round trip and a one-way trip (`JFK → LHR`); for a multi-city
 * trip, the origin to its last stop before coming home. Never "first origin → last destination" for a round trip — the
 * last leg comes home, and that read `JFK → JFK`. `legs` may be stored jsonb, so it is read defensively.
 */
export function routeEnds(legs: unknown, tripType: string | null | undefined): { from: string; to: string } | null {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const first = legs[0] as LegLike;
  const last = legs[legs.length - 1] as LegLike;
  if (typeof first?.from !== "string") return null;
  if (tripType === "multi" && typeof last?.to === "string") {
    // A tour that ends at home is about where it went last, not about home.
    const to = last.to === first.from && typeof last.from === "string" ? last.from : last.to;
    return { from: first.from, to };
  }
  return typeof first.to === "string" ? { from: first.from, to: first.to } : null;
}

/** `JFK → LHR`, or "" when the legs say nothing usable. */
export function requestRoute(legs: unknown, tripType: string | null | undefined): string {
  const ends = routeEnds(legs, tripType);
  return ends ? `${ends.from} → ${ends.to}` : "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

type Day = { year: number; month: number; day: number };

/** A real calendar day written YYYY-MM-DD, or null (`2027-02-29` and `2027-13-01` are not days). */
export function calendarDay(iso: unknown): Day | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const t = new Date(Date.UTC(year, month - 1, day));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) return null;
  return { year, month, day };
}

const label = (d: Day) => `${MONTHS[d.month - 1]} ${d.day}`;
const order = (d: Day) => d.year * 10_000 + d.month * 100 + d.day;

/**
 * The trip's dates as the frames write them (Figma 233:4069): `Oct 12–19` within a month, `Oct 30–Nov 6` across months
 * (or the same month a year apart), `Nov 3` for one day — a one-way trip or a same-day return. From the earliest to
 * the latest leg, so legs out of order still read forwards; a date that is not a real day is left out.
 */
export function requestDates(legs: unknown): string {
  if (!Array.isArray(legs) || legs.length === 0) return "";
  const days = legs.map((l) => calendarDay((l as LegLike)?.date)).filter((d): d is Day => d !== null);
  if (days.length === 0) {
    const raw = (legs[0] as LegLike)?.date;
    return typeof raw === "string" ? raw : "";
  }
  days.sort((a, b) => order(a) - order(b));
  const a = days[0]!;
  const b = days[days.length - 1]!;
  if (order(a) === order(b)) return label(a);
  if (a.year === b.year && a.month === b.month) return `${label(a)}–${b.day}`;
  return `${label(a)}–${label(b)}`;
}

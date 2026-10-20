import { type FareVM, isCalendarDay } from "@bbc/shared/api/v1/fares";

type Fare = Pick<
  FareVM,
  "nonstop" | "durationMinutes" | "departAt" | "departLocal" | "departDate" | "arriveDayOffset" | "cabin"
>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `7h 10m`, `7h 00m` (04). */
export function durationText(minutes: number | null): string | null {
  if (minutes == null) return null;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** `Nonstop · 7h 10m` (04). The catalogue knows nonstop or not, never how many stops: a connecting fare says so. */
export function flightFacts(fare: Pick<Fare, "nonstop" | "durationMinutes">): string {
  return [fare.nonstop ? "Nonstop" : "Connecting", durationText(fare.durationMinutes)].filter(Boolean).join(" · ");
}

export function cabinText(cabin: Fare["cabin"]): string {
  return cabin === "first" ? "First" : "Business";
}

/** `Nov 12, 2026` for a day the calendar has; null for anything else. */
export function dayText(ymd: string | null | undefined): string | null {
  if (!ymd || !isCalendarDay(ymd)) return null;
  return `${MONTHS[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8, 10))}, ${ymd.slice(0, 4)}`;
}

/**
 * The departure's day at the origin airport, `YYYY-MM-DD` — never the phone's zone (ADR-IMPL-019). The server names it
 * (`departDate`); an older server's answer leaves it to the instant and the airport's wall clock, the offset between
 * them taken from −12 to +14 hours.
 */
export function departYmd(fare: Pick<Fare, "departAt" | "departLocal" | "departDate">): string | null {
  if (fare.departDate && isCalendarDay(fare.departDate)) return fare.departDate;
  if (!fare.departAt) return null;
  const instant = new Date(fare.departAt);
  if (Number.isNaN(instant.getTime())) return null;
  let offset = 0;
  const clock = fare.departLocal ? /^(\d{2}):(\d{2})$/.exec(fare.departLocal) : null;
  if (clock) {
    const local = Number(clock[1]) * 60 + Number(clock[2]);
    const utc = instant.getUTCHours() * 60 + instant.getUTCMinutes();
    offset = local - utc;
    if (offset > 14 * 60) offset -= 24 * 60;
    if (offset < -12 * 60) offset += 24 * 60;
  }
  return new Date(instant.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

/** The arrival's day: the departure's, moved by the days the flight crosses (`+1`). */
export function arriveYmd(fare: Fare): string | null {
  const depart = departYmd(fare);
  if (!depart) return null;
  const d = new Date(`${depart}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + fare.arriveDayOffset);
  return d.toISOString().slice(0, 10);
}

/** A fare is one flight (ADR-IMPL-055 · Facts stay facts): its price is `one way`. */
export const ONE_WAY = "one way";

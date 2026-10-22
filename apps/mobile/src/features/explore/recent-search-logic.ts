import { AirportVM } from "@bbc/shared/api/v1/fares";
// The pure date helpers, not the component index: this module is imported by tests that run without React Native.
import { todayLocal } from "@bbc/ui/calendar-logic";
import { z } from "zod";

/** Search (03): the last five destinations searched, each with the dates it was searched for, newest first. */
export const RECENT_MAX = 5;

const Dates = z.object({ depart: z.string().nullable(), return: z.string().nullable() });
const RecentSearch = z.object({ airport: AirportVM, dates: Dates.nullable() });
export type RecentSearch = z.infer<typeof RecentSearch>;
export type RecentDates = z.infer<typeof Dates>;

/** What the phone keeps — read as recent searches; an airport saved bare by 0.2.0 is one searched without dates. */
const Stored = z.array(z.union([RecentSearch, AirportVM.transform((airport) => ({ airport, dates: null }))]));

/**
 * Dates whose departure has passed are no dates (F006): the destination stays, searched with flexible dates — a trip
 * that has already left is never searched, shown or requested again. `today` is the phone's day (`YYYY-MM-DD`).
 */
export function upcomingDates(dates: RecentDates | null, today: string = todayLocal()): RecentDates | null {
  return dates?.depart && dates.depart >= today ? dates : null;
}

export function parseRecent(raw: string | undefined, today: string = todayLocal()): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return parsed.data.slice(0, RECENT_MAX).map((r) => ({ ...r, dates: upcomingDates(r.dates, today) }));
  } catch {
    return [];
  }
}

/** The destination first, once — searched again, it moves up and keeps the dates it was searched for last. */
export function withSearch(
  list: readonly RecentSearch[],
  airport: AirportVM,
  dates: RecentDates | null,
): RecentSearch[] {
  const before = list.find((r) => r.airport.code === airport.code);
  const next = { airport, dates: dates ?? before?.dates ?? null };
  return [next, ...list.filter((r) => r.airport.code !== airport.code)].slice(0, RECENT_MAX);
}

/** The dates chosen for a destination already in the list — null when the member keeps the dates flexible; a
 *  destination not in it is left alone. */
export function withDates(list: readonly RecentSearch[], code: string, dates: RecentDates | null): RecentSearch[] {
  return list.map((r) => (r.airport.code === code ? { ...r, dates } : r));
}

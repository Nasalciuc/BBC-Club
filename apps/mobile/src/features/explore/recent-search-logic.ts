import { AirportVM } from "@bbc/shared/api/v1/fares";
import { z } from "zod";

/** Search (03): the last five destinations searched, each with the dates it was searched for, newest first. */
export const RECENT_MAX = 5;

const Dates = z.object({ depart: z.string().nullable(), return: z.string().nullable() });
const RecentSearch = z.object({ airport: AirportVM, dates: Dates.nullable() });
export type RecentSearch = z.infer<typeof RecentSearch>;
export type RecentDates = z.infer<typeof Dates>;

/** What the phone keeps — read as recent searches; an airport saved bare by 0.2.0 is one searched without dates. */
const Stored = z.array(z.union([RecentSearch, AirportVM.transform((airport) => ({ airport, dates: null }))]));

export function parseRecent(raw: string | undefined): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.slice(0, RECENT_MAX) : [];
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

/** The dates chosen for a destination already in the list; a destination not in it is left alone. */
export function withDates(list: readonly RecentSearch[], code: string, dates: RecentDates): RecentSearch[] {
  return list.map((r) => (r.airport.code === code ? { ...r, dates } : r));
}

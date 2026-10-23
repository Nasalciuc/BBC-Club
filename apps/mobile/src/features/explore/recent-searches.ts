import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { appStorage } from "@/lib/storage-keys";

import { type RecentDates, type RecentSearch, parseRecent, withDates, withSearch } from "./recent-search-logic";

/** The key 0.2.0 kept recent airports under: the same list, now with dates (recent-search-logic.ts reads both). */
export const RECENT_SEARCHES_KEY = "bbcclub.recentAirports";

export function readRecentSearches(): RecentSearch[] {
  return parseRecent(appStorage.getString(RECENT_SEARCHES_KEY));
}

export function rememberSearch(airport: AirportVM, dates: RecentDates | null = null): RecentSearch[] {
  const next = withSearch(readRecentSearches(), airport, dates);
  appStorage.set(RECENT_SEARCHES_KEY, JSON.stringify(next));
  return next;
}

/** The dates chosen for a destination already searched; null — `Keep the dates flexible` forgets them. */
export function rememberDates(code: string, dates: RecentDates | null): void {
  appStorage.set(RECENT_SEARCHES_KEY, JSON.stringify(withDates(readRecentSearches(), code, dates)));
}

/** Search's `Clear all` (03). */
export function clearRecentSearches(): void {
  appStorage.remove(RECENT_SEARCHES_KEY);
}

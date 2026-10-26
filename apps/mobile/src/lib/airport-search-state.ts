export type AirportSearchPhase = "idle" | "loading" | "results" | "empty" | "error";

export type AirportSearchView<T> = {
  phase: AirportSearchPhase;
  airports: T[];
};

type AirportSearchInput<T> = "idle" | "loading" | { ok: true; data: T[] } | { ok: false };

/** `empty` only for a successful response with no airports. A failed request is `error` and drops any previous hits. */
export function airportSearchState<T>(input: AirportSearchInput<T>): AirportSearchView<T> {
  if (input === "idle" || input === "loading") {
    return { phase: input, airports: [] };
  }
  if (!input.ok) {
    return { phase: "error", airports: [] };
  }
  if (input.data.length === 0) {
    return { phase: "empty", airports: [] };
  }
  return { phase: "results", airports: input.data };
}

/** The field's words once an airport is chosen: `New York · JFK`. */
export function chosenAirportLabel(airport: { city: string; code: string }): string {
  return `${airport.city} · ${airport.code}`;
}

/** 12, 36: the home airport as `New York (JFK)` — the code alone while its city is unknown. */
export function homeAirportLabel(code: string, city: string | null | undefined): string {
  return city ? `${city} (${code})` : code;
}

/**
 * Whether the field's words ask for a search: two characters or more, and not the airport just chosen — those words
 * are the choice itself, and searching them would bring the list back over it.
 */
export function wantsAirportSearch(query: string, chosen: { city: string; code: string } | null): boolean {
  if (query.trim().length < 2) return false;
  return chosen == null || query !== chosenAirportLabel(chosen);
}

/**
 * 14: the airports of the phone's time zone first — the home airport is most likely near the member, as the field's
 * helper says (`suggested from your time zone`) — each group in the server's order. Without a zone, the server's
 * order as it is.
 */
export function nearFirst<T extends { tz?: string }>(airports: readonly T[], zone: string | null): T[] {
  if (!zone) return [...airports];
  return [...airports.filter((a) => a.tz === zone), ...airports.filter((a) => a.tz !== zone)];
}

/** An airport's own name without the words every airport shares: `LaGuardia Airport` → `LaGuardia`. */
function shortName(name: string): string {
  return name
    .replace(/\b(international|intl\.?|airport|aeropuerto|aéroport|flughafen)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 14: each row's city as the list shows it — the city alone, or, where an earlier row already says that city (two
 * airports of one city), the city and the airport's own name: `New York LaGuardia` under `New York` (JFK). A name
 * that already starts with its city stands alone (`London City`).
 */
export function rowCities<T extends { code: string; city: string; name: string }>(
  airports: readonly T[],
): Map<string, string> {
  const seen = new Set<string>();
  const out = new Map<string, string>();
  for (const a of airports) {
    const key = a.city.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.set(a.code, a.city);
      continue;
    }
    const own = shortName(a.name);
    out.set(a.code, !own ? a.city : own.toLowerCase().startsWith(key) ? own : `${a.city} ${own}`);
  }
  return out;
}

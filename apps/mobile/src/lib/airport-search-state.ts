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

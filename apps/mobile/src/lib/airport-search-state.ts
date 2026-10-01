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

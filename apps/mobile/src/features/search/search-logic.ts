import type { AirportVM, EstimateVM, FareVM } from "@bbc/shared/api/v1/fares";

/** Pure state and reducer of the Home search. The hook (useSearch) owns the requests; this file owns the rules. */

export type SearchState = {
  from: AirportVM | null;
  to: AirportVM | null;
  dates: { depart: string | null; return: string | null; flexible: boolean };
  cabin: "business" | "first";
  passengers: { adult: number; child: number; infant: number };
  results: FareVM[] | null;
  /** The formula's indicative price when the undated search found no fare (ADR-IMPL-037); null otherwise. */
  estimate: EstimateVM | null;
  /** The route as the server knows it — with `tz` for the local time. Null until a search answered. */
  route: { from: AirportVM; to: AirportVM } | null;
  status: "idle" | "searching" | "done" | "empty" | "error" | "paused";
  errorMessage: string | null;
  /** The member chose the cabin or the travelers on a chip: the profile's usual ones no longer replace them. */
  chosen: { cabin: boolean; passengers: boolean };
};

export type SearchAction =
  | { type: "selectDestination"; airport: AirportVM }
  | { type: "selectOrigin"; airport: AirportVM }
  | { type: "clearDestination" }
  | { type: "setDates"; dates: SearchState["dates"] }
  | { type: "setCabin"; cabin: SearchState["cabin"] }
  | { type: "setPassengers"; passengers: SearchState["passengers"] }
  /** The profile's usual cabin and travelers, once loaded — each taken unless the member already chose it on a chip, a
   *  route chosen before the profile arrived included (a destination's page selects at once). */
  | { type: "seedPreferences"; cabin?: SearchState["cabin"]; passengers?: SearchState["passengers"] }
  | { type: "searchStarted" }
  | {
      type: "searchDone";
      results: FareVM[];
      estimate: EstimateVM | null;
      route: { from: AirportVM; to: AirportVM };
    }
  | { type: "searchFailed"; message: string }
  | { type: "searchPaused" };

export const INITIAL_SEARCH: SearchState = {
  from: null,
  to: null,
  dates: { depart: null, return: null, flexible: true },
  cabin: "business",
  passengers: { adult: 1, child: 0, infant: 0 },
  results: null,
  estimate: null,
  route: null,
  status: "idle",
  errorMessage: null,
  chosen: { cabin: false, passengers: false },
};

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "selectDestination":
      // A new route starts clean: the last route's fares, estimate and zone must not show under the new name.
      return {
        ...state,
        to: action.airport,
        results: null,
        estimate: null,
        route: null,
        errorMessage: null,
        status: state.from ? "searching" : state.status,
      };
    case "selectOrigin":
      return { ...state, from: action.airport };
    case "clearDestination":
      // Back to Rest with flexible dates: the next search starts undated, the one search that can estimate.
      return {
        ...state,
        to: null,
        results: null,
        estimate: null,
        route: null,
        status: "idle",
        errorMessage: null,
        dates: INITIAL_SEARCH.dates,
      };
    case "seedPreferences": {
      const cabin = state.chosen.cabin ? state.cabin : (action.cabin ?? state.cabin);
      const passengers = state.chosen.passengers ? state.passengers : (action.passengers ?? state.passengers);
      if (cabin === state.cabin && passengers === state.passengers) return state;
      return { ...state, cabin, passengers };
    }
    case "setDates":
      return { ...state, dates: action.dates };
    case "setCabin":
      return { ...state, cabin: action.cabin, chosen: { ...state.chosen, cabin: true } };
    case "setPassengers":
      return { ...state, passengers: action.passengers, chosen: { ...state.chosen, passengers: true } };
    case "searchStarted":
      return { ...state, status: "searching", errorMessage: null };
    case "searchDone":
      return {
        ...state,
        results: action.results,
        // Published fares always win: an estimate shows only on an empty result (ADR-IMPL-037).
        estimate: action.results.length === 0 ? action.estimate : null,
        route: action.route,
        status: action.results.length === 0 ? "empty" : "done",
        errorMessage: null,
      };
    case "searchFailed":
      return { ...state, status: "error", errorMessage: action.message, results: null, estimate: null };
    case "searchPaused":
      return { ...state, status: "paused", errorMessage: null };
    default:
      return state;
  }
}

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
};

export type SearchAction =
  | { type: "selectDestination"; airport: AirportVM }
  | { type: "selectOrigin"; airport: AirportVM }
  | { type: "clearDestination" }
  | { type: "setDates"; dates: SearchState["dates"] }
  | { type: "setCabin"; cabin: SearchState["cabin"] }
  | { type: "setPassengers"; passengers: SearchState["passengers"] }
  /** The profile's usual cabin and travelers, once loaded — taken only while no route has been chosen. */
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
    case "seedPreferences":
      if (state.to !== null) return state;
      return {
        ...state,
        cabin: action.cabin ?? state.cabin,
        passengers: action.passengers ?? state.passengers,
      };
    case "setDates":
      return { ...state, dates: action.dates };
    case "setCabin":
      return { ...state, cabin: action.cabin };
    case "setPassengers":
      return { ...state, passengers: action.passengers };
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

import { useEffect, useReducer, useRef } from "react";
import type { AirportVM, FareVM } from "@bbc/shared/api/v1/fares";

import { searchFares } from "@/lib/api";

export type SearchState = {
  from: AirportVM | null;
  to: AirportVM | null;
  dates: { depart: string | null; return: string | null; flexible: boolean };
  cabin: "business" | "first";
  passengers: { adult: number; child: number; infant: number };
  results: FareVM[] | null;
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
  | { type: "searchStarted" }
  | { type: "searchDone"; results: FareVM[] }
  | { type: "searchFailed"; message: string }
  | { type: "searchPaused" };

const INITIAL: SearchState = {
  from: null,
  to: null,
  dates: { depart: null, return: null, flexible: true },
  cabin: "business",
  passengers: { adult: 1, child: 0, infant: 0 },
  results: null,
  status: "idle",
  errorMessage: null,
};

function reducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "selectDestination":
      return { ...state, to: action.airport, status: state.from ? "searching" : state.status };
    case "selectOrigin":
      return { ...state, from: action.airport };
    case "clearDestination":
      return { ...state, to: null, results: null, status: "idle", errorMessage: null };
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
        status: action.results.length === 0 ? "empty" : "done",
        errorMessage: null,
      };
    case "searchFailed":
      return { ...state, status: "error", errorMessage: action.message, results: null };
    case "searchPaused":
      return { ...state, status: "paused", errorMessage: null, results: null };
    default:
      return state;
  }
}

type Options = {
  defaultFrom?: AirportVM | null;
};

/** One reducer, two subscribers — globe and field both read `state.to`. Neither owns selection. */
export function useSearch(options: Options = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const seeded = useRef(false);
  const paramsRef = useRef({ from: state.from, to: state.to, cabin: state.cabin });
  paramsRef.current = { from: state.from, to: state.to, cabin: state.cabin };

  useEffect(() => {
    if (seeded.current) return;
    if (options.defaultFrom) {
      seeded.current = true;
      dispatch({ type: "selectOrigin", airport: options.defaultFrom });
    }
  }, [options.defaultFrom]);

  function runSearch(from: AirportVM, to: AirportVM, cabin: SearchState["cabin"]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "searchStarted" });
    void (async () => {
      const result = await searchFares({ from: from.code, to: to.code, cabin });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.code === "RATE_LIMITED") {
          dispatch({ type: "searchPaused" });
          return;
        }
        dispatch({ type: "searchFailed", message: result.message });
        return;
      }
      dispatch({ type: "searchDone", results: result.data.items });
    })();
  }

  useEffect(() => {
    if (!state.from || !state.to) return;
    const timer = setTimeout(() => runSearch(state.from!, state.to!, state.cabin), 250);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [state.from, state.to, state.cabin, state.dates]);

  function retry() {
    const { from, to, cabin } = paramsRef.current;
    if (from && to) runSearch(from, to, cabin);
  }

  return { state, dispatch, retry };
}

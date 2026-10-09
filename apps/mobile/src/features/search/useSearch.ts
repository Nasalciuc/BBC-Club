import { useEffect, useReducer, useRef } from "react";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { searchWhen } from "@/features/explore/travel-preferences";
import { searchFares } from "@/lib/api";
import { INITIAL_SEARCH, searchReducer, type SearchState } from "./search-logic";

export type { SearchAction, SearchState } from "./search-logic";

type Options = {
  defaultFrom?: AirportVM | null;
};

type Params = Pick<SearchState, "from" | "to" | "cabin" | "dates">;

/** One reducer, two subscribers — globe and field both read `state.to`. Neither owns selection. */
export function useSearch(options: Options = {}) {
  const [state, dispatch] = useReducer(searchReducer, INITIAL_SEARCH);
  const abortRef = useRef<AbortController | null>(null);
  const seeded = useRef(false);
  const paramsRef = useRef<Params>({ from: state.from, to: state.to, cabin: state.cabin, dates: state.dates });
  paramsRef.current = { from: state.from, to: state.to, cabin: state.cabin, dates: state.dates };

  useEffect(() => {
    if (seeded.current) return;
    if (options.defaultFrom) {
      seeded.current = true;
      dispatch({ type: "selectOrigin", airport: options.defaultFrom });
    }
  }, [options.defaultFrom]);

  function runSearch(from: AirportVM, to: AirportVM, cabin: SearchState["cabin"], dates: SearchState["dates"]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "searchStarted" });
    void (async () => {
      // A chosen departure day narrows the search to fares valid then; flexible dates search undated, which is the
      // only search that can carry an estimate (ADR-IMPL-037).
      const result = await searchFares({ from: from.code, to: to.code, cabin, when: searchWhen(dates) });
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.code === "RATE_LIMITED") {
          dispatch({ type: "searchPaused" });
          return;
        }
        dispatch({ type: "searchFailed", message: result.message });
        return;
      }
      dispatch({
        type: "searchDone",
        results: result.data.items,
        estimate: result.data.estimate ?? null,
        route: { from: result.data.from, to: result.data.to },
      });
    })();
  }

  useEffect(() => {
    if (!state.from || !state.to) return;
    const timer = setTimeout(() => runSearch(state.from!, state.to!, state.cabin, state.dates), 250);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [state.from, state.to, state.cabin, state.dates]);

  function retry() {
    const { from, to, cabin, dates } = paramsRef.current;
    if (from && to) runSearch(from, to, cabin, dates);
  }

  return { state, dispatch, retry };
}

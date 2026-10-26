import type { SearchState } from "../search/search-logic";

/** What stands in the destination's summary (13, 04, 19). */
export type SummaryKind = "offline" | "loading" | "error" | "paused" | "fare" | "estimate" | "empty";

/**
 * The fare's summary, or what stands in its place: offline (19), searching, an error, searching paused with no fare to
 * show, the lowest fare (paused over it: its note says so), the formula's estimate (ADR-IMPL-037), or no fare.
 */
export function summaryKind(
  state: Pick<SearchState, "status" | "results" | "estimate">,
  offline: boolean,
): SummaryKind {
  if (offline) return "offline";
  if (state.status === "searching" || state.status === "idle") return "loading";
  if (state.status === "error") return "error";
  const fares = state.results ?? [];
  if (state.status === "paused" && fares.length === 0) return "paused";
  if (fares.length > 0) return "fare";
  if (state.estimate) return "estimate";
  return "empty";
}

/** A message (19) in the fare's place — it makes the summary taller. */
export function summaryIsMessage(kind: SummaryKind): boolean {
  return kind === "offline" || kind === "error" || kind === "paused" || kind === "empty";
}

/** The messages that end with `Try again`: whatever stopped the search may have passed — the search never reruns by
 *  itself until the route, the cabin or the dates change (F102). */
export function summaryRetries(kind: SummaryKind): boolean {
  return kind === "offline" || kind === "error" || kind === "paused";
}

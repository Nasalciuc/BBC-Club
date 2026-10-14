import type { SearchState } from "@/features/search/search-logic";

/**
 * Whether Explore docks the `Request a quote` footer (Figma 89:387, 481:9097, 536:10635): over fares, over an
 * estimate, and whenever searching is paused — a paused search may have nothing to show yet (the first search after a
 * new destination), and the member can still ask a specialist. Never beside an EmptyState's own button, never offline.
 */
export function wantsQuoteFooter(
  state: Pick<SearchState, "status" | "results" | "estimate">,
  offline: boolean,
): boolean {
  if (offline) return false;
  if (state.status === "paused") return true;
  if (state.status === "done") return state.results !== null;
  return state.status === "empty" && state.estimate !== null;
}

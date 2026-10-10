import { usePathname } from "expo-router";
import { useEffect, useState } from "react";

import { fetchRequests } from "@/lib/api";

import { unreadQuotes } from "./request-view-logic";

/** One number for every tab bar — the tabs' own and the one on a screen pushed over them (a request, a fare). */
let count = 0;
const listeners = new Set<(n: number) => void>();
let inFlight: Promise<void> | null = null;

function publish(n: number) {
  count = n;
  for (const listener of listeners) listener(n);
}

/** The Requests screen already holds the list: it tells the dot without a second request to the server. */
export function noteUnreadQuotes(items: readonly { status: string }[]): void {
  publish(unreadQuotes(items));
}

/** Ask the server, one question at a time however many tab bars ask. A failed answer keeps the last number. */
export function refreshUnreadQuotes(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const result = await fetchRequests();
    if (result.ok) publish(unreadQuotes(result.data.items));
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * The Requests dot (DESIGN.md: 6 pt `accent-warm`): requests whose quote is ready. Refreshed whenever the route changes,
 * so the dot is there on the request that carries the quote too, not only on the tabs.
 */
export function useUnreadQuotes(): number {
  const pathname = usePathname();
  const [n, setN] = useState(count);

  useEffect(() => {
    listeners.add(setN);
    return () => {
      listeners.delete(setN);
    };
  }, []);

  useEffect(() => {
    void refreshUnreadQuotes().catch(() => undefined);
  }, [pathname]);

  return n;
}

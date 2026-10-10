import { usePathname } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";

import { fetchRequests } from "@/lib/api";

import { refreshUnreadQuotes, subscribeUnreadQuotes, unreadQuotesCount } from "./unread-quotes-store";

/**
 * The Requests dot (DESIGN.md: 6 pt `accent-warm`): requests whose quote is ready, one number for every tab bar
 * (unread-quotes-store.ts). Refreshed whenever the route changes, so the dot is there on the request that carries the
 * quote too, not only on the tabs.
 */
export function useUnreadQuotes(): number {
  const pathname = usePathname();
  // The third argument is the snapshot for a static web render (app.json: web output `static`): the same number.
  const n = useSyncExternalStore(subscribeUnreadQuotes, unreadQuotesCount, unreadQuotesCount);

  useEffect(() => {
    void refreshUnreadQuotes(fetchRequests).catch(() => undefined);
  }, [pathname]);

  return n;
}

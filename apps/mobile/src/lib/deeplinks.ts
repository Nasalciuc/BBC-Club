import type { Href } from "expo-router";

import { routeFromDeepLinkUrl } from "./deeplink-logic";

/**
 * Deep links from push: `bbcclub://proposal/<uuid>` → Explore (offer id ≠ fare id);
 * `bbcclub://inbox` → Requests tab;
 * `bbcclub://requests` → Requests tab;
 * `bbcclub://requests/<id>` → request detail (quote-ready push).
 * Never put secrets in the URL — only public ids.
 */
export function routeFromDeepLink(url: string): Href | null {
  const dest = routeFromDeepLinkUrl(url);
  if (!dest) return null;
  return dest as Href;
}

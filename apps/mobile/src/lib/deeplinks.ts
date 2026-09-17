import type { Href } from "expo-router";
import * as Linking from "expo-linking";

/**
 * Deep links from push: `bbcclub://proposal/<uuid>` → Explore (offer id ≠ fare id);
 * `bbcclub://inbox` → Requests. Never put secrets in the URL — only public ids.
 */
export function routeFromDeepLink(url: string): Href | null {
  const parsed = Linking.parse(url);
  const host = (parsed.hostname ?? "").replace(/^\//, "");
  const path = (parsed.path ?? "").replace(/^\//, "");
  const segments = [host, ...path.split("/")].filter(Boolean);

  if (segments[0] === "proposal" && segments[1]) {
    return "/(tabs)/explore";
  }
  if (segments[0] === "inbox") {
    return "/(tabs)/requests";
  }
  if (segments[0] === "fare" && segments[1]) {
    return { pathname: "/fare/[id]", params: { id: segments[1] } };
  }
  if (segments[0] === "requests") {
    return "/(tabs)/requests";
  }
  return null;
}

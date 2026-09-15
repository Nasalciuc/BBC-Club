import type { Href } from "expo-router";
import * as Linking from "expo-linking";

/**
 * Deep links from push/inbox: `bbcclub://proposal/<uuid>` and `bbcclub://inbox`.
 * Never put secrets in the URL — only public ids.
 */
export function routeFromDeepLink(url: string): Href | null {
  const parsed = Linking.parse(url);
  const host = (parsed.hostname ?? "").replace(/^\//, "");
  const path = (parsed.path ?? "").replace(/^\//, "");
  const segments = [host, ...path.split("/")].filter(Boolean);

  if (segments[0] === "proposal" && segments[1]) {
    return { pathname: "/proposal/[id]", params: { id: segments[1] } };
  }
  if (segments[0] === "inbox") {
    return "/(tabs)/inbox";
  }
  return null;
}

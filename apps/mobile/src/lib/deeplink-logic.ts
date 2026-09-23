/**
 * Pure deep-link segment routing — no expo-linking / react-native.
 * Host + path segments from `bbcclub://requests/<id>` → `["requests", "<id>"]`.
 */
export type DeepLinkRoute =
  | "/(tabs)/explore"
  | "/(tabs)/requests"
  | { pathname: "/fare/[id]"; params: { id: string } }
  | { pathname: "/request/[id]"; params: { id: string } };

export function segmentsFromDeepLinkUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    const host = (parsed.hostname ?? "").replace(/^\//, "");
    const path = (parsed.pathname ?? "").replace(/^\//, "");
    return [host, ...path.split("/")].filter(Boolean);
  } catch {
    const stripped = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const pathOnly = stripped.split(/[?#]/)[0] ?? "";
    return pathOnly.split("/").filter(Boolean);
  }
}

export function routeFromSegments(segments: string[]): DeepLinkRoute | null {
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
    if (segments[1]) {
      return { pathname: "/request/[id]", params: { id: segments[1] } };
    }
    return "/(tabs)/requests";
  }
  return null;
}

export function routeFromDeepLinkUrl(url: string): DeepLinkRoute | null {
  return routeFromSegments(segmentsFromDeepLinkUrl(url));
}

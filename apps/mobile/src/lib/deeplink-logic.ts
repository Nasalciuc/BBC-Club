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

/** `value.deepLink` when it is a link this app routes: an empty or unknown one counts as none, so the next place a push
 *  keeps its keys is read. */
function deepLinkIn(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const link = (value as { deepLink?: unknown }).deepLink;
  return typeof link === "string" && routeFromDeepLinkUrl(link) ? link : null;
}

/**
 * The link a tapped push carries (`deepLink`, set by the server for the quote-ready push: `bbcclub://requests/<id>`) —
 * only for a tap on the notification itself, not on an action button, and only a link this app routes. Android hands
 * the push's data in `content.data`; iOS keeps a remote push's own keys in the trigger's `payload` (the server sends
 * APNs `{ aps, …data }`, and expo-notifications fills `content.data` only from a `body` key). The first routable link
 * wins: one in `content.data` that this app does not route never hides a good one further on.
 */
export function linkFromNotification(
  response:
    | {
        actionIdentifier: string;
        notification: { request: { content: { data?: unknown }; trigger?: unknown } };
      }
    | null
    | undefined,
  defaultAction: string,
): string | null {
  if (!response || response.actionIdentifier !== defaultAction) return null;
  const request = response.notification.request;
  const trigger = request.trigger as { type?: unknown; payload?: unknown; remoteMessage?: { data?: unknown } } | null;
  const pushed = trigger && typeof trigger === "object" && trigger.type === "push" ? trigger : null;
  return deepLinkIn(request.content.data) ?? deepLinkIn(pushed?.payload) ?? deepLinkIn(pushed?.remoteMessage?.data);
}

/** Screens where a link waits: before the member is in (entry, sign-in), and while the gate still decides where to go
 *  (index, set-password, verify-code, onboarding) — its own `replace` would otherwise land on top of the link. */
export function linkCanOpen(leaf: string, signedIn: boolean, holding: ReadonlySet<string>): boolean {
  return signedIn && leaf !== "index" && !holding.has(leaf);
}

/**
 * For Expo Router's own linking (`+native-intent.tsx`): the club's links are routed by the root layout once a session is
 * known, so Expo Router must leave them alone — `requests/<id>` matches no screen file here (the detail is
 * `request/[id]`) and would open "Unmatched Route" beneath the screen the layout pushes.
 *
 * No other link opens a screen of its own: a link is anyone's to write, and a screen built from its params
 * (`request/confirmed?phone=…&media=https://…`) would show a page the club never sent, with someone else's pictures
 * (F014). At launch (`initial`) any other link opens the app's start, where Welcome or the gate decides; while the app
 * runs it only brings the app forward — the member stays where they were. A development build (`dev`) still opens the
 * component gallery by its link (ADR-IMPL-046); a release build redirects that route to the start anyway.
 */
export function systemPathFor(path: string, initial = true, dev = false): string | null {
  const start = initial ? "/" : null;
  try {
    if (routeFromDeepLinkUrl(path)) return null;
    if (dev && segmentsFromDeepLinkUrl(path).join("/") === "dev/gallery") return "/dev/gallery";
    return start;
  } catch {
    return start;
  }
}

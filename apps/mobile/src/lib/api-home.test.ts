/** GET /v1/home through the app's client (lib/api.ts, ADR-IMPL-075): every load asks with the tag of what this session
 *  last received — the first load of a new screen too — and a 304 answers with that copy; without a session, after a
 *  session ends or for another member's session, no tag goes out and no body comes back. The server is a stubbed
 *  `fetch`; the session cookie, the network's state and the app's version are stood in for. bun test does not resolve
 *  the `@/` alias, so the modules api.ts imports by it are given the real ones where they are pure. */
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { HomeVM } from "@bbc/shared/api/v1/fares";

const API = "https://api.example.test";
// The cookie the Expo plugin would forward: Better Auth reads the session from `bbc.session_token`.
let cookie: string | null = null;
mock.module("@react-native-community/netinfo", () => ({
  default: { fetch: async () => ({ type: "wifi", isConnected: true, isInternetReachable: true }) },
}));
mock.module("@/features/auth/client", () => ({ authHeaders: () => (cookie ? { Cookie: cookie } : {}) }));
mock.module("@/lib/env", () => ({ env: { EXPO_PUBLIC_API_URL: API } }));
mock.module("@/lib/app-meta", () => ({ appPlatform: () => "ios", appVersion: () => "0.0.0-test" }));
const real = {
  landmarks: await import("../features/places/landmark-logic"),
  gate: await import("./app-gate-logic"),
  errors: await import("./error-context"),
  sessions: await import("./session-events"),
  timeout: await import("./timeout"),
  fareGone: await import("./fare-gone"),
};
mock.module("@/features/places/landmark-logic", () => real.landmarks);
mock.module("@/lib/app-gate-logic", () => real.gate);
mock.module("@/lib/error-context", () => real.errors);
mock.module("@/lib/session-events", () => real.sessions);
mock.module("@/lib/timeout", () => real.timeout);
mock.module("@/lib/fare-gone", () => real.fareGone);

const { fetchHome } = await import("./api");
const { nextShownHome } = await import("./home-shown-logic");

let sentTags: (string | null)[] = [];
let answer: () => Response = () => new Response(null, { status: 500 });
const serverFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
  sentTags.push((init?.headers as Record<string, string>)["If-None-Match"] ?? null);
  return answer();
};
const before = globalThis.fetch;
globalThis.fetch = serverFetch as typeof globalThis.fetch;
afterAll(() => {
  globalThis.fetch = before;
});

const sessionOf = (token: string) => `bbc.session_token=${token}.sig; bbc.session_data=eyJ4Ijox`;
// Made-up airports: the two members' Homes differ by their home airport.
const homeOf = (code: string, city: string): HomeVM => ({
  home: { code, city, name: `${city} Airport`, countryCode: "US", lat: 40, lng: -74 },
  destinations: [],
  sections: [],
});
const ok = (home: HomeVM, etag: string) =>
  new Response(JSON.stringify(home), { status: 200, headers: { "Content-Type": "application/json", ETag: etag } });
const notModified = () => new Response(null, { status: 304 });

beforeEach(() => {
  // Each case starts with nothing held: the memory lives as long as the module, as on a phone.
  real.sessions.emitSessionRevoked();
  sentTags = [];
});

describe("fetchHome — Home revalidated from the first load", () => {
  it("the second load asks with the tag of the first, and a 304 answers with the copy it held", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"a1"');
    const first = await fetchHome();
    answer = notModified;
    const second = await fetchHome();
    expect(sentTags).toEqual([null, '"a1"']);
    expect(first.ok && first.data.notModified).toBe(false);
    expect(second.ok && second.data.notModified).toBe(true);
    expect(second.ok && second.data.home.home?.code).toBe("JFK");
    expect(second.ok && second.data.etag).toBe('"a1"');
  });

  it("after the session ends no tag goes out", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"a2"');
    await fetchHome();
    cookie = null; // signed out: the Expo plugin forwards no cookie
    answer = () => new Response(null, { status: 401 });
    await fetchHome();
    cookie = sessionOf("member-a"); // signed in again: a tag held before the sign-out is not used
    answer = () => ok(homeOf("JFK", "New York"), '"a3"');
    await fetchHome();
    expect(sentTags).toEqual([null, null, null]);
  });

  it("a session the server ended forgets the copy at once", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"a4"');
    await fetchHome();
    real.sessions.emitSessionRevoked();
    answer = () => ok(homeOf("JFK", "New York"), '"a5"');
    await fetchHome();
    expect(sentTags).toEqual([null, null]);
  });

  it("another member's session sends no tag and never gets the first member's body", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"a6"');
    await fetchHome();
    cookie = sessionOf("member-b");
    answer = notModified; // even if a server answered 304, member B is not handed member A's Home
    const b = await fetchHome();
    expect(sentTags).toEqual([null, null]);
    expect(b.ok && b.data.home.home).toBeNull();
  });
});

describe("nextShownHome — the tag is shared by every screen, what each shows is its own", () => {
  it("Explore showing v1 takes v2 when Search received v2 and Explore's next load is a 304", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"v1"');
    const first = await fetchHome(); // Explore mounts
    if (!first.ok) throw new Error("first load failed");
    let explore = nextShownHome(null, first.data);
    // Home changed on the server; Search mounts and receives it, and the client now holds v2.
    answer = () => ok(homeOf("LHR", "London"), '"v2"');
    const search = await fetchHome();
    // Explore reads again (back in the foreground, or `Try again`): the client asks with v2's tag.
    answer = notModified;
    const again = await fetchHome();
    if (!again.ok) throw new Error("second Explore load failed");
    explore = nextShownHome(explore, again.data);
    expect(sentTags).toEqual([null, '"v1"', '"v2"']);
    expect(search.ok && search.data.home.home?.code).toBe("LHR");
    expect(explore.home.home?.code).toBe("LHR");
    expect(explore.etag).toBe('"v2"');
  });

  it("a 304 for the tag a screen's copy came with keeps that copy, deals already filtered included", async () => {
    cookie = sessionOf("member-a");
    answer = () => ok(homeOf("JFK", "New York"), '"k1"');
    const first = await fetchHome();
    if (!first.ok) throw new Error("first load failed");
    // The screen dropped the deals past their day (useExploreHome's foreground): still k1's copy, a new object.
    const filtered = { home: { ...first.data.home }, etag: first.data.etag };
    answer = notModified;
    const again = await fetchHome();
    if (!again.ok) throw new Error("second load failed");
    expect(nextShownHome(filtered, again.data)).toBe(filtered);
  });

  it("a 304 with no tag sent never keeps a screen's copy", () => {
    const shown = { home: homeOf("JFK", "New York"), etag: null };
    const empty = { home: null, destinations: [], sections: [] };
    expect(nextShownHome(shown, { home: empty, etag: null, notModified: true }).home).toBe(empty);
  });
});

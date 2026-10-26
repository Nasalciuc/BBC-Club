/** GET /v1/places/:code/landmarks through the app's client (lib/api.ts, ADR-IMPL-064): the ETag it holds goes out as
 *  If-None-Match, a 304 keeps what the app holds, a body is read leniently, a body for another city or of another shape
 *  is a VALIDATION failure, and the server's 404 and 429 pass through. The server is a stubbed `fetch`; the session
 *  cookie, the network's state and the app's version are stood in for. bun test does not resolve the `@/` alias, so
 *  the modules api.ts imports by it are given the real ones where they are pure. */
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

const API = "https://api.example.test";
mock.module("@react-native-community/netinfo", () => ({
  default: { fetch: async () => ({ type: "wifi", isConnected: true, isInternetReachable: true }) },
}));
mock.module("@/features/auth/client", () => ({ authHeaders: () => ({}) }));
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

const { fetchPlaceLandmarks } = await import("./api");

type Asked = { url: string; headers: Partial<Record<string, string>> };
let asked: Asked[] = [];
let answer: () => Response = () => new Response(null, { status: 500 });
const serverFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  asked.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
  return answer();
};
const before = globalThis.fetch;
globalThis.fetch = serverFetch as typeof globalThis.fetch;
afterAll(() => {
  globalThis.fetch = before;
});

beforeEach(() => {
  asked = [];
});

// Made-up file, author and tags.
const tower: LandmarkVM = {
  name: "Eiffel Tower",
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tower.jpg/1280px-Tower.jpg",
  width: 1280,
  height: 853,
  credit: {
    text: "Jane Doe · Wikimedia Commons",
    licence: "CC BY-SA 4.0",
    pageUrl: "https://commons.wikimedia.org/wiki/File:Tower.jpg",
  },
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("fetchPlaceLandmarks — the landmarks question through the app's client", () => {
  it("asks for the city's landmarks; the ETag it holds goes out as If-None-Match, none without one", async () => {
    answer = () => json({ code: "CDG", landmarks: [tower] }, 200, { ETag: '"b"' });
    expect(await fetchPlaceLandmarks("CDG", null)).toEqual({
      ok: true,
      data: { notModified: false, landmarks: [tower], etag: '"b"' },
    });
    await fetchPlaceLandmarks("CDG", '"a"');
    expect(asked.map((a) => [a.url, a.headers["If-None-Match"] ?? null])).toEqual([
      [`${API}/v1/places/CDG/landmarks`, null],
      [`${API}/v1/places/CDG/landmarks`, '"a"'],
    ]);
  });

  it("a 304 keeps what the app holds: the server's ETag, else the one it sent", async () => {
    answer = () => new Response(null, { status: 304, headers: { ETag: '"c"' } });
    expect(await fetchPlaceLandmarks("CDG", '"a"')).toEqual({ ok: true, data: { notModified: true, etag: '"c"' } });
    answer = () => new Response(null, { status: 304 });
    expect(await fetchPlaceLandmarks("CDG", '"a"')).toEqual({ ok: true, data: { notModified: true, etag: '"a"' } });
  });

  it("drops a landmark it cannot read, never the list", async () => {
    answer = () => json({ code: "CDG", landmarks: [{ ...tower, imageUrl: "http://x.test/a.jpg" }, tower] });
    expect(await fetchPlaceLandmarks("CDG")).toEqual({
      ok: true,
      data: { notModified: false, landmarks: [tower], etag: null },
    });
  });

  it("a body for another city, or of another shape, is a VALIDATION failure: the screen shows nothing", async () => {
    for (const body of [{ code: "LHR", landmarks: [tower] }, { items: [] }, "<html>"]) {
      answer = () => json(body);
      expect(await fetchPlaceLandmarks("CDG")).toMatchObject({ ok: false, code: "VALIDATION", status: 500 });
    }
  });

  it("the server's 404 (no such airport) and 429 pass through", async () => {
    answer = () => json({ error: { code: "NOT_FOUND", message: "unknown airport" } }, 404);
    expect(await fetchPlaceLandmarks("QQQ")).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
    answer = () => json({ error: { code: "RATE_LIMITED" } }, 429, { "Retry-After": "30" });
    expect(await fetchPlaceLandmarks("CDG")).toMatchObject({
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      retryAfterS: 30,
    });
  });
});

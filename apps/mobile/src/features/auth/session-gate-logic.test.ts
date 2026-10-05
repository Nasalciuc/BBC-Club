import { describe, it, expect } from "bun:test";
import type { ApiResult, Profile } from "@/lib/api";
import { loadProfileWith, passwordOnFile, routeFor } from "./session-gate-logic";

const sleep = async () => undefined;

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "m1",
    email: "a@test.dev",
    status: "active",
    homeAirport: "JFK",
    displayName: "Alex",
    phoneE164: null,
    ...over,
  } as Profile;
}

function ok(p: Profile): ApiResult<Profile> {
  return { ok: true, data: p };
}
function fail(status: number): ApiResult<Profile> {
  return { ok: false, message: "x", status };
}

describe("loadProfileWith + routeFor", () => {
  it("four 429s → explore (unavailable)", async () => {
    const load = await loadProfileWith(async () => fail(429), sleep);
    expect(routeFor(load, true)).toBe("/(tabs)/explore");
    expect(load.kind).toBe("unavailable");
  });

  it("503 then ok → explore", async () => {
    let n = 0;
    const load = await loadProfileWith(async () => {
      n++;
      return n === 1 ? fail(503) : ok(profile());
    }, sleep);
    expect(routeFor(load, true)).toBe("/(tabs)/explore");
    expect(load.kind).toBe("ok");
  });

  it("status 0 offline ×4 → explore", async () => {
    const load = await loadProfileWith(async () => fail(0), sleep);
    expect(routeFor(load, true)).toBe("/(tabs)/explore");
  });

  it("401 ×4 → sign-in", async () => {
    const load = await loadProfileWith(async () => fail(401), sleep);
    expect(routeFor(load, false)).toBe("/sign-in");
  });

  it("401 then ok recovers the SecureStore race", async () => {
    let n = 0;
    const load = await loadProfileWith(async () => {
      n++;
      return n === 1 ? fail(401) : ok(profile({ homeAirport: null }));
    }, sleep);
    expect(routeFor(load, false)).toBe("/onboarding");
  });

  it("pending then ok without home airport, not onboarded → onboarding", async () => {
    let n = 0;
    const load = await loadProfileWith(async () => {
      n++;
      if (n < 3) return ok(profile({ status: "pending", homeAirport: null }));
      return ok(profile({ status: "active", homeAirport: null }));
    }, sleep);
    expect(routeFor(load, false)).toBe("/onboarding");
  });

  it("deleted → sign-in", async () => {
    const load = await loadProfileWith(async () => ok(profile({ status: "deleted" })), sleep);
    expect(routeFor(load, true)).toBe("/sign-in");
  });

  it("password still pending beats onboarding and explore", async () => {
    const noHome = await loadProfileWith(async () => ok(profile({ homeAirport: null })), sleep);
    expect(routeFor(noHome, false, true)).toBe("/set-password");
    const active = await loadProfileWith(async () => ok(profile()), sleep);
    expect(routeFor(active, true, true)).toBe("/set-password");
    const busy = await loadProfileWith(async () => fail(503), sleep);
    expect(routeFor(busy, false, true)).toBe("/set-password");
  });

  it("a signed-out load ignores a stale pending-password flag", async () => {
    const load = await loadProfileWith(async () => fail(401), sleep);
    expect(routeFor(load, false, true)).toBe("/sign-in");
  });
});

describe("passwordOnFile", () => {
  it("is true when a credential account exists", () => {
    expect(passwordOnFile([{ providerId: "credential", accountId: "u1" }])).toBe(true);
  });

  it("is false for a member who only ever used an email code", () => {
    expect(passwordOnFile([])).toBe(false);
    expect(passwordOnFile([{ providerId: "google", accountId: "g1" }])).toBe(false);
  });

  it("is false for anything unreadable", () => {
    expect(passwordOnFile(null)).toBe(false);
    expect(passwordOnFile(undefined)).toBe(false);
    expect(passwordOnFile({ providerId: "credential" })).toBe(false);
    expect(passwordOnFile([null, 1, "credential"])).toBe(false);
  });
});

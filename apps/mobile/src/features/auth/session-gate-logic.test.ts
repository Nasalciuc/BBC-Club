import { describe, it, expect } from "bun:test";
import type { ApiResult, Profile } from "@/lib/api";
import { loadProfileWith, routeFor } from "./session-gate-logic";

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
});

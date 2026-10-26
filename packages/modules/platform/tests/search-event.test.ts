import { describe, expect, it } from "bun:test";
import { SearchEvent, assertNoIdentity } from "../src/search/event";

describe("search event", () => {
  const ok = {
    from: "JFK",
    to: "LHR",
    cabin: "business" as const,
    month: "2026-11",
    hadFares: false,
    results: 0,
  };

  it("accepts a route and rejects identity fields", () => {
    expect(SearchEvent.parse(ok)).toEqual(ok);
    expect(SearchEvent.safeParse({ ...ok, memberId: "m" }).success).toBe(false);
    expect(SearchEvent.safeParse({ ...ok, ip: "127.0.0.1" }).success).toBe(false);
    expect(SearchEvent.safeParse({ ...ok, deviceId: "d" }).success).toBe(false);
    expect(() => assertNoIdentity({ ...ok, member_id: "m" })).toThrow(/member_id/);
  });
});

import { describe, expect, it } from "bun:test";

import { cabinLabel, profileStats, travelersLabel } from "./profile-logic";

describe("the member's preferences, in words (12, 36)", () => {
  it("the cabin: Business unless First was chosen", () => {
    expect(cabinLabel({ cabin: "first" })).toBe("First");
    expect(cabinLabel({ cabin: "business" })).toBe("Business");
    expect(cabinLabel(null)).toBe("Business");
  });
  it("the travelers: adults only — one by default", () => {
    expect(travelersLabel({ passengers: { adult: 1 } })).toBe("1 adult");
    expect(travelersLabel({ passengers: { adult: 3 } })).toBe("3 adults");
    expect(travelersLabel(undefined)).toBe("1 adult");
  });
});

describe("profileStats (12)", () => {
  const items = [
    { status: "quoted" as const },
    { status: "received" as const },
    { status: "booked" as const },
    { status: "closed" as const },
  ];
  it("trips are every request the club holds; open requests those in progress", () => {
    expect(profileStats(items, false)).toEqual({ trips: "4", open: "2" });
    expect(profileStats([], false)).toEqual({ trips: "0", open: "0" });
  });
  it("a request the server could not pass on is still open", () => {
    expect(profileStats([{ status: "not_sent" as const }, { status: "assigned" as const }], false).open).toBe("2");
  });
  it("past the server's first fifty: more trips, and more open requests only when all fifty are open", () => {
    // The server lists the requests in progress first: a page that ends on a closed one has listed every open one.
    expect(profileStats(items, true)).toEqual({ trips: "4+", open: "2" });
    const allOpen = [{ status: "quoted" as const }, { status: "received" as const }];
    expect(profileStats(allOpen, true)).toEqual({ trips: "2+", open: "2+" });
  });
});

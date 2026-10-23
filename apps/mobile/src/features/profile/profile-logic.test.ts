import { describe, expect, it } from "bun:test";

import { cabinLabel, openRequestsFor, openRequestsLine, profileStats, travelersLabel } from "./profile-logic";

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
  it("trips are the requests not closed (12: 3 of 4); open requests those in progress", () => {
    expect(profileStats(items, false)).toEqual({ trips: "3", open: "2" });
    expect(profileStats([], false)).toEqual({ trips: "0", open: "0" });
  });
  it("a request the server could not pass on is still open", () => {
    expect(profileStats([{ status: "not_sent" as const }, { status: "assigned" as const }], false).open).toBe("2");
  });
  it("past the server's first fifty: more trips, and more open requests only when all fifty are open", () => {
    // The server lists the requests in progress first: a page that ends on a closed one has listed every open one.
    expect(profileStats(items, true)).toEqual({ trips: "3+", open: "2" });
    const allOpen = [{ status: "quoted" as const }, { status: "received" as const }];
    expect(profileStats(allOpen, true)).toEqual({ trips: "2+", open: "2+" });
  });
});

describe("what Delete account says it closes (35, F106)", () => {
  const open = { status: "received" as const };
  const closed = { status: "closed" as const };

  it("the open requests on the server's first page, and whether more lie past it", () => {
    expect(openRequestsFor([open, open, closed], false)).toEqual({ count: 2, more: false });
    // Fifty listed, all open, more past them: the count is not the whole.
    expect(
      openRequestsFor(
        Array.from({ length: 50 }, () => open),
        true,
      ),
    ).toEqual({ count: 50, more: true });
    // In progress first (ADR-IMPL-042): a page that ends on a closed one has listed every open one.
    expect(openRequestsFor([open, closed], true)).toEqual({ count: 1, more: false });
  });

  it("an exact count, `more than` past the first page, nothing when none, no number when it did not load", () => {
    expect(openRequestsLine({ count: 50, more: true })).toBe("This closes more than 50 open requests.");
    expect(openRequestsLine({ count: 3, more: false })).toBe("This closes 3 open requests.");
    expect(openRequestsLine({ count: 1 })).toBe("This closes 1 open request.");
    expect(openRequestsLine({ count: 0, more: false })).toBeNull();
    expect(openRequestsLine(null)).toBe("Any open requests are closed.");
  });
});

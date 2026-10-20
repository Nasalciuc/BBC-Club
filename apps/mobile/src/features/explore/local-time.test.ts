import { describe, expect, it } from "bun:test";

import { localTime, msToNextMinute } from "./local-time";

// 2026-10-08 12:42 UTC: 13:42 in London (BST), 08:42 in New York (EDT), 21:42 in Tokyo.
const NOON = new Date("2026-10-08T12:42:00Z");

describe("localTime", () => {
  it("writes the destination's 24-hour clock and its zone, as 13 does", () => {
    expect(localTime("London", "Europe/London", new Date("2026-11-12T14:32:00Z"))).toEqual({
      clock: "14:32",
      zone: "London (GMT)",
    });
    expect(localTime("New York", "America/New_York", NOON)).toEqual({ clock: "08:42", zone: "New York (EDT)" });
    expect(localTime("Tokyo", "Asia/Tokyo", NOON)?.clock).toBe("21:42");
  });

  it("is null without a zone or with one this runtime cannot format", () => {
    expect(localTime("Lisbon", undefined, NOON)).toBeNull();
    expect(localTime("Lisbon", "", NOON)).toBeNull();
    expect(localTime("Lisbon", "not/a_zone", NOON)).toBeNull();
  });

  it("follows daylight saving — the same instant reads differently across the change", () => {
    expect(localTime("London", "Europe/London", new Date("2026-10-24T12:00:00Z"))?.clock).toBe("13:00");
    expect(localTime("London", "Europe/London", new Date("2026-10-26T12:00:00Z"))?.clock).toBe("12:00");
  });
});

describe("msToNextMinute", () => {
  it("counts to the next whole minute", () => {
    expect(msToNextMinute(new Date("2026-10-08T12:42:00.000Z"))).toBe(60_000);
    expect(msToNextMinute(new Date("2026-10-08T12:42:59.250Z"))).toBe(750);
  });
});

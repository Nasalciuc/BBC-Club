import { describe, expect, it } from "bun:test";

import { localTimeLabel, msToNextMinute } from "./local-time";

// 2026-10-08 12:42 UTC: 13:42 in London (BST), 08:42 in New York (EDT), 21:42 in Tokyo.
const NOON = new Date("2026-10-08T12:42:00Z");

describe("localTimeLabel", () => {
  it("writes the Figma label — city in mono caps, 12-hour clock with AM/PM", () => {
    expect(localTimeLabel("London", "Europe/London", NOON)).toBe("LONDON · 1:42 PM");
    expect(localTimeLabel("Tokyo", "Asia/Tokyo", NOON)).toBe("TOKYO · 9:42 PM");
    expect(localTimeLabel("New York", "America/New_York", NOON)).toBe("NEW YORK · 8:42 AM");
  });

  it("keeps a leading zero out of the hour and a plain space before AM/PM", () => {
    const label = localTimeLabel("Lisbon", "Europe/Lisbon", new Date("2026-10-08T15:42:00Z"));
    expect(label).toBe("LISBON · 4:42 PM");
    expect(label).not.toMatch(/\u202f|\u00a0/);
  });

  it("is null without a zone or with one this runtime cannot format", () => {
    expect(localTimeLabel("Lisbon", undefined, NOON)).toBeNull();
    expect(localTimeLabel("Lisbon", "", NOON)).toBeNull();
    expect(localTimeLabel("Lisbon", "not/a_zone", NOON)).toBeNull();
  });

  it("follows daylight saving — the same instant reads differently across the change", () => {
    const beforeChange = new Date("2026-10-24T12:00:00Z"); // BST
    const afterChange = new Date("2026-10-26T12:00:00Z"); // GMT
    expect(localTimeLabel("London", "Europe/London", beforeChange)).toBe("LONDON · 1:00 PM");
    expect(localTimeLabel("London", "Europe/London", afterChange)).toBe("LONDON · 12:00 PM");
  });
});

describe("msToNextMinute", () => {
  it("counts to the next whole minute", () => {
    expect(msToNextMinute(new Date("2026-10-08T12:42:00.000Z"))).toBe(60_000);
    expect(msToNextMinute(new Date("2026-10-08T12:42:59.250Z"))).toBe(750);
  });
});

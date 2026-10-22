/** The seed's offers against today's clock (ADR-IMPL-047): CHECK offers_valid_after_publish holds whatever the date. */
import { describe, expect, it } from "bun:test";
import { fixture } from "@bbc/shared/fixture";

import { liveValidUntil } from "../scripts/fixture-dates";

const offer = (key: string) => fixture.offers.find((o) => o.key === key)!.validUntil;

describe("liveValidUntil", () => {
  it("keeps the fixture's validity while it still has more than a day to run", () => {
    const now = new Date("2026-10-18T09:00:00Z");
    expect(liveValidUntil(offer("paris"), now).toISOString()).toBe("2026-10-31T23:59:59.000Z");
    expect(liveValidUntil(offer("tokyo"), now).toISOString()).toBe("2026-11-30T23:59:59.000Z");
    expect(liveValidUntil(offer("london"), now).toISOString()).toBe("2027-12-31T23:59:59.000Z");
  });

  it("moves a passed validity on by whole years — same day, same time — from 1 November 2026", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    expect(liveValidUntil(offer("paris"), now).toISOString()).toBe("2027-10-31T23:59:59.000Z");
    expect(liveValidUntil(offer("tokyo"), now).toISOString()).toBe("2026-11-30T23:59:59.000Z");
    const december = new Date("2026-12-01T00:00:00Z");
    expect(liveValidUntil(offer("tokyo"), december).toISOString()).toBe("2027-11-30T23:59:59.000Z");
  });

  it("moves a validity with less than a day left: the seed's clock may run ahead of the database's", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(liveValidUntil(offer("paris"), now).toISOString()).toBe("2027-10-31T23:59:59.000Z");
  });

  it("every offer ends more than a day after `now`, however far the clock has gone", () => {
    for (const iso of ["2026-11-01T00:00:00Z", "2027-06-15T08:00:00Z", "2031-02-28T23:00:00Z"]) {
      const now = new Date(iso);
      for (const o of fixture.offers) {
        const until = liveValidUntil(o.validUntil, now);
        expect(until.getTime()).toBeGreaterThan(now.getTime() + 24 * 60 * 60 * 1000);
        expect(until.toISOString().slice(5)).toBe(new Date(o.validUntil).toISOString().slice(5));
      }
    }
  });

  it("keeps 29 February on the last day of February in a year without one, and back on the 29th in a leap year", () => {
    const leapDay = "2024-02-29T12:00:00Z";
    expect(liveValidUntil(leapDay, new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(liveValidUntil(leapDay, new Date("2027-03-01T00:00:00Z")).toISOString()).toBe("2028-02-29T12:00:00.000Z");
    expect(liveValidUntil(leapDay, new Date("2024-01-01T00:00:00Z")).toISOString()).toBe("2024-02-29T12:00:00.000Z");
    // A day other than the 29th is never moved within its month.
    expect(liveValidUntil("2024-02-28T08:30:00Z", new Date("2025-03-01T00:00:00Z")).toISOString()).toBe(
      "2026-02-28T08:30:00.000Z",
    );
  });

  it("refuses a validity that is not a date", () => {
    expect(() => liveValidUntil("end of October", new Date("2026-11-01T00:00:00Z"))).toThrow(/not a date/);
  });
});

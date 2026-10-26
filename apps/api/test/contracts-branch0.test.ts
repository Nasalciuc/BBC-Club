import { describe, it, expect } from "bun:test";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { FareVM, isCalendarDay } from "@bbc/shared/api/v1/fares";
import { fixture } from "@bbc/shared/fixture";

describe("Branch 0 contracts", () => {
  it("parses RequestBody from the shared fixture", () => {
    const parsed = RequestBody.parse(fixture.request);
    expect(parsed.legs).toHaveLength(2);
    expect(parsed.legs[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.passengers).toEqual({ adult: 1, child: 0, infant: 0 });
    expect(parsed.cabin).toBe("business");
    expect(parsed.fareId).toBe(fixture.fares[0]?.id);
  });

  it("rejects a request that names both a fare and an offer", () => {
    expect(() =>
      RequestBody.parse({
        ...fixture.request,
        offerId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
  });

  it("parses FareVM with and without departAt (cents allowed)", () => {
    expect(() => FareVM.parse(fixture.fares[0])).not.toThrow();
    const noTimes = FareVM.parse(fixture.fares[2]);
    expect(noTimes.departAt).toBeNull();
    const withCents = FareVM.parse(fixture.fares[4]);
    expect(withCents.price.offer).toBe(3900.5);
  });

  it("takes a departure's day only when the calendar has it", () => {
    const day = (departDate: string | null) => FareVM.safeParse({ ...fixture.fares[0], departDate }).success;
    expect(["2026-10-12", "2026-12-31", "2028-02-29", "2000-02-29"].map(day)).toEqual([true, true, true, true]);
    expect(
      ["2026-02-30", "2026-04-31", "2027-02-29", "1900-02-29", "2026-13-01", "2026-10-00", "12 Oct"].map(day),
    ).toEqual([false, false, false, false, false, false, false]);
    expect(day(null)).toBe(true);
    expect(isCalendarDay("2026-02-28")).toBe(true);
    expect(isCalendarDay("2026-2-28")).toBe(false);
  });
});

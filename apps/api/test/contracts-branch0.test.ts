import { describe, it, expect } from "bun:test";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { FareVM } from "@bbc/shared/api/v1/fares";
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
});

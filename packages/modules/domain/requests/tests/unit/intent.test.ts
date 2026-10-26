import { describe, expect, it } from "bun:test";
import { RequestBody, RequestVM } from "@bbc/shared/api/v1/requests";
import { RequestSubmittedV1 } from "@bbc/shared/events/request";
import { effectiveIntent } from "../../src/application/intent";

const contact = { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" };
const base = {
  tripType: "oneway" as const,
  cabin: "business" as const,
  legs: [{ from: "JFK", to: "LHR", date: "2027-10-12" }],
  passengers: { adult: 1, child: 0, infant: 0 },
  contact,
};

const fare = "11111111-1111-4111-8111-111111111111";
const offer = "22222222-2222-4222-8222-222222222222";

describe("RequestBody intent", () => {
  it("accepts a fare, an offer, or neither, and rejects both", () => {
    expect(RequestBody.safeParse({ ...base, fareId: fare }).success).toBe(true);
    expect(RequestBody.safeParse({ ...base, offerId: offer }).success).toBe(true);
    expect(RequestBody.safeParse(base).success).toBe(true);
    expect(RequestBody.safeParse({ ...base, fareId: fare, offerId: offer }).success).toBe(false);
  });

  it("lets a quote stand on its own and rejects one that also names a fare or an offer", () => {
    expect(RequestBody.safeParse({ ...base, intent: "quote" }).success).toBe(true);
    expect(RequestBody.safeParse({ ...base, intent: "quote", fareId: fare }).success).toBe(false);
    expect(RequestBody.safeParse({ ...base, intent: "quote", offerId: offer }).success).toBe(false);
  });

  it("requires the fare an alternative replaces, and rejects that id on anything else", () => {
    expect(RequestBody.safeParse({ ...base, intent: "alternative", replacesFareId: fare }).success).toBe(true);
    expect(RequestBody.safeParse({ ...base, intent: "alternative" }).success).toBe(false);
    expect(RequestBody.safeParse({ ...base, replacesFareId: fare }).success).toBe(false);
    expect(RequestBody.safeParse({ ...base, intent: "quote", replacesFareId: fare }).success).toBe(false);
    expect(RequestBody.safeParse({ ...base, intent: "alternative", replacesFareId: fare, fareId: fare }).success).toBe(
      false,
    );
  });
});

describe("effectiveIntent", () => {
  it("uses a stored intent, otherwise the fare, the offer, or a quote", () => {
    expect(effectiveIntent({ intent: "alternative", fareId: fare, offerId: null })).toBe("alternative");
    expect(effectiveIntent({ intent: "quote", fareId: null, offerId: null })).toBe("quote");
    expect(effectiveIntent({ intent: null, fareId: fare, offerId: null })).toBe("fare");
    expect(effectiveIntent({ intent: null, fareId: null, offerId: offer })).toBe("offer");
    expect(effectiveIntent({ intent: null, fareId: null, offerId: null })).toBe("quote");
  });
});

describe("request.submitted", () => {
  it("still parses a journal row that has no intent", () => {
    const parsed = RequestSubmittedV1.safeParse({
      type: "request.submitted",
      version: 1,
      requestId: fare,
      memberId: null,
      reference: "R-1",
      route: "JFK → LHR",
      cabin: "business",
      fareId: null,
      offerId: null,
      submittedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("is not on the member view", () => {
    expect(Object.keys(RequestVM.shape)).not.toContain("intent");
    expect(Object.keys(RequestVM.shape)).not.toContain("replacesFareId");
  });
});

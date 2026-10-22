import { describe, expect, it } from "bun:test";
import { onboardingProfilePatch, retryWithoutTimezone } from "./onboarding-logic";

describe("onboardingProfilePatch — the PATCH /v1/profile of onboarding's Continue", () => {
  it("carries the phone's zone with the home airport (quiet hours are the member's, not New York's)", () => {
    expect(onboardingProfilePatch("HND", "Asia/Tokyo")).toEqual({ homeAirport: "HND", timezone: "Asia/Tokyo" });
  });

  it("without a place zone on the phone, the airport alone", () => {
    expect(onboardingProfilePatch("JFK", null)).toEqual({ homeAirport: "JFK" });
  });
});

describe("retryWithoutTimezone — a zone the server refuses never holds the member on onboarding", () => {
  const withZone = onboardingProfilePatch("HND", "Asia/Tokyo");

  it("a 400 for a body with a zone: ask again with the airport alone", () => {
    expect(retryWithoutTimezone(withZone, { ok: false, status: 400 })).toEqual({ homeAirport: "HND" });
  });

  it("anything else is answered as it is", () => {
    expect(retryWithoutTimezone(withZone, { ok: true })).toBeNull();
    expect(retryWithoutTimezone(withZone, { ok: false, status: 0 })).toBeNull();
    expect(retryWithoutTimezone(withZone, { ok: false, status: 503 })).toBeNull();
    expect(retryWithoutTimezone({ homeAirport: "HND" }, { ok: false, status: 400 })).toBeNull();
  });
});

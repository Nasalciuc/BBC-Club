import { describe, it, expect } from "bun:test";
import type { Profile } from "@/lib/api";
import { mergeSavedProfile, offersSwitchValue, withOffers, type SavedProfile } from "./notifications-logic";

function profile(offers: boolean): Profile {
  return {
    memberId: "m1",
    status: "active",
    email: "a@test.dev",
    displayName: "Alex",
    homeAirport: "JFK",
    timezone: "America/New_York",
    phone: null,
    memberSince: "2026-01-01T00:00:00.000Z",
    crmLinkedAt: null,
    crmLinked: true,
    preferences: {},
    notifications: { requestUpdates: true, offers },
  };
}

/** What PATCH /v1/profile answers with: the row, without `notifications`. */
function rawRow(p: Profile): SavedProfile {
  const row: SavedProfile = { ...p };
  delete row.notifications;
  return row;
}

describe("offersSwitchValue", () => {
  it("is what the member saved — off stays off after a restart", () => {
    expect(offersSwitchValue(profile(false))).toBe(false);
    expect(offersSwitchValue(profile(true))).toBe(true);
  });

  it("is null, never a default, while the saved value is unknown", () => {
    expect(offersSwitchValue(null)).toBeNull();
    expect(offersSwitchValue(rawRow(profile(false)))).toBeNull();
  });
});

describe("mergeSavedProfile", () => {
  it("keeps the saved preference when a PATCH answer (the raw row) has none", () => {
    const merged = mergeSavedProfile(profile(false), rawRow({ ...profile(true), phone: "+12125550100" }));
    expect(merged.phone).toBe("+12125550100");
    expect(merged.notifications).toEqual({ requestUpdates: true, offers: false });
  });

  it("takes the server's value when the answer carries it", () => {
    expect(mergeSavedProfile(profile(false), profile(true)).notifications.offers).toBe(true);
  });
});

describe("withOffers", () => {
  it("records the accepted value and leaves request updates on", () => {
    expect(withOffers(profile(true), false).notifications).toEqual({ requestUpdates: true, offers: false });
  });
});

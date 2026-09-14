import { describe, it, expect } from "bun:test";
import { EVENT_CATALOGUE, event, type EventType } from "@bbc/shared/events";

/** Every catalogue entry must accept a payload built by event(); a schema that base() cannot satisfy is a bug. */
const EXAMPLES: Record<EventType, Record<string, unknown>> = {
  "member.registered": { memberId: "m1", emailNormalized: "a@b.com", registeredAt: new Date().toISOString() },
  "member.email_verified": { memberId: "m1", verifiedAt: new Date().toISOString() },
  "member.password_changed": { memberId: "m1", changedAt: new Date().toISOString(), reason: "reset" },
  "member.profile_updated": { memberId: "m1", fields: ["homeAirport"], updatedAt: new Date().toISOString() },
  "member.linked_to_crm": { memberId: "m1", crmClientId: "crm_1", linkedAt: new Date().toISOString() },
  "member.deleted": { memberId: "m1", deletedAt: new Date().toISOString() },
  "offer.published": {
    offerId: "00000000-0000-4000-8000-000000000001",
    targeting: "broadcast",
    targetMemberId: null,
    routeFrom: "JFK",
    routeTo: "LHR",
    cabin: "business",
    title: "x",
    validUntil: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  },
  "offer.expired": { offerId: "00000000-0000-4000-8000-000000000001", expiredAt: new Date().toISOString() },
  "offer.withdrawn": { offerId: "00000000-0000-4000-8000-000000000001", withdrawnAt: new Date().toISOString() },
  "offer.viewed": {
    offerId: "00000000-0000-4000-8000-000000000001",
    memberId: "m1",
    viewedAt: new Date().toISOString(),
  },
  "offer.responded": {
    offerId: "00000000-0000-4000-8000-000000000001",
    memberId: "m1",
    response: "interested",
    at: new Date().toISOString(),
  },
  "notification.delivered": {
    notificationId: "00000000-0000-4000-8000-000000000002",
    memberId: "m1",
    platform: "ios",
    at: new Date().toISOString(),
  },
  "notification.failed": {
    notificationId: "00000000-0000-4000-8000-000000000002",
    memberId: "m1",
    platform: "ios",
    reason: "Unregistered",
    at: new Date().toISOString(),
  },
  "crm.mirror.synced": {
    runId: "00000000-0000-4000-8000-000000000003",
    rowsUpserted: 10,
    newEmails: [],
    syncedAt: new Date().toISOString(),
  },
  "crm.activity_created": {
    memberId: "m1",
    offerId: "00000000-0000-4000-8000-000000000001",
    crmActivityId: null,
    at: new Date().toISOString(),
  },
};

describe("event catalogue", () => {
  for (const type of Object.keys(EVENT_CATALOGUE) as EventType[]) {
    it(`${type}: event() produces a payload the schema accepts`, () => {
      const payload = event(type, EXAMPLES[type] as any);
      expect(() => EVENT_CATALOGUE[type].schema.parse(payload)).not.toThrow();
      expect(payload).toMatchObject({ type, version: EVENT_CATALOGUE[type].version });
    });
  }

  it("a hand-written payload without type/version is rejected — the bug event() exists to prevent", () => {
    const { type: _t, version: _v, ...bare } = event("member.linked_to_crm", EXAMPLES["member.linked_to_crm"] as any);
    expect(() => EVENT_CATALOGUE["member.linked_to_crm"].schema.parse(bare)).toThrow();
  });
});

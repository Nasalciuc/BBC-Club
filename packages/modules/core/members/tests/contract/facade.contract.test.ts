/** Members facade contract: idempotent profile creation and CRM linking.
 *  Runs against an isolated clone of the test template. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createMembersFacade } from "../../src/api";
import { onMemberRegistered } from "../../src/handlers/on-member-registered";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("members-contract", { max: 3 });
  db = iso.db;
});
afterAll(async () => {
  await iso.drop();
});

function randomId() {
  return crypto.randomUUID();
}

async function cleanup(memberIds: string[]) {
  for (const id of memberIds) {
    await db.execute(sql`DELETE FROM members.notification_preferences WHERE member_id = ${id}`);
    await db.execute(sql`DELETE FROM members.profile WHERE member_id = ${id}`);
  }
}

describe("@bbc/members facade", () => {
  it("member.registered delivered twice creates exactly one profile", async () => {
    const memberId = randomId();
    const email = `contract.${memberId}@test.dev`;
    try {
      const handler = (tx: any) =>
        onMemberRegistered(
          {
            tx,
            crm: { findByEmail: async () => null },
            flags: { get: async () => false },
            publish: async () => {},
          },
          {
            type: "member.registered",
            version: 1,
            memberId,
            emailNormalized: email,
            registeredAt: new Date().toISOString(),
          },
        );
      // Deliver twice
      await db.transaction(handler);
      await db.transaction(handler);

      const facade = createMembersFacade(db);
      const profile = await facade.getProfile(undefined, memberId);
      expect(profile).not.toBeNull();
      expect(profile!.memberId).toBe(memberId);
      expect(profile!.status).toBe("waitlist"); // unknown CRM email → waitlist

      // Only one profile row
      const [{ n }]: any = await db.execute(
        sql`SELECT count(*)::int n FROM members.profile WHERE member_id = ${memberId}`,
      );
      expect(n).toBe(1);
    } finally {
      await cleanup([memberId]);
    }
  });

  it("unknown CRM email → waitlist, known → active", async () => {
    const memberId = randomId();
    const email = `active.${memberId}@test.dev`;
    try {
      await db.transaction((tx: any) =>
        onMemberRegistered(
          {
            tx,
            crm: { findByEmail: async () => ({ crmClientId: "crm_test", fullName: "Test User", homeAirport: "JFK" }) },
            flags: { get: async () => false },
            publish: async () => {},
          },
          {
            type: "member.registered",
            version: 1,
            memberId,
            emailNormalized: email,
            registeredAt: new Date().toISOString(),
          },
        ),
      );
      const facade = createMembersFacade(db);
      const profile = await facade.getProfile(undefined, memberId);
      expect(profile!.status).toBe("active");
      expect(profile!.crmLinked).toBe(true);
    } finally {
      await cleanup([memberId]);
    }
  });

  it("updateProfile updates only provided fields", async () => {
    const memberId = randomId();
    try {
      // Seed profile
      await db.execute(sql`INSERT INTO members.profile (member_id, status) VALUES (${memberId}, 'active')`);
      const facade = createMembersFacade(db);
      const updated = await facade.updateProfile(undefined, memberId, { displayName: "Alex", homeAirport: "JFK" });
      expect(updated!.displayName).toBe("Alex");
      expect(updated!.homeAirport).toBe("JFK");
    } finally {
      await cleanup([memberId]);
    }
  });

  it("getProfile returns null for unknown member", async () => {
    const facade = createMembersFacade(db);
    const p = await facade.getProfile(undefined, randomId());
    expect(p).toBeNull();
  });
});

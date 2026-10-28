/** Members facade contract: idempotent profile creation and CRM linking.
 *  Runs against an isolated clone of the test template. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createMembersFacade } from "../../src/application/facade";
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

  it("ensureProfile makes the row the delivery would; the delivery then adds nothing and links once, from the row", async () => {
    const linkedEarly = randomId();
    const waitlisted = randomId();
    const known = { crmClientId: "crm_early", fullName: "Carol King", homeAirport: "BOS" };
    const off = { get: async () => false };
    try {
      const facade = createMembersFacade(db);
      await facade.ensureProfile(undefined, linkedEarly, "carol@test.dev", {
        crm: { findByEmail: async () => known },
        flags: off,
      });
      await facade.ensureProfile(undefined, waitlisted, "dave@test.dev", {
        crm: { findByEmail: async () => null },
        flags: off,
      });
      // Already there: left as it is.
      await facade.ensureProfile(undefined, linkedEarly, "carol@test.dev", {
        crm: { findByEmail: async () => null },
        flags: off,
      });
      expect((await facade.getProfile(undefined, linkedEarly))?.status).toBe("active");
      expect((await facade.getProfile(undefined, linkedEarly))?.crmLinked).toBe(true);
      expect((await facade.getProfile(undefined, waitlisted))?.status).toBe("waitlist");

      const deliver = async (memberId: string, email: string) => {
        const published: { type: string; payload: unknown }[] = [];
        await db.transaction((tx: any) =>
          onMemberRegistered(
            {
              tx,
              // The CRM knows both by now: the link still follows the row, never this late match.
              crm: { findByEmail: async () => known },
              flags: off,
              publish: async (e) => {
                published.push(e);
              },
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
        return published;
      };
      const links = await deliver(linkedEarly, "carol@test.dev");
      expect(links.map((e) => e.type)).toEqual(["member.linked_to_crm"]);
      expect((links[0]?.payload as { crmClientId: string }).crmClientId).toBe("crm_early");
      expect(await deliver(waitlisted, "dave@test.dev")).toEqual([]);
      expect((await facade.getProfile(undefined, waitlisted))?.status).toBe("waitlist");

      const [{ n }]: any = await db.execute(
        sql`SELECT count(*)::int n FROM members.profile WHERE member_id IN (${linkedEarly}, ${waitlisted})`,
      );
      expect(n).toBe(2);
    } finally {
      await cleanup([linkedEarly, waitlisted]);
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

  // ADR-IMPL-056: the member's photo — stored and read; a profile patch does not write it.
  it("getProfile reads the member's photo, none until one is stored; a profile update leaves it", async () => {
    const memberId = randomId();
    try {
      await db.execute(sql`INSERT INTO members.profile (member_id, status) VALUES (${memberId}, 'active')`);
      const facade = createMembersFacade(db);
      expect((await facade.getProfile(undefined, memberId))?.avatarUrl).toBeNull();
      const url = "https://cdn.example.com/members/daniel.webp";
      await db.execute(sql`UPDATE members.profile SET avatar_url = ${url} WHERE member_id = ${memberId}`);
      expect((await facade.getProfile(undefined, memberId))?.avatarUrl).toBe(url);
      const updated = await facade.updateProfile(undefined, memberId, { displayName: "Daniel" });
      expect([updated?.displayName, updated?.avatarUrl]).toEqual(["Daniel", url]);
    } finally {
      await cleanup([memberId]);
    }
  });

  it("two travel saves at the same moment both land: the merge is one statement, never read-merge-write", async () => {
    const memberId = randomId();
    try {
      await db.execute(sql`INSERT INTO members.profile (member_id, status) VALUES (${memberId}, 'active')`);
      const facade = createMembersFacade(db);
      const lost: number[] = [];
      for (let round = 0; round < 20; round++) {
        await db.execute(sql`UPDATE members.profile SET preferences = '{}'::jsonb WHERE member_id = ${memberId}`);
        await Promise.all([
          facade.setTravelPreferences(undefined, memberId, { cabin: "first" }),
          facade.setTravelPreferences(undefined, memberId, { passengers: { adult: 2, child: 0, infant: 0 } }),
        ]);
        const p = await facade.getProfile(undefined, memberId);
        if (p?.preferences.cabin !== "first" || p.preferences.passengers?.adult !== 2) lost.push(round);
      }
      expect(lost).toEqual([]);

      // Top-level keys replace, as the spread did; keys not sent stay.
      const after = await facade.setTravelPreferences(undefined, memberId, {
        passengers: { adult: 1, child: 1, infant: 0 },
        destinations: ["LHR"],
      });
      expect(after?.preferences).toEqual({
        cabin: "first",
        passengers: { adult: 1, child: 1, infant: 0 },
        destinations: ["LHR"],
      });
      // An unknown member has no row to merge into.
      expect(await facade.setTravelPreferences(undefined, randomId(), { cabin: "first" })).toBeNull();
    } finally {
      await cleanup([memberId]);
    }
  });

  it("deliverabilityOf answers what getStatus and preferencesOf answer, for a batch, in two statements (ADR-IMPL-077)", async () => {
    const [a, b, none] = [randomId(), randomId(), randomId()];
    const facade = createMembersFacade(db);
    try {
      await db.execute(
        sql`INSERT INTO members.profile (member_id, status) VALUES (${a}, 'active'), (${b}, 'waitlist')`,
      );
      await db.execute(
        sql`INSERT INTO members.notification_preferences (member_id, category, enabled) VALUES (${a}, 'offers_broadcast', false)`,
      );
      let statements = 0;
      const counted = new Proxy(db, {
        get(t, k) {
          const v = Reflect.get(t, k);
          if (k === "select")
            return (...args: unknown[]) => {
              statements++;
              return (v as (...x: unknown[]) => unknown).apply(t, args);
            };
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
      const got = await facade.deliverabilityOf(counted as never, [a, b, none, a]);
      expect(statements).toBe(2);
      for (const id of [a, b, none]) {
        expect(got.get(id)).toEqual({
          status: await facade.getStatus(db, id),
          prefs: await facade.preferencesOf(db, id),
        });
      }
      expect(got.get(a)?.prefs).toEqual({ offers_personal: true, offers_broadcast: false });
      expect(got.get(none)?.status).toBe("pending");
      expect((await facade.deliverabilityOf(db, [])).size).toBe(0);
    } finally {
      await cleanup([a, b]);
    }
  });

  it("deliverabilityOf for 1, 7 or 100 members is the same two statements, each list one parameter (ADR-IMPL-077)", async () => {
    const statements: { text: string; params: number }[] = [];
    const logged = createDb(iso.url, {
      max: 1,
      logger: { logQuery: (text, params) => statements.push({ text, params: params.length }) },
    });
    try {
      const facade = createMembersFacade(logged);
      for (const n of [1, 7, 100])
        await facade.deliverabilityOf(
          logged,
          Array.from({ length: n }, () => randomId()),
        );
      expect(statements.length).toBe(6);
      expect(new Set(statements.map((s) => s.text)).size).toBe(2);
      expect(statements.every((s) => s.params === 1)).toBe(true);
    } finally {
      await logged.close();
    }
  });

  it("getProfile returns null for unknown member", async () => {
    const facade = createMembersFacade(db);
    const p = await facade.getProfile(undefined, randomId());
    expect(p).toBeNull();
  });

  it("a deleted member is invisible to profile reads and writes; only getStatus still says so", async () => {
    const memberId = randomId();
    try {
      await db.execute(sql`INSERT INTO members.profile (member_id, status, display_name, home_airport, preferences)
        VALUES (${memberId}, 'active', 'Alex', 'JFK', '{"cabin":"business"}'::jsonb)`);
      await db.execute(
        sql`UPDATE members.profile SET status = 'deleted', deleted_at = now() WHERE member_id = ${memberId}`,
      );
      const facade = createMembersFacade(db);

      expect(await facade.getProfile(undefined, memberId)).toBeNull();
      expect(
        await facade.updateProfile(undefined, memberId, { displayName: "Changed", homeAirport: "LHR" }),
      ).toBeNull();
      expect(await facade.setTravelPreferences(undefined, memberId, { cabin: "first" })).toBeNull();
      expect(await facade.getStatus(undefined, memberId)).toBe("deleted"); // dispatch suppresses with member_deleted

      // Nothing was written: the row is exactly as the deletion left it.
      const [row] = (await db.execute(sql`SELECT display_name, home_airport, preferences FROM members.profile
        WHERE member_id = ${memberId}`)) as unknown as {
        display_name: string;
        home_airport: string;
        preferences: unknown;
      }[];
      expect(row).toEqual({ display_name: "Alex", home_airport: "JFK", preferences: { cabin: "business" } });
    } finally {
      await cleanup([memberId]);
    }
  });
});

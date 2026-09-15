/** Proposals facade contract: visibility rules, feed filtering.
 *  Runs against postgres-test. Inserts fresh offers per test. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { offersRepo } from "../../src/infrastructure/offers.repo";

let db: ReturnType<typeof createDb>;
beforeAll(() => {
  const env = loadEnv(process.env);
  db = createDb(env.DATABASE_URL, { max: 3, applicationName: "bbc-proposals-contract" });
});
afterAll(async () => {
  await db.close();
});

const ACTOR = "contract-member-" + crypto.randomUUID();
const OTHER = "other-member-" + crypto.randomUUID();

async function insertOffer(over: Record<string, unknown> = {}): Promise<string> {
  const key = "contract:" + crypto.randomUUID();
  const [{ id }]: any = await db.execute(sql`
    INSERT INTO proposals.offers (idempotency_key, source, targeting, route_from, route_to, cabin,
      price, title, publish_at, valid_until, status)
    VALUES (${key}, 'crm_agent', ${over.targeting ?? "broadcast"}, 'JFK', 'LHR', 'business',
      '4200.00', ${"Test " + key}, now(), ${over.validUntil ?? new Date(Date.now() + 86_400_000).toISOString()}, ${over.status ?? "active"})
    RETURNING id
  `);
  if (over.targeting === "user" && over.targetMemberId) {
    await db.execute(sql`
      UPDATE proposals.offers SET target_member_id = ${over.targetMemberId},
        targeting = 'user' WHERE id = ${id}
    `);
  }
  return id as string;
}

async function cleanup(offerIds: string[]) {
  for (const id of offerIds) {
    await db.execute(sql`DELETE FROM proposals.offers WHERE id = ${id}`);
  }
}

describe("@bbc/proposals facade", () => {
  it("getVisible returns null for another member's targeted offer (IDOR guard)", async () => {
    const id = await insertOffer({ targeting: "user", targetMemberId: OTHER });
    try {
      const row = await offersRepo.getVisible(db, ACTOR, id);
      expect(row).toBeNull();
    } finally {
      await cleanup([id]);
    }
  });

  it("getVisible returns the offer when targeted at me", async () => {
    const id = await insertOffer({ targeting: "user", targetMemberId: ACTOR });
    try {
      const row = await offersRepo.getVisible(db, ACTOR, id);
      expect(row).not.toBeNull();
      expect((row as any).id).toBe(id);
    } finally {
      await cleanup([id]);
    }
  });

  it("feed = active ∧ valid_until > now ∧ (broadcast ∨ targeted at me)", async () => {
    const activeId = await insertOffer({ targeting: "broadcast" });
    const expiredId = await insertOffer({
      targeting: "broadcast",
      validUntil: new Date(Date.now() - 1000).toISOString(),
    });
    const otherTargetId = await insertOffer({ targeting: "user", targetMemberId: OTHER });
    const myTargetId = await insertOffer({ targeting: "user", targetMemberId: ACTOR });
    try {
      const items = await offersRepo.feed(db, ACTOR, null, 100);
      const ids = (items as any[]).map((r) => r.id);
      expect(ids).toContain(activeId);
      expect(ids).toContain(myTargetId);
      expect(ids).not.toContain(expiredId);
      expect(ids).not.toContain(otherTargetId);
    } finally {
      await cleanup([activeId, expiredId, otherTargetId, myTargetId]);
    }
  });

  it("getAny returns any offer regardless of actor", async () => {
    const id = await insertOffer({ targeting: "user", targetMemberId: OTHER });
    try {
      const row = await offersRepo.getAny(db, id);
      expect(row).not.toBeNull();
    } finally {
      await cleanup([id]);
    }
  });
});

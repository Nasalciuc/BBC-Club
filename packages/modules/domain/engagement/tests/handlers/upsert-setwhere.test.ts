import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { responsesRepo } from "../../src/infrastructure/responses.repo";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("engagement-upsert", { max: 2 });
  db = iso.db;
});
afterAll(() => iso.drop());

describe("responses.repo.upsert setWhere (drizzle onConflictDoUpdate)", () => {
  it("second identical upsert returns the same row with no change", async () => {
    const offerId = crypto.randomUUID();
    const memberId = `m_${crypto.randomUUID()}`;
    // Minimal offer so FK (if any) is not required — engagement.offer_responses has no FK to offers by design.
    await db.execute(sql`
      INSERT INTO engagement.offer_responses (offer_id, member_id, response)
      VALUES (${offerId}, ${memberId}, 'interested')
      ON CONFLICT DO NOTHING`);
    // Clear and use upsert from empty
    await db.execute(
      sql`DELETE FROM engagement.offer_responses WHERE offer_id = ${offerId} AND member_id = ${memberId}`,
    );

    const a = await responsesRepo.upsert(db, memberId, offerId, "interested");
    const b = await responsesRepo.upsert(db, memberId, offerId, "interested");
    expect(a?.response).toBe("interested");
    expect(b?.response).toBe("interested");
    expect(a?.createdAt?.getTime()).toBe(b?.createdAt?.getTime());

    await db.execute(
      sql`DELETE FROM engagement.offer_responses WHERE offer_id = ${offerId} AND member_id = ${memberId}`,
    );
  });
});

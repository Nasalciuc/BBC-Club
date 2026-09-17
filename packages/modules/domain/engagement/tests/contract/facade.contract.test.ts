/** Engagement facade contract: upsert + responsesFor (respond HTTP removed in Branch 3). */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { responsesRepo } from "../../src/infrastructure/responses.repo";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("engagement-contract", { max: 3 });
  db = iso.db;
});
afterAll(async () => {
  await iso.drop();
});

const ACTOR = "engagement-actor-" + crypto.randomUUID();

async function cleanup(offerIds: string[]) {
  for (const id of offerIds) {
    await db.execute(sql`DELETE FROM engagement.offer_responses WHERE offer_id = ${id}`);
  }
}

describe("@bbc/engagement facade", () => {
  it("a second identical upsert is a no-op with the same state", async () => {
    const offerId = crypto.randomUUID();
    try {
      const r1 = await responsesRepo.upsert(db, ACTOR, offerId, "interested");
      const r2 = await responsesRepo.upsert(db, ACTOR, offerId, "interested");
      expect(r1?.response).toBe("interested");
      expect(r2?.response).toBe("interested");
      const [{ n }]: any = await db.execute(
        sql`SELECT count(*)::int n FROM engagement.offer_responses WHERE offer_id = ${offerId} AND member_id = ${ACTOR}`,
      );
      expect(n).toBe(1);
    } finally {
      await cleanup([offerId]);
    }
  });

  it("dismissed after interested updates the state", async () => {
    const offerId = crypto.randomUUID();
    try {
      await responsesRepo.upsert(db, ACTOR, offerId, "interested");
      const r = await responsesRepo.upsert(db, ACTOR, offerId, "dismissed");
      expect(r?.response).toBe("dismissed");
    } finally {
      await cleanup([offerId]);
    }
  });

  it("responsesFor returns a map of offerId → state for the actor", async () => {
    const o1 = crypto.randomUUID();
    const o2 = crypto.randomUUID();
    try {
      await responsesRepo.upsert(db, ACTOR, o1, "interested");
      const map = await responsesRepo.responsesFor(db, ACTOR, [o1, o2]);
      expect(map[o1]).toBe("interested");
      expect(map[o2]).toBeUndefined();
    } finally {
      await cleanup([o1, o2]);
    }
  });
});

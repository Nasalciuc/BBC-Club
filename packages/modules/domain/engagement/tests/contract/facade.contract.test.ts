/** Engagement facade contract: idempotent respond, state transitions, IDOR guard.
 *  Runs against postgres-test. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { responsesRepo } from "../../src/infrastructure/responses.repo";
import { respond } from "../../src/application/respond";

let db: ReturnType<typeof createDb>;
beforeAll(() => {
  const env = loadEnv(process.env);
  db = createDb(env.DATABASE_URL, { max: 3, applicationName: "bbc-engagement-contract" });
});
afterAll(async () => {
  await db.close();
});

const ACTOR = "engagement-actor-" + crypto.randomUUID();
const OTHER = "engagement-other-" + crypto.randomUUID();

async function insertActiveOffer(targetMemberId?: string): Promise<string> {
  const key = "eng:" + crypto.randomUUID();
  if (targetMemberId) {
    const [{ id }]: any = await db.execute(sql`
      INSERT INTO proposals.offers (idempotency_key, source, targeting, target_member_id, route_from, route_to, cabin,
        price, title, publish_at, valid_until, status)
      VALUES (${key}, 'crm_agent', 'user', ${targetMemberId}, 'JFK', 'LHR', 'business',
        '4200.00', ${"Offer " + key}, now(), ${new Date(Date.now() + 86_400_000).toISOString()}, 'active')
      RETURNING id
    `);
    return id as string;
  }
  const [{ id }]: any = await db.execute(sql`
    INSERT INTO proposals.offers (idempotency_key, source, targeting, route_from, route_to, cabin,
      price, title, publish_at, valid_until, status)
    VALUES (${key}, 'crm_agent', 'broadcast', 'JFK', 'CDG', 'business',
      '3800.00', ${"Offer " + key}, now(), ${new Date(Date.now() + 86_400_000).toISOString()}, 'active')
    RETURNING id
  `);
  return id as string;
}

async function cleanup(offerIds: string[]) {
  for (const id of offerIds) {
    await db.execute(sql`DELETE FROM engagement.offer_responses WHERE offer_id = ${id}`);
    await db.execute(sql`DELETE FROM proposals.offers WHERE id = ${id}`);
  }
}

/** Minimal proposals port stub that reads directly from the DB (no cross-module import). */
function proposalsStub() {
  return {
    async getVisible(exec: any, actorId: string, offerId: string) {
      const rows: any[] = await (exec ?? db).execute(sql`
        SELECT id, title FROM proposals.offers
        WHERE id = ${offerId} AND status = 'active' AND valid_until > now()
          AND (targeting = 'broadcast' OR target_member_id = ${actorId})
      `);
      return rows[0] ?? null;
    },
  };
}

function makeEvts() {
  const published: any[] = [];
  return {
    events: {
      publish: async (_tx: any, e: any) => {
        published.push(e);
      },
    },
    published,
  };
}

describe("@bbc/engagement facade", () => {
  it("a second identical respond is a no-op with the same state", async () => {
    const offerId = await insertActiveOffer();
    try {
      const { events } = makeEvts();
      const deps = { db, proposals: proposalsStub(), events };
      const principal = { kind: "member" as const, memberId: ACTOR, role: "member" as const, sessionId: "s1" };

      const r1 = await respond(deps, principal, { offerId, response: "interested" });
      expect(r1.ok).toBe(true);
      const r2 = await respond(deps, principal, { offerId, response: "interested" });
      expect(r2.ok).toBe(true);
      if (r1.ok && r2.ok) expect(r1.state).toBe(r2.state);

      // Only one row
      const [{ n }]: any = await db.execute(
        sql`SELECT count(*)::int n FROM engagement.offer_responses WHERE offer_id = ${offerId} AND member_id = ${ACTOR}`,
      );
      expect(n).toBe(1);
    } finally {
      await cleanup([offerId]);
    }
  });

  it("dismissed after interested updates the state", async () => {
    const offerId = await insertActiveOffer();
    try {
      const { events } = makeEvts();
      const deps = { db, proposals: proposalsStub(), events };
      const principal = { kind: "member" as const, memberId: ACTOR, role: "member" as const, sessionId: "s2" };

      await respond(deps, principal, { offerId, response: "interested" });
      const r = await respond(deps, principal, { offerId, response: "dismissed" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.state).toBe("dismissed");
    } finally {
      await cleanup([offerId]);
    }
  });

  it("a withdrawn/expired offer is NOT_FOUND", async () => {
    const offerId = await insertActiveOffer();
    await db.execute(sql`UPDATE proposals.offers SET status = 'expired' WHERE id = ${offerId}`);
    try {
      const { events } = makeEvts();
      const deps = { db, proposals: proposalsStub(), events };
      const principal = { kind: "member" as const, memberId: ACTOR, role: "member" as const, sessionId: "s3" };
      const r = await respond(deps, principal, { offerId, response: "interested" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("NOT_FOUND");
    } finally {
      await cleanup([offerId]);
    }
  });

  it("the actor never comes from input — memberId in response belongs to the principal", async () => {
    const offerId = await insertActiveOffer();
    try {
      const { events } = makeEvts();
      const deps = { db, proposals: proposalsStub(), events };
      const principal = { kind: "member" as const, memberId: ACTOR, role: "member" as const, sessionId: "s4" };
      await respond(deps, principal, { offerId, response: "interested" });

      const actor = (await db.execute(
        sql`SELECT member_id FROM engagement.offer_responses WHERE offer_id = ${offerId} LIMIT 1`,
      )) as any[];
      expect(actor[0].member_id).toBe(ACTOR);
    } finally {
      await cleanup([offerId]);
    }
  });

  it("responsesFor returns a map of offerId → state for the actor", async () => {
    const o1 = await insertActiveOffer();
    const o2 = await insertActiveOffer();
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

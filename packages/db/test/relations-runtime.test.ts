import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { offers, offerTargets } from "../src/schema/proposals";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("db-relations", { max: 2 });
  db = iso.db;
});
afterAll(() => iso.drop());

describe("drizzle relations (1.0.0-rc.4)", () => {
  it("defineRelations + db.query.offers.findMany({ with: { targets: true } }) returns nested rows", async () => {
    const id = crypto.randomUUID();
    const memberId = `m_${crypto.randomUUID()}`;
    await db.insert(offers).values({
      id,
      idempotencyKey: `rel:${id}`,
      source: "marketing_campaign",
      targeting: "broadcast",
      routeFrom: "JFK",
      routeTo: "CDG",
      cabin: "business",
      price: "1000.00",
      title: "relations probe",
      validUntil: new Date(Date.now() + 86_400_000),
      status: "active",
    });
    await db.insert(offerTargets).values({ offerId: id, memberId });

    const rows = await (db as any).query.offers.findMany({
      where: { id },
      with: { targets: true },
      limit: 1,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].targets?.length).toBe(1);
    expect(rows[0].targets[0].memberId).toBe(memberId);

    await db.execute(sql`DELETE FROM proposals.offer_targets WHERE offer_id = ${id}`);
    await db.execute(sql`DELETE FROM proposals.offers WHERE id = ${id}`);
  });
});

describe("postgres.js connection options", () => {
  it("statement_timeout is 15000ms on the session", async () => {
    const rows: any[] = await db.execute(sql`SELECT current_setting('statement_timeout') AS t`);
    // postgres.js may report "15s" or "15000ms" depending on version
    const t = String(rows[0].t);
    expect(t === "15s" || t === "15000ms" || t === "15000").toBe(true);
  });
});

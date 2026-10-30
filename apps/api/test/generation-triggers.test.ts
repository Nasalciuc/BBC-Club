/** ADR-IMPL-075 (G4): every counter a request reads has a trigger that bumps it. A key with no trigger would read 0 for
 *  the life of the database, and whatever was built on it would never load again. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp({ suite: "generation-triggers" });
});
afterAll(() => t.close());

describe("generation keys", () => {
  it("each key Home, the feed and the airports read is bumped by a trigger on some table", async () => {
    const cookie = { headers: { Cookie: t.memberA.cookie } };
    for (const path of ["/v1/home", "/v1/proposals", "/v1/airports?q=lon", "/v1/airports/popular?from=JFK"])
      expect((await t.app.request(path, cookie)).status, path).toBeLessThan(400);
    const keys = t.platform.reference.generations.keysAsked();
    expect(keys.length).toBeGreaterThan(0);
    // pg_trigger keeps a trigger's arguments as one bytea, each argument ended by a zero byte.
    const rows = (await t.db.execute(sql`
      SELECT DISTINCT convert_from(substring(t.tgargs FROM 1 FOR position('\\x00'::bytea IN t.tgargs) - 1), 'UTF8') AS key
      FROM pg_trigger t
      WHERE t.tgfoid = 'platform.bump_generation_trigger'::regproc AND NOT t.tgisinternal`)) as unknown as {
      key: string;
    }[];
    const bumped = new Set(rows.map((r) => r.key));
    expect(keys.filter((k) => !bumped.has(k))).toEqual([]);
  });
});

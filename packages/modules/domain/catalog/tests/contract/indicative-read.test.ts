/** A quote's estimate asks only whether the search shows fares (ADR-IMPL-077): one read of the route, without the
 *  clocks a search computes per fare — which read an airport per row when no zone was given. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import { catalogModule } from "../../src/module";
import { storedPricingRules } from "../../src/pricing/rules";
import { FIXTURE_RULES } from "../unit/pricing-rules.fixture";

const log: string[] = [];
let iso: IsolatedDb;
let facade: NonNullable<Awaited<ReturnType<ReturnType<typeof catalogModule>["init"]>>["exposes"]>;

beforeAll(async () => {
  iso = await isolatedDb("catalog-indicative-read", { logger: { logQuery: (q) => log.push(q) } });
  const platform = createPlatform(iso.db, { level: "silent" });
  const out = await catalogModule().init({
    db: iso.db,
    platform,
    env: { APP_ORIGIN: "https://api.example.test" } as never,
    ports: {},
  });
  if (!out.exposes) throw new Error("catalog exposes nothing");
  facade = out.exposes;
  await platform.flags.set("catalog.estimates", { enabled: true });
  await platform.flags.set("catalog.pricing_rules", storedPricingRules(FIXTURE_RULES));
});
afterAll(() => iso.drop());

describe("indicativeFor's read of the fares", () => {
  it("asks whether a fare is on sale, never the fares' clocks: no time zone in the statement", async () => {
    log.length = 0;
    expect(await facade.indicativeFor(undefined, { from: "JFK", to: "ZRH", cabin: "business" })).toMatchObject({
      basis: "formula",
    });
    const read = log.filter((q) => /from "catalog"\."fares"/i.test(q));
    expect(read).toHaveLength(1);
    expect(read[0]).not.toMatch(/time zone|"origin"|"dest"/i);
  });

  it("a fare on sale still wins over the estimate", async () => {
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from,
        valid_until, published)
      VALUES ('JFK', 'ZRH', 'business', 'LX', true, '2500.00', 'USD', 'manual', now() - interval '1 day',
        now() + interval '30 days', true)`);
    expect(await facade.indicativeFor(undefined, { from: "JFK", to: "ZRH", cabin: "business" })).toBeNull();
    expect(await facade.indicativeFor(undefined, { from: "JFK", to: "ZRH", cabin: "first" })).not.toBeNull();
  });
});

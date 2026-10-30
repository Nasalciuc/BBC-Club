/** Staging's real data (ADR-IMPL-040, 30 Oct 2026): the flags turned on, idempotently, keeping what else they hold. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

import { STAGING_REAL_DATA_FLAGS, enableStagingRealData } from "../../../scripts/staging-real-data";
import { testApp } from "./helpers/test-app";

describe("staging real data", () => {
  it("turns the site's flags on once, keeps their other settings, leaves the photos and says if a search can use the rules", async () => {
    const t = await testApp({ suite: "staging-real-data" });
    const flag = async (key: string) =>
      (
        (await t.db.execute(sql`SELECT value FROM platform.flags WHERE key = ${key}`)) as unknown as {
          value: Record<string, unknown>;
        }[]
      )[0]?.value;
    const set = (key: string, value: string) =>
      t.db.execute(sql`
        INSERT INTO platform.flags (key, value) VALUES (${key}, ${value}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await set("catalog.site_pins", '{"enabled":false,"skip":[23]}');
    await set("catalog.site_photos", '{"enabled":false}');
    await t.db.execute(sql`DELETE FROM platform.flags WHERE key = 'catalog.pricing_rules'`);

    const first = await enableStagingRealData(t.db);
    expect(first.rules).toEqual({ state: "missing" });
    expect(first.turnedOn.sort()).toEqual([...STAGING_REAL_DATA_FLAGS].sort());
    for (const key of STAGING_REAL_DATA_FLAGS) expect((await flag(key))?.enabled).toBe(true);
    expect(await flag("catalog.site_pins")).toEqual({ enabled: true, skip: [23] }); // an operator's skip list stays
    expect(await flag("catalog.site_photos")).toEqual({ enabled: false }); // the rights are the company's call

    // A second run writes nothing: no flag is turned on again.
    expect(await enableStagingRealData(t.db)).toEqual({ turnedOn: [], rules: { state: "missing" } });

    // An operator turned one off: the next deploy's run turns it back on — STAGING_REAL_DATA=off is the way to keep it.
    await set("catalog.site_offers", '{"enabled":false}');
    // A rules row a search would refuse (not as the loader writes it) is reported as invalid, never as loaded.
    await set("catalog.pricing_rules", '{"fingerprint":"test"}');
    expect(await enableStagingRealData(t.db)).toEqual({
      turnedOn: ["catalog.site_offers"],
      rules: { state: "invalid" },
    });
    await t.close();
  }, 60_000);
});

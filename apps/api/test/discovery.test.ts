/** GET /v1/airports/popular and GET /v1/airports/home-suggestion — discovery (ADR-IMPL-039). */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

import { HomeSuggestionVM, PopularVM } from "@bbc/shared/api/v1/discovery";
import { ZONE_ALIASES, homeZones } from "../../../packages/modules/domain/catalog/src/application/discovery";
import { testApp } from "./helpers/test-app";

/** UTC midnight, `n` days ago, as text — demand_daily holds one row per UTC day, and raw SQL takes no Date. */
const daysAgo = (n: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n)).toISOString();
};

describe("discovery", () => {
  it("GET /v1/airports/popular: routes searched enough first, then the hubs — names only", async () => {
    const t = await testApp({ suite: "discovery-popular" });
    const get = (query: string) =>
      t.app.request(`/v1/airports/popular?${query}`, { headers: { Cookie: t.memberA.cookie } });

    // Nothing searched yet: the busiest hubs — never the origin, never its metro (EWR, LGA).
    const first = PopularVM.parse(await (await get("from=JFK")).json());
    expect(first.from.code).toBe("JFK");
    expect(first.destinations.map((a) => a.code)).toEqual(["LHR", "LAX", "CDG", "AMS"]);

    // The last seven days, all cabins together: MIA 4 + 2 = 6 (shown), ZRH 4 (under 5), EWR 9 (same metro), and BOS 7
    // eight days ago (outside the window).
    await t.db.execute(sql`
      INSERT INTO catalog.demand_daily (day, route_from, route_to, cabin, searches, searches_without_fare) VALUES
        (${daysAgo(1)}, 'JFK', 'MIA', 'business', 4, 0),
        (${daysAgo(2)}, 'JFK', 'MIA', 'first', 2, 0),
        (${daysAgo(1)}, 'JFK', 'ZRH', 'business', 4, 4),
        (${daysAgo(3)}, 'JFK', 'EWR', 'business', 9, 0),
        (${daysAgo(8)}, 'JFK', 'BOS', 'business', 7, 0)`);
    const res = await get("from=jfk");
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(PopularVM.parse(JSON.parse(raw)).destinations.map((a) => a.code)).toEqual(["MIA", "LHR", "LAX", "CDG"]);
    expect(raw).not.toContain("searches"); // a count never leaves the server

    expect((await get("from=QQQ")).status).toBe(404);
    expect((await get("from=JF")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect((await t.app.request("/v1/airports/popular?from=JFK")).status).toBe(401);

    const metrics = await (await t.app.request("/metrics")).text();
    expect(metrics).toContain('bbc_popular_destinations_shown{source="searches"} 1');
    expect(metrics).toContain('bbc_popular_destinations_shown{source="hubs"} 7');
    await t.close();
  });

  it("GET /v1/airports/home-suggestion: the busiest airport in the phone's time zone", async () => {
    const t = await testApp({ suite: "discovery-home" });
    const get = async (tz: string) => {
      const r = await t.app.request(`/v1/airports/home-suggestion?tz=${encodeURIComponent(tz)}`, {
        headers: { Cookie: t.memberA.cookie },
      });
      return { status: r.status, body: r.status === 200 ? HomeSuggestionVM.parse(await r.json()) : null };
    };
    expect((await get("America/New_York")).body?.airport?.code).toBe("JFK");
    expect((await get("Europe/Chisinau")).body?.airport?.code).toBe("RMO");
    expect((await get("Asia/Calcutta")).body?.airport?.code).toBe("DEL"); // an old name some phones still report
    expect((await get("Etc/UTC")).body).toEqual({ airport: null }); // UTC is not a place
    expect((await get("not/a_zone")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect((await t.app.request("/v1/airports/home-suggestion?tz=UTC")).status).toBe(401);

    // Every zone the airports use is reachable from what a phone reports: iOS reports the IANA name the data uses,
    // Android the ICU name — so each one is either a name ICU reports or the target of an alias. A zone newer than this
    // runtime's ICU is skipped: a phone that old could not report it either.
    const icu = new Set(Intl.supportedValuesOf("timeZone"));
    const targets = new Set(Object.values(ZONE_ALIASES));
    // Windows ICU omits some zones from supportedValuesOf that DateTimeFormat still resolves to themselves
    // (Asia/Choibalsan). A phone on this runtime can still report that name.
    const knownToIcu = (z: string) => {
      if (icu.has(z)) return true;
      try {
        return new Intl.DateTimeFormat("en-US", { timeZone: z }).resolvedOptions().timeZone === z;
      } catch {
        return false;
      }
    };
    const used = (await t.db.execute(sql`SELECT DISTINCT tz FROM catalog.airports`)) as unknown as { tz: string }[];
    expect(used.length).toBeGreaterThan(300);
    const unreachable = used.map((r) => r.tz).filter((z) => homeZones(z) !== null && !knownToIcu(z) && !targets.has(z));
    expect(unreachable).toEqual([]);
    await t.close();
  });
});

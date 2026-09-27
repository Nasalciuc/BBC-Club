import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { createPlatform } from "@bbc/platform";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { faresRepo } from "../../src/infrastructure/fares.repo";
import { catalogModule } from "../../src/module";

describe("destinations", () => {
  it("returns the cheapest fare per destination, same shape as the old in-memory dedupe", async () => {
    const iso = await isolatedDb("catalog-dest");
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    await iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity) VALUES
        ('JFK', 'John F Kennedy International', 'New York', 'United States', 'US', 'americas', 40.641300, -73.778100, 100),
        ('LHR', 'Heathrow', 'London', 'United Kingdom', 'GB', 'europe', 51.470000, -0.454300, 98),
        ('CDG', 'Charles de Gaulle', 'Paris', 'France', 'FR', 'europe', 49.009700, 2.547900, 90)
      ON CONFLICT DO NOTHING`);
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (
        route_from, route_to, cabin, carrier, carrier_name, nonstop, price, currency, source,
        valid_from, valid_until, published
      ) VALUES
        ('JFK', 'LHR', 'business', 'BA', 'British Airways', true, '4200.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true),
        ('JFK', 'LHR', 'business', 'VS', 'Virgin', true, '5100.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true),
        ('JFK', 'CDG', 'business', 'AF', 'Air France', true, '3900.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true)`);

    const pins = await faresRepo.destinations(iso.db, "jfk");
    expect(pins.map((p) => ({ code: p.code.trim(), fromPrice: p.fromPrice, lat: p.lat }))).toEqual([
      { code: "CDG", fromPrice: 3900, lat: 49.0097 },
      { code: "LHR", fromPrice: 4200, lat: 51.47 },
    ]);

    const plan = (await iso.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return tx.execute(sql`
        EXPLAIN SELECT route_to, price FROM catalog.fares
        WHERE published = true AND route_from = 'JFK'
        ORDER BY route_to, price
      `);
    })) as { "QUERY PLAN": string }[];
    const text = plan.map((r) => r["QUERY PLAN"]).join("\n");
    expect(text).toContain("fares_home_destinations");
    await iso.drop();
  });

  it("import clears the destinations cache", async () => {
    const iso = await isolatedDb("catalog-dest-cache");
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    await iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity) VALUES
        ('JFK', 'John F Kennedy International', 'New York', 'United States', 'US', 'americas', 40.641300, -73.778100, 100),
        ('LHR', 'Heathrow', 'London', 'United Kingdom', 'GB', 'europe', 51.470000, -0.454300, 98)
      ON CONFLICT DO NOTHING`);
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (
        route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from, valid_until, published
      ) VALUES
        ('JFK', 'LHR', 'business', 'BA', true, '4200.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true)`);

    const platform = createPlatform(iso.db, { level: "silent" });
    const out = await catalogModule().init({
      db: iso.db,
      platform,
      env: {} as never,
      ports: {},
    });
    const first = await out.exposes!.destinations(undefined, "JFK");
    expect(first[0]?.fromPrice).toBe(4200);

    await iso.db.execute(sql`
      INSERT INTO catalog.fares (
        route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from, valid_until, published
      ) VALUES
        ('JFK', 'LHR', 'business', 'VS', true, '1000.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true)`);
    expect((await out.exposes!.destinations(undefined, "JFK"))[0]?.fromPrice).toBe(4200);

    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("principal", { kind: "system", role: "system", source: "internal-secret" });
      c.set("requestId", "dest-cache");
      c.set("clientIp", null);
      await next();
    });
    const mounted = out.routes?.[0];
    if (!mounted) throw new Error("catalog routes missing");
    app.route(mounted.basePath, mounted.app);
    const res = await app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "airports",
        csv: "code,name,city,country,country_code,region,lat,lng,tz\nCDG,Charles de Gaulle,Paris,France,FR,europe,49.0097,2.5479,Europe/Paris\n",
      }),
    });
    expect(res.status).toBe(200);
    expect((await out.exposes!.destinations(undefined, "JFK"))[0]?.fromPrice).toBe(1000);
    await iso.drop();
  });
});

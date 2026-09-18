import { describe, it, expect } from "bun:test";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { faresRepo } from "../../src/infrastructure/fares.repo";
import { airportsRepo } from "../../src/infrastructure/airports.repo";
import { sql } from "drizzle-orm";

describe("@bbc/catalog facade", () => {
  it("search returns published fares in window; airports prefix ranks JFK", async () => {
    const iso = await isolatedDb("catalog-facade");
    await iso.db.execute(sql`
      INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity) VALUES
        ('JFK', 'John F Kennedy International', 'New York', 'United States', 'US', 'americas', 40.6413, -73.7781, 100),
        ('LHR', 'Heathrow', 'London', 'United Kingdom', 'GB', 'europe', 51.47, -0.4543, 98)
      ON CONFLICT DO NOTHING`);
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const from = new Date(Date.now() - 86_400_000).toISOString();
    await iso.db.execute(sql`
      INSERT INTO catalog.fares (
        route_from, route_to, cabin, carrier, carrier_name, nonstop, price, currency, source,
        valid_from, valid_until, published
      ) VALUES
        ('JFK', 'LHR', 'business', 'BA', 'British Airways', true, '4200.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true),
        ('JFK', 'LHR', 'business', 'VS', 'Virgin', true, '4350.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true),
        ('JFK', 'LHR', 'business', 'AA', 'American', true, '4490.00', 'USD', 'manual', ${from}::timestamptz, ${until}::timestamptz, true)`);

    const rows = await faresRepo.search(iso.db, { from: "JFK", to: "LHR", cabin: "business" });
    expect(rows.length).toBe(3);

    const airports = await airportsRepo.search(iso.db, "JF");
    expect(airports[0]?.code).toBe("JFK");
    await iso.drop();
  });
});

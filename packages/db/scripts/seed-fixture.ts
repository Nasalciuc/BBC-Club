/** Seeds the canonical fixture (Alex Morgan · Julia Reed · London/Paris/Tokyo) for dev/staging/test.
 *  Refuses to run in production. Idempotent: upserts by natural keys, never truncates outside tests. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { assertNotProduction } from "../src/helpers";
import { fixture } from "@bbc/shared/fixture";
import { profile } from "../src/schema/members";
import { offers } from "../src/schema/proposals";
import { mirror } from "../src/schema/crm";
import { airports, fares } from "../src/schema/catalog";

assertNotProduction("seed-fixture");
const db = createDb(process.env.DATABASE_URL!, { max: 1, applicationName: "bbc-seed" });

const airportsCsv = join(dirname(fileURLToPath(import.meta.url)), "../seeds/airports.csv");

function parseAirportsCsv(raw: string) {
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift();
  if (!header?.startsWith("code,")) throw new Error("airports.csv: unexpected header");
  return lines
    .filter((l) => l.trim())
    .map((line) => {
      const cols: string[] = [];
      let cur = "";
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (ch === "," && !inQ) {
          cols.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      cols.push(cur);
      const [code, name, city, country, countryCode, region, lat, lng, popularity] = cols;
      return {
        code: code!.trim(),
        name: name!.trim(),
        city: city!.trim(),
        country: country!.trim(),
        countryCode: countryCode!.trim(),
        region: region!.trim(),
        lat: lat!.trim(),
        lng: lng!.trim(),
        popularity: Number(popularity ?? 0),
      };
    });
}

try {
  await db.transaction(async (tx) => {
    await tx
      .insert(mirror)
      .values({
        crmClientId: fixture.member.crmClientId,
        emailNormalized: fixture.member.email.toLowerCase(),
        fullName: fixture.member.name,
        homeAirport: "JFK",
        advisorName: fixture.advisor.name,
        routeHistory: [{ from: "JFK", to: "LHR", cabin: "business", flownAt: "2026-03-14", count: 3 }],
        lastFlightAt: new Date("2026-03-14"),
      })
      .onConflictDoUpdate({ target: mirror.crmClientId, set: { syncedAt: sql`now()` } });

    await tx
      .insert(profile)
      .values({
        memberId: fixture.member.id,
        crmClientId: fixture.member.crmClientId,
        linkedAt: new Date(),
        displayName: fixture.member.name,
        homeAirport: "JFK",
        status: "active",
      })
      .onConflictDoNothing({ target: profile.memberId });

    for (const o of fixture.offers) {
      await tx
        .insert(offers)
        .values({
          idempotencyKey: `fixture:${o.key}`,
          source: o.targeting === "user" ? "crm_agent" : "marketing_campaign",
          targeting: o.targeting,
          targetMemberId: o.targeting === "user" ? fixture.member.id : null,
          routeFrom: o.from,
          routeTo: o.to,
          cabin: "business",
          price: String(o.price),
          publishedPrice: String(o.published),
          currency: "USD",
          title: o.title,
          contextLine: o.contextLine ?? null,
          flightFacts: o.facts,
          validUntil: new Date(o.validUntil),
          status: "active",
        })
        .onConflictDoNothing({ target: offers.idempotencyKey });
    }

    for (const a of parseAirportsCsv(readFileSync(airportsCsv, "utf8"))) {
      await tx.insert(airports).values(a).onConflictDoNothing({ target: airports.code });
    }

    const fareSeeds = [
      ...fixture.fares.map((f) => ({
        id: f.id,
        routeFrom: f.from.code,
        routeTo: f.to.code,
        cabin: f.cabin,
        carrier: f.carrier.code,
        carrierName: f.carrier.name,
        product: f.product,
        nonstop: f.nonstop,
        durationMinutes: f.durationMinutes,
        departAt: f.departAt ? new Date(f.departAt) : null,
        arriveAt: f.arriveAt ? new Date(f.arriveAt) : null,
        price: String(f.price.offer),
        publishedPrice: f.price.published != null ? String(f.price.published) : null,
        publishedSource: f.price.publishedSource ?? null,
        currency: f.price.currency,
        source: "manual" as const,
        validFrom: new Date("2026-09-01T00:00:00.000Z"),
        validUntil: new Date(f.validUntil),
        published: true,
      })),
      {
        id: "00000000-0000-4000-8000-00000000fa07",
        routeFrom: "JFK",
        routeTo: "LHR",
        cabin: "business" as const,
        carrier: "AA",
        carrierName: "American Airlines",
        product: "Flagship Business",
        nonstop: true,
        durationMinutes: 420,
        departAt: new Date("2026-10-13T21:00:00.000Z"),
        arriveAt: new Date("2026-10-14T08:20:00.000Z"),
        price: "4490",
        publishedPrice: "8100",
        publishedSource: "Sabre · 16 Sep",
        currency: "USD",
        source: "manual" as const,
        validFrom: new Date("2026-09-01T00:00:00.000Z"),
        validUntil: new Date("2026-10-04T23:59:59.000Z"),
        published: true,
      },
    ];
    for (const f of fareSeeds) {
      // Prefer skip on natural key — two fixture rows can share route/cabin/carrier/validFrom with different ids.
      await tx
        .insert(fares)
        .values(f)
        .onConflictDoNothing({
          target: [fares.routeFrom, fares.routeTo, fares.cabin, fares.carrier, fares.validFrom],
        });
    }
  });
  console.log("fixture seeded");
  process.exit(0);
} catch (e) {
  console.error("seed failed:", e);
  process.exit(1);
} finally {
  await db.close();
}

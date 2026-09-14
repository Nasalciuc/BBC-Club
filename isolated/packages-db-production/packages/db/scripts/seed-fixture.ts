/** Seeds the canonical fixture (Alex Morgan · Julia Reed · London/Paris/Tokyo) for dev/staging/test.
 *  Refuses to run in production. Idempotent: upserts by natural keys, never truncates outside tests. */
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { assertNotProduction } from "../src/helpers";
import { fixture } from "@bbc/shared/fixture";
import { profile } from "../src/schema/members";
import { offers } from "../src/schema/proposals";
import { mirror } from "../src/schema/crm";

assertNotProduction("seed-fixture");
const db = createDb(process.env.DATABASE_URL!, { max: 1, applicationName: "bbc-seed" });

try {
  await db.transaction(async (tx) => {
    // 1. CRM mirror first (members link against it)
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

    // 2. Profile for the review/fixture member (auth.user is created by Better Auth's seed-review script)
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

    // 3. Offers — one personalized, two campaigns; idempotent by idempotency_key
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
  });
  console.log("fixture seeded");
  process.exit(0);
} catch (e) {
  console.error("seed failed:", e);
  process.exit(1);
} finally {
  await db.close();
}

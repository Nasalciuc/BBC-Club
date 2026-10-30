/**
 * Staging only (ADR-IMPL-040, amendment of 30 Oct 2026): staging shows the club's real data, not the demo — the company
 * site's deals in Explore, its cities as pins, and the price a search shows from the member's home airport (the site's
 * answer, else the company's formula). `infra/deploy.sh staging` runs it at step 7, after the demo; an operator never
 * has to type the flags by hand. `STAGING_REAL_DATA=off` in staging.env makes the deploy skip it, and the flags stay as
 * an operator set them.
 *   bun run scripts/staging-real-data.ts
 * Turns on what the flags below name, keeping each flag's other settings (a `skip` list stays). Idempotent: a flag
 * already on is not written again, so a second run changes nothing — its last line says how many it turned on, which
 * the deploy reads to start the site's sync once. `catalog.site_photos` is left alone: the site's photos wait for the
 * company to confirm the rights (seed-flags.ts). It says whether the price rules are loaded — never a rule: without
 * them a search shows the site's price where the site has one, and no number elsewhere (RUNBOOK, Price rules).
 * Refuses any database that is not staging's or a local one (the demo's own guard). Production never runs it.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@bbc/db";
import { createDb } from "@bbc/db";
import { loadEnv, type ServerEnv } from "@bbc/shared/env";
import { reason } from "./seed-review-account";
import { assertStagingTarget } from "./seed-staging-demo";

/** What staging's members see from the company's site: the estimate is the master switch the other three read. */
export const STAGING_REAL_DATA_FLAGS = [
  "catalog.estimates",
  "catalog.site_prices",
  "catalog.site_pins",
  "catalog.site_offers",
] as const;

const DESCRIPTION = "Turned on by scripts/staging-real-data.ts (staging only, ADR-IMPL-040): the club's real data";

/** Turns the flags on and says how many it changed and whether the price rules are loaded. */
export async function enableStagingRealData(db: Db): Promise<{ turnedOn: string[]; rulesLoaded: boolean }> {
  return db.transaction(async (tx) => {
    const turnedOn: string[] = [];
    for (const key of STAGING_REAL_DATA_FLAGS) {
      const rows = (await tx.execute(sql`
        INSERT INTO platform.flags (key, value, description)
        VALUES (${key}, '{"enabled":true}'::jsonb, ${DESCRIPTION})
        ON CONFLICT (key) DO UPDATE SET value = platform.flags.value || '{"enabled":true}'::jsonb, updated_at = now()
        WHERE platform.flags.value->'enabled' IS DISTINCT FROM 'true'::jsonb
        RETURNING key`)) as unknown as { key: string }[];
      if (rows.length > 0) turnedOn.push(key);
    }
    const rules = (await tx.execute(
      sql`SELECT 1 AS present FROM platform.flags WHERE key = 'catalog.pricing_rules'`,
    )) as unknown as unknown[];
    return { turnedOn, rulesLoaded: rules.length > 0 };
  });
}

if (import.meta.main) {
  let env: ServerEnv;
  try {
    env = loadEnv();
    assertStagingTarget(env);
  } catch (e) {
    console.error("staging real data:", reason(e));
    process.exit(1);
  }
  const db = createDb(env.DATABASE_URL, { max: 1, applicationName: "bbc-staging-real-data" });
  try {
    const n = await enableStagingRealData(db);
    console.log(
      `staging real data: on — ${STAGING_REAL_DATA_FLAGS.join(", ")}` +
        (n.turnedOn.length > 0 ? ` (turned on now: ${n.turnedOn.join(", ")})` : " (already on)"),
    );
    console.log(
      n.rulesLoaded
        ? "price rules: loaded"
        : "price rules: not loaded — a search shows the site's price where it has one; load them (RUNBOOK, Price rules)",
    );
    console.log(`changed: ${n.turnedOn.length}`);
  } catch (e) {
    console.error("staging real data failed:", reason(e));
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

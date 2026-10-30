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
 * company to confirm the rights (seed-flags.ts). It says whether a search can use the price rules, as the catalogue
 * checks them — never a rule: without them a search shows the site's price where it has one, and no number elsewhere.
 * Refuses any database that is not staging's or a local one (the demo's own guard). Production never runs it.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@bbc/db";
import { createDb } from "@bbc/db";
import { loadEnv, type ServerEnv } from "@bbc/shared/env";
import { readStoredRules } from "../packages/modules/domain/catalog/src/pricing/rules";
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

/** The price rules as a search reads them (the catalogue's own check): loaded — shape and fingerprint hold — missing
 *  (no row) or invalid (a row a search refuses, as one edited by hand). */
export type RulesState = { state: "loaded"; fingerprint: string } | { state: "missing" | "invalid" };

export function rulesState(value: unknown): RulesState {
  const read = readStoredRules(value);
  return read.ok ? { state: "loaded", fingerprint: read.fingerprint } : { state: read.reason };
}

/** What the deploy's log says of the rules: never a rule, only whether a search can use them. */
export function rulesLine(rules: RulesState): string {
  if (rules.state === "loaded") return `price rules: loaded (fingerprint ${rules.fingerprint})`;
  const without = "a search shows the site's price where it has one, and no number elsewhere";
  return rules.state === "missing"
    ? `price rules: not loaded — ${without}; load them (RUNBOOK, Price rules)`
    : `price rules: invalid (not as load-pricing-rules.ts wrote them) — ${without}; load them again (RUNBOOK, Price rules)`;
}

/** Turns the flags on and says which it changed and whether a search can use the price rules. */
export async function enableStagingRealData(db: Db): Promise<{ turnedOn: string[]; rules: RulesState }> {
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
    const row = (
      (await tx.execute(sql`SELECT value FROM platform.flags WHERE key = 'catalog.pricing_rules'`)) as unknown as {
        value: unknown;
      }[]
    )[0];
    return { turnedOn, rules: rulesState(row?.value) };
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
    console.log(rulesLine(n.rules));
    console.log(`changed: ${n.turnedOn.length}`);
  } catch (e) {
    console.error("staging real data failed:", reason(e));
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

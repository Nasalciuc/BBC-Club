/**
 * Loads the company's price rules into this environment's flag row `catalog.pricing_rules` (ADR-IMPL-037). The rules
 * are not in the repository: the owner keeps the file and runs, on the server, from the API image
 *   docker exec -i <api container> bun run scripts/load-pricing-rules.ts < pricing-rules.json
 * It checks the shape, prints the fingerprint and the poster check (JFK → ZRH, business, round trip), then writes.
 * Searches use the new rules within ~35 s. `--dry-run` checks and prints only — no database needed.
 * `--check-site` also compares the rules with the company's site (ADR-IMPL-062): 24 routes of every continent pair, both
 * trips, asked one at a time from its own search, business and first. It prints per cabin how many matched, differed or
 * got no answer, and the routes that differ — never a price — writes nothing, and exits 1 when any differ or when the
 * site gave no business figure for a route (a check it half answered is not a pass; first may go unanswered).
 * It never prints a rule: only the fingerprint and the poster's public figure.
 */
import { createDb } from "@bbc/db";
import { sql } from "drizzle-orm";

import { estimateFare } from "../packages/modules/domain/catalog/src/pricing/estimate";
import {
  PricingRulesSchema,
  rulesProblems,
  storedPricingRules,
} from "../packages/modules/domain/catalog/src/pricing/rules";
import {
  checkRulesAgainstSite,
  siteCheckLines,
  siteCheckVerdict,
} from "../packages/modules/domain/catalog/src/pricing/site-check";

const KEY = "catalog.pricing_rules";
const DESCRIPTION =
  "ADR-IMPL-037: the company's price rules for estimates. Written by scripts/load-pricing-rules.ts only — a hand edit no longer matches its fingerprint and turns estimates off";

const dryRun = process.argv.includes("--dry-run");
const checkSite = process.argv.includes("--check-site");
const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const text = (file ? await Bun.file(file).text() : process.stdin.isTTY ? "" : await Bun.stdin.text()).trim();
if (!text) {
  console.error("usage: bun run scripts/load-pricing-rules.ts [--dry-run | --check-site] < pricing-rules.json");
  process.exit(2);
}

let input: unknown;
try {
  input = JSON.parse(text);
} catch {
  console.error("refused: not valid JSON"); // JSON.parse's own message can quote the file
  process.exit(1);
}
const problems = rulesProblems(input);
if (problems.length > 0) {
  console.error(`refused: the rules do not have the expected shape\n  ${problems.slice(0, 20).join("\n  ")}`);
  process.exit(1);
}

const stored = storedPricingRules(PricingRulesSchema.parse(input));
const poster = estimateFare(
  stored.rules,
  { code: "JFK", countryCode: "US" },
  { code: "ZRH", countryCode: "CH" },
  "business",
);
console.log(`rules valid · fingerprint ${stored.fingerprint}`);
console.log(
  `poster check — JFK → ZRH, business, round trip: ${poster ? `$${poster.amount.toLocaleString("en-US")}` : "no estimate"}`,
);
if (checkSite) {
  const result = await checkRulesAgainstSite(stored.rules, {
    fetch,
    userAgent: "BBCClub/1.0 (pricing rules check)",
  });
  for (const line of siteCheckLines(result)) console.log(line);
  const verdict = siteCheckVerdict(result);
  for (const problem of verdict.problems) console.error(`site check: ${problem}`);
  console.log("site check: nothing written");
  process.exit(verdict.pass ? 0 : 1);
}
if (dryRun) {
  console.log("dry run: nothing written");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const db = createDb(url, {
  max: 1,
  applicationName: "bbc-load-pricing-rules",
  pooler: process.env.DB_POOLER === "transaction" ? "transaction" : "none",
});

try {
  const before: { fingerprint: string | null }[] = await db.execute(
    sql`SELECT value->>'fingerprint' AS fingerprint FROM platform.flags WHERE key = ${KEY}`,
  );
  await db.execute(sql`INSERT INTO platform.flags (key, value, description)
                       VALUES (${KEY}, ${JSON.stringify(stored)}::jsonb, ${DESCRIPTION})
                       ON CONFLICT (key) DO UPDATE
                       SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now()`);
  console.log(
    `written: ${KEY} ${before[0]?.fingerprint ?? "(none)"} → ${stored.fingerprint}; searches use it within ~35 s`,
  );
} catch (e) {
  // Postgres's own message only: drizzle's error message quotes the query's parameters, and they hold the rules.
  console.error(`load failed: ${e instanceof Error && e.cause instanceof Error ? e.cause.message : "database error"}`);
  process.exitCode = 1;
} finally {
  await db.close();
}

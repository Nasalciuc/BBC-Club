/** Flags whose default must be a written decision, not the absence of a row. Idempotent; run after db:migrate.
 * Cannot run until the monorepo assembly provides `@bbc/db`. The Expo root package.json is not that workspace. */
import { createDb } from "@bbc/db";
import { sql } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL missing"); process.exit(1); }
const db = createDb(url, { max: 1, applicationName: "bbc-seed-flags" });

const FLAGS: [string, Record<string, unknown>, string][] = [
  ["members.allow_non_crm_signups", { enabled: false }, "ADR-PROD-001: an unknown CRM email is waitlist, never active"],
  ["app.min_supported_version", { variant: "0.1.0" }, "forced-update threshold served by /v1/app-config"],
];

try {
  for (const [key, value, description] of FLAGS) {
    await db.execute(sql`INSERT INTO platform.flags (key, value, description)
                         VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${description})
                         ON CONFLICT (key) DO NOTHING`);
    console.log(`flag ensured: ${key}`);
  }
} catch (e) {
  console.error("seed-flags failed:", e);
  process.exitCode = 1;        // not exit() — finally must run
} finally {
  await db.close();            // now this actually happens
}

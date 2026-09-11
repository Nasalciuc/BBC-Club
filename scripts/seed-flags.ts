/** Seeds the flags whose DEFAULT must be a decision, not the absence of a row. Idempotent; run after migrate.
 * Follow-up at monorepo assembly: add `"db:seed:flags": "bun run scripts/seed-flags.ts"` to the API workspace package.json
 * (the Expo app package.json at the repo root today is not that workspace). */
import { createDb } from "@bbc/db";
import { sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!, { max: 1, applicationName: "bbc-seed-flags" });
const FLAGS: [string, Record<string, unknown>, string][] = [
  ["members.allow_non_crm_signups", { enabled: false }, "ADR-PROD-001: unknown CRM email → waitlist, never active"],
  ["app.min_supported_version", { variant: "0.1.0" }, "forced-update threshold read by /v1/app-config"],
];
for (const [key, value, description] of FLAGS) {
  await db.execute(sql`INSERT INTO platform.flags (key, value, description) VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${description})
                       ON CONFLICT (key) DO NOTHING`);
  console.log(`flag ${key} ensured`);
}
await db.close();

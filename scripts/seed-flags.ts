/** Flags whose default must be a written decision, not the absence of a row. Idempotent; run after db:migrate.
 * Cannot run until the monorepo assembly provides `@bbc/db`. The Expo root package.json is not that workspace. */
import { createDb } from "@bbc/db";
import { sql } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const db = createDb(url, { max: 1, applicationName: "bbc-seed-flags" });

const FLAGS: [string, Record<string, unknown>, string][] = [
  ["members.allow_non_crm_signups", { enabled: false }, "ADR-PROD-001: an unknown CRM email is waitlist, never active"],
  ["app.min_supported_version", { variant: "0.1.0" }, "forced-update threshold served by /v1/app-config"],
  [
    "app.store_url_ios",
    { variant: "" },
    "forced update: the App Store listing (https:// or itms-apps://) served by /v1/app-config as storeUrl.ios; empty until the listing exists",
  ],
  [
    "app.store_url_android",
    { variant: "" },
    "forced update: the Play listing (https:// or market://) served by /v1/app-config as storeUrl.android; empty until the listing exists",
  ],
  ["catalog.search_events", { enabled: false }, "ADR-032: search events stay off until an operator turns them on"],
  ["jobs.push.transport", { variant: "pg" }, "ADR-031: push dispatch stays in Postgres until variant=streams"],
  [
    "catalog.estimates",
    { enabled: false },
    "ADR-IMPL-037: formula estimates stay off until an operator turns them on (production: after the company's written approval)",
  ],
  [
    "catalog.place_photos",
    { enabled: true },
    "ADR-IMPL-043: city photos from Commons and Pexels, satellite views; off = the app's own image everywhere, no lookups",
  ],
  [
    "catalog.site_photos",
    { enabled: false },
    "ADR-IMPL-045: the site's city photos on their airports, synced nightly; on once the company confirms the rights; skip: [site ids]",
  ],
  [
    "catalog.landmarks",
    // Q177174: the Icelandic Phallological Museum, Reykjavík's most written-about sight (ADR-IMPL-064).
    { enabled: false, skip: ["Q177174"] },
    "ADR-IMPL-064: three landmarks per city from Wikidata and Commons, looked up by resolve-place-landmarks; off = none served, nothing asked; skip: [Wikidata items kept out]",
  ],
  [
    "catalog.site_pins",
    { enabled: false },
    "ADR-IMPL-045: up to 12 of the site's cities as pins from the member's home, priced by the formula; needs catalog.estimates",
  ],
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
  process.exitCode = 1; // not exit() — finally must run
} finally {
  await db.close(); // now this actually happens
}

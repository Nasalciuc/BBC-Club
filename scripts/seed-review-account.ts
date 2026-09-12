/** Creates the App Review demo account: a real, verified member with a known password.
 *  Run once per environment: `bun run scripts/seed-review-account.ts`. Idempotent. */
import { loadEnv } from "@bbc/shared/env";
import { createDb } from "@bbc/db";
import { createEvents } from "@bbc/platform/events";
import { createAuth } from "@bbc/identity";
import { consoleSender } from "@bbc/email";

const env = loadEnv();
if (!env.REVIEW_ACCOUNT_EMAIL || !env.REVIEW_ACCOUNT_PASSWORD) throw new Error("REVIEW_ACCOUNT_EMAIL/PASSWORD not set");

const db = createDb(env.DATABASE_URL);
const auth = createAuth({ env, db, email: consoleSender(), events: createEvents(db), logger: console as any });

const existing = await db.execute(`SELECT id FROM auth."user" WHERE email = $1`, [env.REVIEW_ACCOUNT_EMAIL]);
if (existing.length) { console.log("review account exists"); process.exit(0); }

await auth.api.signUpEmail({ body: { email: env.REVIEW_ACCOUNT_EMAIL, password: env.REVIEW_ACCOUNT_PASSWORD, name: "App Review" } });
await db.execute(`UPDATE auth."user" SET "emailVerified" = true WHERE email = $1`, [env.REVIEW_ACCOUNT_EMAIL]);
console.log("review account created & verified — seed fixture proposals for it via the fixture script");

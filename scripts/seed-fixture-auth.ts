/** Creates the canonical fixture member (Alex Morgan) as a verified Better Auth user.
 *  Idempotent. Points members.profile + proposals.offers at the real auth.user id
 *  (auth PK remaps break FKs; fixture seed uses a fixed id that we retarget here).
 *  Run: bun run scripts/seed-fixture-auth.ts (DATABASE_URL + APP_ORIGIN + secrets set). */
import { sql } from "drizzle-orm";
import { loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { fixture } from "@bbc/shared/fixture";
import { createDb } from "@bbc/db";
import { createPlatform } from "@bbc/platform";
import { createAuth } from "@bbc/identity";
import { consoleSender } from "@bbc/email";

const env = loadEnv();
const email = fixture.member.email.toLowerCase();
const password = fixture.password;
const fixtureId = fixture.member.id;

const db = createDb(env.DATABASE_URL, { max: 1, applicationName: "bbc-seed-fixture-auth" });
const platform = createPlatform(db, { level: "warn" });
for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def);
const auth = createAuth({
  env,
  db,
  email: consoleSender(),
  events: {
    publish: async (e) => {
      await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "identity" }));
    },
  },
  logger: platform.logger,
  breachedPassword: () => false,
});

try {
  let rows: { id: string }[] = await db.execute(sql`SELECT id FROM auth."user" WHERE email = ${email}`);
  if (!rows.length) {
    await auth.api.signUpEmail({
      body: { email, password, name: fixture.member.name },
    });
    rows = await db.execute(sql`SELECT id FROM auth."user" WHERE email = ${email}`);
  }
  const userId = rows[0]?.id;
  if (!userId) throw new Error("auth.user missing after sign-up");

  await db.execute(
    sql`UPDATE auth."user" SET email_verified = true, name = ${fixture.member.name} WHERE email = ${email}`,
  );

  // Retarget fixture rows (seeded with fixture.member.id) onto the real auth id.
  await db.execute(sql`
    UPDATE members.profile SET member_id = ${userId}
    WHERE member_id = ${fixtureId} AND NOT EXISTS (
      SELECT 1 FROM members.profile WHERE member_id = ${userId}
    )
  `);
  await db.execute(sql`
    UPDATE proposals.offers SET target_member_id = ${userId}
    WHERE target_member_id = ${fixtureId}
  `);
  // Drop orphan fixture-id profile if auth profile already exists from member.registered.
  await db.execute(sql`DELETE FROM members.profile WHERE member_id = ${fixtureId}`);

  console.log(`fixture auth ready: ${email} id=${userId} (verified)`);
  process.exit(0);
} catch (e) {
  console.error("seed-fixture-auth failed:", e);
  process.exit(1);
} finally {
  await db.close();
}

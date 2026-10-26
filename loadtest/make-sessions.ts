import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { createPlatform } from "@bbc/platform";
import { createAuth } from "@bbc/identity";
import { consoleSender } from "@bbc/email";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Server-side sign-in for k6. Never HTTP sign-in from one IP (auth limits). Writes loadtest/sessions.json. */
const env = loadEnv();
const count = Number(process.env.SESSION_COUNT ?? "200");
const db = createDb(env.DATABASE_URL, {
  max: 2,
  applicationName: "bbc-make-sessions",
  pooler: env.DB_POOLER,
});
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

const sessions: { cookie: string; ip: string; requestBody: object }[] = [];
try {
  for (let i = 0; i < count; i++) {
    const email = `vol${i}@load.test`;
    const res = await auth.api.signInEmail({ body: { email, password: "atlantic2026!" }, asResponse: true });
    if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error(`no cookie for ${email}`);
    const cookie = setCookie
      .split(",")
      .map((c) => (c.split(";")[0] ?? "").trim())
      .join("; ");
    const ip = `10.66.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    sessions.push({
      cookie,
      ip,
      requestBody: {
        tripType: "round",
        cabin: "business",
        legs: [
          { from: "JFK", to: "LHR", date: "2026-10-12" },
          { from: "LHR", to: "JFK", date: "2026-10-19" },
        ],
        passengers: { adult: 1, child: 0, infant: 0 },
        contact: { name: "Load Test", phone: "+12125550148", email },
        priceAtRequest: 4200,
      },
    });
  }
  const out = fileURLToPath(new URL("./sessions.json", import.meta.url));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(sessions), { mode: 0o600 });
  chmodSync(out, 0o600);
  console.log(`wrote ${sessions.length} sessions to ${out}`);
} finally {
  await db.close();
}

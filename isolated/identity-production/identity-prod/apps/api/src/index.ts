import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { loadEnv } from "@bbc/shared/env";
import { createDb } from "@bbc/db";
import { createEvents } from "@bbc/platform/events";
import { createLogger } from "@bbc/platform/logger";
import { createAuth, createIdentityFacade, type AuthVars } from "@bbc/identity";
import { postmarkSender, consoleSender } from "@bbc/email";

const env = loadEnv();                                   // throws with a readable list if anything is missing
const logger = createLogger({ level: env.NODE_ENV === "production" ? "info" : "debug" });
const db = createDb(env.DATABASE_URL);
const events = createEvents(db);
const email = env.POSTMARK_SERVER_TOKEN
  ? postmarkSender({ token: env.POSTMARK_SERVER_TOKEN, from: env.POSTMARK_FROM })
  : consoleSender((m) => logger.info({}, m));

const auth = createAuth({ env, db, email, events, logger });
const identity = createIdentityFacade(auth);

const app = new Hono<AuthVars>();

app.use("*", requestId());
app.use("*", secureHeaders());
app.use("/api/auth/*", cors({
  origin: [env.APP_ORIGIN, `${env.MOBILE_SCHEME}://`],
  allowHeaders: ["Content-Type", "Authorization", "Cookie"],
  allowMethods: ["POST", "GET", "OPTIONS"],
  credentials: true,
}));

// Better Auth owns everything under /api/auth — we write no auth routes of our own.
app.on(["POST", "GET"], "/api/auth/*", (c) => identity.handler(c.req.raw));

// Public
app.get("/health", (c) => c.json({ ok: true }));
app.get("/ready", async (c) => {
  try {
    await db.execute("SELECT 1 FROM auth.\"user\" LIMIT 1");
    await identity.getSession(new Headers());              // exercises the session path against the DB
    return c.json({ ok: true });
  } catch (e) {
    logger.error({ err: String(e) }, "not ready");
    return c.json({ ok: false }, 503);
  }
});
app.get("/v1/app-config", (c) => c.json({ minSupportedVersion: "0.1.0", killSwitches: {}, maintenance: null }));

// Everything member-facing is behind requireMember. The inventory test enforces it.
const v1 = new Hono<AuthVars>();
v1.use("*", identity.requireMember);
v1.get("/me", (c) => c.json({ member: c.get("member") }));
v1.delete("/account", async (c) => {
  await identity.deleteAccount(c.req.raw.headers);
  return c.json({ ok: true });
});
app.route("/v1", v1);

app.onError((err, c) => {
  logger.error({ err: err.message, requestId: c.get("requestId" as never) }, "unhandled");
  return c.json({ error: { code: "INTERNAL", message: "Something didn't go as planned." } }, 500);
});

export type AppType = typeof app;   // hc<AppType>() in the mobile client
export default { port: 8000, fetch: app.fetch };

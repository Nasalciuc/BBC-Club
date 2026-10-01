import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authOrigins, loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { apiError } from "@bbc/shared/errors";
import { createDb } from "@bbc/db";
import { createPlatform, registerPlatformJobs, collectDbReport } from "@bbc/platform";
import { lastDevOtp } from "@bbc/email";
import type { IdentityFacade } from "@bbc/identity";
import { installBaseMiddleware } from "./middleware/base";
import { errorContract } from "./middleware/error-contract";
import { resolvePrincipal, type PrincipalVars } from "./middleware/principal";
import { clientIp } from "./middleware/client-ip";
import { authorize, registerRoute } from "./middleware/authorize";
import { rateLimit } from "./middleware/rate-limit";
import { ModuleRegistry } from "./registry";
import { appConfig } from "./presentation/mobile/app-config";
import { modules } from "./modules"; // the ordered list of ModuleDescriptors (identity, members, proposals, …)

export type BuildOptions = {
  env?: ReturnType<typeof loadEnv>;
  db?: ReturnType<typeof createDb>;
  /** Tests inject a capturing email sender and extra flags here. */
  overrides?: Record<string, unknown>;
  startPoller?: boolean;
  role?: "all" | "api" | "worker";
};

/** Builds the whole process. Tests call this with startPoller:false and drive the poller by hand. */
export async function buildApp(opts: BuildOptions = {}) {
  const env = opts.env ?? loadEnv();
  const role = opts.role ?? env.APP_ROLE;
  const serveMembers = role !== "worker";
  const runsBackground = role !== "api";
  const db =
    opts.db ??
    createDb(env.DATABASE_URL, {
      applicationName: role === "worker" ? "bbc-worker" : "bbc-api",
      pooler: env.DB_POOLER,
    });
  const platform = createPlatform(db, {
    level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
    pretty: env.NODE_ENV === "development",
    redisUrl: env.REDIS_URL,
  });
  await platform.connect();
  platform.metrics.gauge("push_live", () => (env.PUSH_ADAPTER === "live" ? 1 : 0));
  if (env.NODE_ENV === "production" && env.PUSH_ADAPTER !== "live") {
    platform.logger.warn(
      { pushAdapter: env.PUSH_ADAPTER },
      "production is running with recording push; nothing is delivered until PUSH_ADAPTER=live",
    );
  }

  // 1. events: the catalogue is the only source of types
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def);
  registerPlatformJobs(platform.jobs, platform.metrics);

  const app = new Hono<PrincipalVars>();
  installBaseMiddleware(app, { origins: authOrigins(env), metrics: platform.metrics });
  app.onError(errorContract(platform.logger, platform.metrics));

  // 2. modules, in layer order, with typed ports; identity's facade is needed by the principal middleware
  const registry = new ModuleRegistry();
  for (const m of modules(opts.overrides ?? {})) registry.add(m);
  const mounted: { basePath: string; app: Hono<any> }[] = [];
  await registry.boot({ db, platform, env, mount: (basePath, sub) => mounted.push({ basePath, app: sub }) });
  const identity = registry.facade<IdentityFacade>("identity");

  let draining = false;
  const setDraining = (v: boolean) => {
    draining = v;
  };

  const loadtestTrusted =
    env.LOADTEST === "1"
      ? env.LOADTEST_TRUSTED_PROXIES.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  // 3. client IP (behind Cloudflare → Caddy) then principal — IP before any authz log
  app.use("*", clientIp(loadtestTrusted));
  app.use(
    "*",
    resolvePrincipal({
      identity,
      appOrigin: env.APP_ORIGIN,
      internalSecrets: [env.INTERNAL_API_SECRET, env.INTERNAL_API_SECRET_NEXT].filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      ),
      logger: platform.logger,
    }),
  );

  async function readyProbe(): Promise<boolean> {
    try {
      await Promise.race([
        db.execute(sql`SELECT ${1}::int AS n`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("ready probe timeout")), 2_000)),
      ]);
      await Promise.race([
        db.execute(sql`SELECT ${1}::int AS n`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("ready probe timeout")), 2_000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // 4. public — every role answers these (Caddy drain, cron, metrics)
  registerRoute("GET", "/health", "public");
  app.get("/health", (c) => c.json({ ok: true }));
  registerRoute("GET", "/ready", "public");
  app.get("/ready", async (c) => {
    if (draining) return c.json({ ok: false, draining: true }, 503);
    const checks: Record<string, unknown> = {};
    checks.db = await readyProbe();
    const h = await platform.health().catch(() => ({ ok: false, queue: null }));
    checks.queue = h.queue;
    const runs = await platform.jobs.lastRuns().catch(() => ({}));
    const stale = Object.entries(runs)
      .filter(([, r]) => r.at && Date.now() - new Date(r.at).getTime() > 36 * 3600_000)
      .map(([j]) => j);
    checks.staleJobs = stale;
    const ok = checks.db === true && h.ok && stale.length === 0;
    return c.json({ ok, ...checks }, ok ? 200 : 503);
  });
  registerRoute("GET", "/metrics", "public");
  app.get("/metrics", async (c) =>
    c.text(await platform.metrics.render(), 200, { "Content-Type": "text/plain; version=0.0.4" }),
  );

  registerRoute("GET", "/v1/internal/db-report", "ops:read");
  app.get("/v1/internal/db-report", authorize("ops:read"), async (c) => c.json(await collectDbReport(db)));

  if (serveMembers) {
    // Inventory tests read routeRegistry — do not maintain a parallel allow-list in authz/guard.
    registerRoute("GET", "/v1/app-config", "public", "anon");
    app.get("/v1/app-config", rateLimit(platform.rateLimit, "anon"), async (c) => c.json(await appConfig(platform)));
  }

  // Test/dev only: Maestro reads the last OTP without logging it. Never mounted in production.
  if (serveMembers && env.NODE_ENV !== "production") {
    registerRoute("GET", "/v1/test/last-otp", "public");
    app.get("/v1/test/last-otp", (c) => {
      const email = c.req.query("email")?.trim();
      if (!email) return c.json(apiError("VALIDATION", { message: "email is required" }), 400);
      const otp = lastDevOtp(email);
      if (!otp) return c.json(apiError("NOT_FOUND"), 404);
      return c.json({ otp });
    });
  }

  if (serveMembers) {
    app.on(["POST", "GET"], "/api/auth/*", (c) => identity.handler(c.req.raw));
    for (const m of mounted) app.route(m.basePath, m.app);
  }

  if (runsBackground) {
    registerRoute("POST", "/v1/internal/run/:job", "jobs:run");
    app.post("/v1/internal/run/:job", authorize("jobs:run"), async (c) => {
      const name = c.req.param("job");
      if (!platform.jobs.has(name))
        return c.json({ error: { code: "NOT_FOUND", message: `unknown job ${name}` } }, 404);
      return c.json(await platform.jobs.run(name));
    });
  }

  if (runsBackground && (opts.startPoller ?? true)) platform.poller.start();

  const shutdown = async () => {
    platform.logger.info({}, "shutting down");
    await platform.close();
    await platform.poller.stop(); // finishes the in-flight delivery, then stops
    await db.close();
  };

  return { app, db, platform, registry, shutdown, env, role, setDraining };
}

/** Process entry: builds, serves, dies cleanly on SIGTERM (compose drain then stop). */
if (import.meta.main) {
  const { app, shutdown, env, platform, setDraining } = await buildApp();
  const server = Bun.serve({ port: env.PORT, fetch: app.fetch, idleTimeout: 30 });
  platform.logger.info({ port: server.port, env: env.NODE_ENV, role: env.APP_ROLE }, "api up");
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, async () => {
      setDraining(true);
      await Bun.sleep(5_000);
      server.stop(false);
      await shutdown();
      process.exit(0);
    });
  }
}

/** Only public + /v1 (never /v1/internal) reach the mobile client's autocomplete. */
export type AppType = ReturnType<typeof buildApp> extends Promise<{ app: infer A }> ? A : never;

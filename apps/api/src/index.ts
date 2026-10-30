import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authOrigins, loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { apiError } from "@bbc/shared/errors";
import { createDb, errorForLog } from "@bbc/db";
import {
  createPlatform,
  registerPlatformJobs,
  collectDbReport,
  kafkaRelayHandler,
  RELAY_CONSUMER,
} from "@bbc/platform";
import { lastDevOtp } from "@bbc/email";
import type { IdentityFacade } from "@bbc/identity";
import { installBaseMiddleware } from "./middleware/base";
import { errorContract } from "./middleware/error-contract";
import { resolvePrincipal, type PrincipalVars } from "./middleware/principal";
import { clientIp } from "./middleware/client-ip";
import { authorize, registerRoute } from "./middleware/authorize";
import { rateLimit } from "./middleware/rate-limit";
import { DatabaseUnreachable, ModuleRegistry } from "./registry";
import { appConfig } from "./presentation/mobile/app-config";
import { failingJobs, staleJobs } from "./cron/stale";
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
      prepare: env.DB_PREPARE === "on",
    });
  const platform = createPlatform(db, {
    level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
    pretty: env.NODE_ENV === "development",
    redisUrl: env.REDIS_URL,
    kafkaBrokers: env.KAFKA_BROKERS,
    queueGauges: runsBackground,
  });
  // A reconnecting client must not hold route registration. connect() already catches a rejection.
  void platform.connect();
  platform.metrics.gauge("push_live", () => (env.PUSH_ADAPTER === "live" ? 1 : 0));
  // 0: the mock CRM — requests read "sent" and reach no agent. Production alerts on it (alerts.yml, bbc-adapters-not-live).
  platform.metrics.gauge("crm_live", () => (env.CRM_ADAPTER === "mock" ? 0 : 1));
  if (env.NODE_ENV === "production" && env.PUSH_ADAPTER !== "live") {
    platform.logger.warn(
      { pushAdapter: env.PUSH_ADAPTER },
      "production is running with recording push; nothing is delivered until PUSH_ADAPTER=live",
    );
  }
  if (env.NODE_ENV === "production" && env.CRM_ADAPTER === "mock") {
    platform.logger.warn(
      { crmAdapter: env.CRM_ADAPTER },
      "production is running with the mock CRM; quote requests reach no agent until CRM_ADAPTER=email or http",
    );
  }
  // loadEnv lets APNs be all or nothing, so one key tells which: without it, push is live on Android only.
  if (env.PUSH_ADAPTER === "live" && !env.APNS_P8_BASE64) {
    platform.logger.warn(
      { pushAdapter: env.PUSH_ADAPTER, apns: false },
      "push is live on Android only; an iPhone notification is marked failed until the APNs keys are in env",
    );
  }

  // 1. events: the catalogue is the only source of types
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def);
  if (platform.producer) {
    const relay = kafkaRelayHandler(platform.producer);
    for (const type of Object.keys(EVENT_CATALOGUE)) platform.events.registerConsumer(type, RELAY_CONSUMER, relay);
  }
  registerPlatformJobs(platform.jobs, platform.metrics);

  const app = new Hono<PrincipalVars>();
  installBaseMiddleware(app, { origins: authOrigins(env), metrics: platform.metrics });
  app.onError(errorContract(platform.logger, platform.metrics));

  // 2. modules, in layer order, with typed ports; identity's facade is needed by the principal middleware
  const registry = new ModuleRegistry();
  const descriptors = modules(opts.overrides ?? {});
  for (const m of descriptors) registry.add(m);
  /** Every module's kill flag goes into app-config: one list, the modules this process runs (ADR-IMPL-075). */
  const moduleNames = descriptors.map((m) => m.name);
  const mounted: { basePath: string; app: Hono<any> }[] = [];
  try {
    await registry.boot({ db, platform, env, mount: (basePath, sub) => mounted.push({ basePath, app: sub }) });
  } catch (e) {
    // The process entry exits non-zero on it; the container's restart policy starts the api again.
    if (e instanceof DatabaseUnreachable)
      platform.logger.fatal({ err: errorForLog(e) }, "boot: database unreachable, exiting");
    throw e;
  }
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

  // 4. public — every role answers these (Caddy drain, cron, metrics, monitoring)
  registerRoute("GET", "/health", "public");
  app.get("/health", (c) => c.json({ ok: true }));
  // Can THIS process take traffic: not draining, and its database answers. deploy.sh and bootstrap.sh wait on it replica
  // by replica, so the system's state (a dead letter, a stale job) must not be in it: it would hold back every deploy,
  // the one that fixes it included.
  registerRoute("GET", "/ready", "public");
  app.get("/ready", async (c) => {
    if (draining) return c.json({ ok: false, draining: true }, 503);
    const dbOk = await readyProbe();
    return c.json({ ok: dbOk, db: dbOk }, dbOk ? 200 : 503);
  });
  // Is the system well: the database, the queue (nothing pending over 5 minutes, no dead letter) and every scheduled job
  // on time and not failing (its last finished run succeeded). 503 when not — for Uptime Kuma and for people, never as
  // a deploy gate.
  registerRoute("GET", "/status", "public");
  app.get("/status", async (c) => {
    const checks: Record<string, unknown> = {};
    checks.db = await readyProbe();
    const h = await platform.health().catch(() => ({ ok: false, queue: null }));
    checks.queue = h.queue;
    const runs = await platform.jobs.lastRuns().catch(() => null);
    // Each scheduled job against its own schedule; manual and removed jobs never count (src/cron/stale.ts).
    // A read that failed is not an empty answer: without its runs, nothing here can say the jobs are well.
    const schedule = platform.jobs.schedule();
    const stale = runs === null ? [] : staleJobs(runs, schedule);
    checks.staleJobs = runs === null ? "unavailable" : stale;
    const finished = await platform.jobs.lastFinishedRuns().catch(() => null);
    const failing = finished === null ? [] : failingJobs(finished, schedule);
    checks.failingJobs = finished === null ? "unavailable" : failing;
    const ok =
      checks.db === true && h.ok && runs !== null && stale.length === 0 && finished !== null && failing.length === 0;
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
    app.get("/v1/app-config", rateLimit(platform.rateLimit, "anon"), async (c) =>
      c.json(await appConfig(platform, moduleNames)),
    );
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
      // A failed run answers 500 (audit, 30 Oct 2026): the cron's job.sh printed "ok" for every 200, a failed run
      // included. The body is the same; job_runs and bbc_job_failed record it as before.
      const result = await platform.jobs.run(name);
      return c.json(result, result.status === "failed" ? 500 : 200);
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
  // A database still unreachable after boot's retries: buildApp logged it; exit non-zero so the restart policy starts
  // the process again, rather than serve with every module unmounted. Anything else surfaces as before.
  const { app, shutdown, env, platform, setDraining } = await buildApp().catch((e: unknown) => {
    if (e instanceof DatabaseUnreachable) process.exit(1);
    throw e;
  });
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

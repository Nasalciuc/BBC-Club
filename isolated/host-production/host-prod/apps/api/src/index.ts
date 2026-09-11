import { Hono } from "hono";
import { loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { createDb } from "@bbc/db";
import { createPlatform, registerPlatformJobs } from "@bbc/platform";
import { installBaseMiddleware } from "./middleware/base";
import { errorContract } from "./middleware/error-contract";
import { resolvePrincipal, type PrincipalVars } from "./middleware/principal";
import { authorize, registerRoute } from "./middleware/authorize";
import { ModuleRegistry } from "./registry";
import { appConfig } from "./presentation/mobile/app-config";
import { modules } from "./modules";          // the ordered list of ModuleDescriptors (identity, members, proposals, …)

export type BuildOptions = {
  env?: ReturnType<typeof loadEnv>;
  db?: ReturnType<typeof createDb>;
  /** Tests inject a capturing email sender and extra flags here. */
  overrides?: Record<string, unknown>;
  startPoller?: boolean;
};

/** Builds the whole process. Tests call this with startPoller:false and drive the poller by hand. */
export async function buildApp(opts: BuildOptions = {}) {
  const env = opts.env ?? loadEnv();
  const db = opts.db ?? createDb(env.DATABASE_URL, { applicationName: "bbc-api" });
  const platform = createPlatform(db, { level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug", pretty: env.NODE_ENV === "development" });

  // 1. events: the catalogue is the only source of types
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def as any);
  registerPlatformJobs(platform.jobs);

  const app = new Hono<PrincipalVars>();
  installBaseMiddleware(app, { appOrigin: env.APP_ORIGIN, mobileScheme: env.MOBILE_SCHEME, metrics: platform.metrics });
  app.onError(errorContract(platform.logger, platform.metrics));

  // 2. modules, in layer order, with typed ports; identity's facade is needed by the principal middleware
  const registry = new ModuleRegistry();
  for (const m of modules(opts.overrides ?? {})) registry.add(m);
  const mounted: { basePath: string; app: Hono<any> }[] = [];
  await registry.boot({ db, platform, env, mount: (basePath, sub) => mounted.push({ basePath, app: sub }) });
  const identity = registry.facade<any>("identity");

  // 3. principal resolution — after modules exist (needs identity), before any route
  app.use("*", resolvePrincipal({
    identity, appOrigin: env.APP_ORIGIN,
    internalSecrets: [env.INTERNAL_API_SECRET, (env as any).INTERNAL_API_SECRET_NEXT].filter(Boolean),
    logger: platform.logger,
  }));

  // 4. public
  registerRoute("GET", "/health", "public");
  app.get("/health", (c) => c.json({ ok: true }));
  registerRoute("GET", "/ready", "public");
  app.get("/ready", async (c) => {
    const checks: Record<string, unknown> = {};
    try { await db.execute("SELECT 1"); checks.db = true; } catch { checks.db = false; }
    const h = await platform.health().catch(() => ({ ok: false, queue: null }));
    checks.queue = h.queue;
    const runs = await platform.jobs.lastRuns().catch(() => ({}));
    const stale = Object.entries(runs).filter(([, r]) => r.at && Date.now() - new Date(r.at).getTime() > 36 * 3600_000).map(([j]) => j);
    checks.staleJobs = stale;
    const ok = checks.db === true && h.ok && stale.length === 0;
    return c.json({ ok, ...checks }, ok ? 200 : 503);
  });
  registerRoute("GET", "/metrics", "public");
  app.get("/metrics", async (c) => c.text(await platform.metrics.render(), 200, { "Content-Type": "text/plain; version=0.0.4" }));
  registerRoute("GET", "/v1/app-config", "public");
  app.get("/v1/app-config", async (c) => c.json(await appConfig(platform)));

  // 5. Better Auth owns /api/auth/*
  app.on(["POST", "GET"], "/api/auth/*", (c) => identity.handler(c.req.raw));

  // 6. module routes (each already carries authorize())
  for (const m of mounted) app.route(m.basePath, m.app);

  // 7. jobs over HTTP for the cron container
  registerRoute("POST", "/v1/internal/run/:job", "jobs:run");
  app.post("/v1/internal/run/:job", authorize("jobs:run"), async (c) => {
    const name = c.req.param("job");
    if (!platform.jobs.has(name)) return c.json({ error: { code: "NOT_FOUND", message: `unknown job ${name}` } }, 404);
    return c.json(await platform.jobs.run(name));
  });

  if (opts.startPoller ?? true) platform.poller.start();

  const shutdown = async () => {
    platform.logger.info({}, "shutting down");
    await platform.poller.stop();       // finishes the in-flight delivery, then stops
    await db.close();
  };

  return { app, db, platform, registry, shutdown, env };
}

/** Process entry: builds, serves, dies cleanly on SIGTERM (compose gives 10 s). */
if (import.meta.main) {
  const { app, shutdown, env, platform } = await buildApp();
  const server = Bun.serve({ port: Number(process.env.PORT ?? 8000), fetch: app.fetch, idleTimeout: 30 });
  platform.logger.info({ port: server.port, env: env.NODE_ENV }, "api up");
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, async () => { server.stop(true); await shutdown(); process.exit(0); });
  }
}

/** Only public + /v1 (never /v1/internal) reach the mobile client's autocomplete. */
export type AppType = ReturnType<typeof buildApp> extends Promise<{ app: infer A }> ? A : never;

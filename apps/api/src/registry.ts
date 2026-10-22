import type { Hono } from "hono";
import { sql } from "drizzle-orm";
import { errorForLog, type Db } from "@bbc/db";
import type { Platform } from "@bbc/platform";
import type { ServerEnv } from "@bbc/shared/env";
import type { Layer, ModuleDescriptor, ModuleOutput } from "@bbc/shared/module-contract";

export type { ModuleDescriptor, ModuleOutput, Layer } from "@bbc/shared/module-contract";

const LAYER_ORDER: Layer[] = ["integration", "core", "domain", "intelligence", "presentation"];
// integration first: adapters (email, push, crm) are pure implementations of ports the others need.

/** Boot's patience with a database that is not up yet — a host reboot starts the api before postgres/pgbouncer, since
 *  restart policies ignore depends_on: the first try and five more after 0.5, 1, 2, 4 and 8 s, about 16 s in all. */
export const BOOT_RETRY_MS: readonly number[] = [500, 1_000, 2_000, 4_000, 8_000];

/** Boot could not read the database (SELECT 1, or a module's kill flag) after every retry. The process exits non-zero
 *  and the container's restart policy starts it again; it never runs with modules unmounted by an unread flag. */
export class DatabaseUnreachable extends Error {
  override name = "DatabaseUnreachable";
}

async function withRetry<T>(
  what: string,
  read: () => Promise<T>,
  delaysMs: readonly number[],
  logger: { warn: (o: object, m?: string) => void },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (e) {
      const delay = delaysMs[attempt - 1];
      if (delay === undefined)
        throw new DatabaseUnreachable(`database unreachable: ${what} failed ${attempt} times`, { cause: e });
      logger.warn({ what, attempt, retryInMs: delay, err: errorForLog(e) }, "boot: database not answering, retrying");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export class ModuleRegistry {
  private modules: ModuleDescriptor<any, any>[] = [];
  private facades = new Map<string, unknown>();
  readonly outputs = new Map<string, ModuleOutput<unknown>>();

  add(m: ModuleDescriptor<any, any>) {
    if (this.modules.some((x) => x.name === m.name)) throw new Error(`module registered twice: ${m.name}`);
    this.modules.push(m);
    return this;
  }

  /** Initialise in dependency order within layer order; satisfy ports from earlier facades; mount; register
   *  consumers and jobs. Same-layer dependencies (engagement → proposals) resolve topologically, not by the order
   *  in modules.ts. A killed module still inits its facade so dependents can boot, but routes/consumers/jobs
   *  are not registered (HTTP → 404; its pending deliveries pause via flags).
   *
   *  Killed means a kill flag the database answered with. Boot first waits for the database, then reads every kill
   *  flag with killState, which throws instead of failing closed; a database still unreachable after the retries
   *  rejects with DatabaseUnreachable before anything is mounted. Failing closed here would unmount every module for
   *  the life of the process while /health, /ready and /status stay green. */
  async boot(deps: {
    db: Db;
    platform: Platform;
    env: ServerEnv;
    mount: (basePath: string, app: Hono<any>) => void;
    /** Waits between attempts; tests pass short ones. */
    retryDelaysMs?: readonly number[];
  }) {
    const layerOf = new Map(this.modules.map((m) => [m.name, m.layer] as const));
    for (const m of this.modules)
      for (const need of m.needs ?? []) {
        const needLayer = layerOf.get(need);
        if (needLayer === undefined) throw new Error(`module ${m.name} needs port "${need}" but no module exposes it`);
        if (LAYER_ORDER.indexOf(needLayer) > LAYER_ORDER.indexOf(m.layer))
          throw new Error(`module ${m.name} (${m.layer}) needs "${need}" from a higher layer (${needLayer})`);
      }

    const delays = deps.retryDelaysMs ?? BOOT_RETRY_MS;
    const logger = deps.platform.logger;
    await withRetry("SELECT 1", () => deps.db.execute(sql`SELECT 1`), delays, logger);
    const killed = new Map<string, boolean>();
    for (const m of this.modules)
      killed.set(
        m.name,
        await withRetry(`kill flag of ${m.name}`, () => deps.platform.flags.killState(m.name), delays, logger),
      );

    const byLayer = [...this.modules].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
    const pending = new Set(byLayer);
    const initialised = new Set<string>();
    while (pending.size) {
      const ready = [...pending].find((m) => (m.needs ?? []).every((n) => initialised.has(n) || this.facades.has(n)));
      if (!ready) {
        const stuck = [...pending].map(
          (m) => `${m.name} needs [${(m.needs ?? []).filter((n) => !initialised.has(n)).join(", ")}]`,
        );
        throw new Error(`module dependency cycle or missing port:\n  ${stuck.join("\n  ")}`);
      }
      pending.delete(ready);
      const m = ready;
      const ports: Record<string, unknown> = {};
      for (const need of m.needs ?? []) {
        if (!this.facades.has(need))
          throw new Error(`module ${m.name} needs port "${need}" but "${need}" exposed nothing (killed or empty)`);
        ports[need] = this.facades.get(need);
      }
      const out = await m.init({ db: deps.db, platform: deps.platform, env: deps.env, ports });
      if (out.exposes !== undefined) this.facades.set(m.name, out.exposes);
      if (killed.get(m.name) === true) {
        deps.platform.logger.warn({ module: m.name }, "module killed by flag: facade only, not mounted");
        initialised.add(m.name);
        continue;
      }
      this.outputs.set(m.name, out);
      for (const r of out.routes ?? []) deps.mount(r.basePath, r.app);
      for (const c of out.consumers ?? []) deps.platform.events.registerConsumer(c.type, c.name, c.handler);
      // JobSpec lives in platform; shared keeps jobs.spec as unknown to avoid shared→platform.
      for (const j of out.jobs ?? [])
        deps.platform.jobs.register(j.name, j.spec as Parameters<Platform["jobs"]["register"]>[1]);
      deps.platform.logger.info(
        {
          module: m.name,
          routes: out.routes?.length ?? 0,
          consumers: out.consumers?.length ?? 0,
          jobs: out.jobs?.length ?? 0,
        },
        "module mounted",
      );
      initialised.add(m.name);
    }
  }

  facade<T>(name: string): T {
    const f = this.facades.get(name);
    if (!f) throw new Error(`no facade: ${name}`);
    return f as T;
  }
}

import type { Hono } from "hono";
import type { Db } from "@bbc/db";
import type { Platform } from "@bbc/platform";
import type { ServerEnv } from "@bbc/shared/env";
import type { Layer, ModuleDescriptor, ModuleOutput } from "@bbc/shared/module-contract";

export type { ModuleDescriptor, ModuleOutput, Layer } from "@bbc/shared/module-contract";

const LAYER_ORDER: Layer[] = ["integration", "core", "domain", "intelligence", "presentation"];
// integration first: adapters (email, push, crm) are pure implementations of ports the others need.

export class ModuleRegistry {
  private modules: ModuleDescriptor<any, any>[] = [];
  private facades = new Map<string, unknown>();
  readonly outputs = new Map<string, ModuleOutput<unknown>>();

  add(m: ModuleDescriptor<any, any>) {
    if (this.modules.some((x) => x.name === m.name)) throw new Error(`module registered twice: ${m.name}`);
    this.modules.push(m);
    return this;
  }

  /** Initialise in layer order; satisfy ports from earlier facades; mount; register consumers and jobs.
   *  A killed module is skipped entirely: no routes, no consumers (its pending deliveries pause via flags). */
  async boot(deps: { db: Db; platform: Platform; env: ServerEnv; mount: (basePath: string, app: Hono<any>) => void }) {
    const ordered = [...this.modules].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer));
    for (const m of ordered) {
      const ports: Record<string, unknown> = {};
      for (const need of m.needs ?? []) {
        if (!this.facades.has(need))
          throw new Error(`module ${m.name} needs port "${need}" but no earlier module exposes it (check layers)`);
        ports[need] = this.facades.get(need);
      }
      if (await deps.platform.flags.isKilled(m.name)) {
        deps.platform.logger.warn({ module: m.name }, "module killed by flag: not mounted");
        continue;
      }
      const out = await m.init({ db: deps.db, platform: deps.platform, env: deps.env, ports });
      this.outputs.set(m.name, out);
      if (out.exposes !== undefined) this.facades.set(m.name, out.exposes);
      for (const r of out.routes ?? []) deps.mount(r.basePath, r.app);
      for (const c of out.consumers ?? []) deps.platform.events.registerConsumer(c.type, c.name, c.handler);
      for (const j of out.jobs ?? []) deps.platform.jobs.register(j.name, j.spec);
      deps.platform.logger.info(
        {
          module: m.name,
          routes: out.routes?.length ?? 0,
          consumers: out.consumers?.length ?? 0,
          jobs: out.jobs?.length ?? 0,
        },
        "module mounted",
      );
    }
  }

  facade<T>(name: string): T {
    const f = this.facades.get(name);
    if (!f) throw new Error(`no facade: ${name}`);
    return f as T;
  }
}

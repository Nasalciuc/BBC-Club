/** The module contract lives in shared so modules never import from apps/api (that would be a cycle:
 *  apps/api imports the modules). Pure types — nothing here runs. */
import type { Hono } from "hono";

export type Layer = "platform" | "integration" | "core" | "domain" | "intelligence" | "presentation";

export type ModuleOutput<Exposes> = {
  /** The public facade other modules may receive as a port. */
  exposes?: Exposes;
  /** Routes mounted under their basePath; each already carries its own authorize(). */
  routes?: { basePath: string; app: Hono<any> }[];
  /** Event consumers, registered before the poller starts. */
  consumers?: { type: string; name: string; handler: (ctx: any, payload: any) => Promise<void> }[];
  /** Jobs exposed at /v1/internal/run/:name. Spec shape is owned by platform.jobs. */
  jobs?: { name: string; spec: unknown }[];
};

export type ModuleInitDeps<Ports> = { db: any; platform: any; env: any; ports: Ports };

export type ModuleDescriptor<Ports = Record<string, never>, Exposes = unknown> = {
  name: string;
  layer: Layer;
  /** Facades this module needs, resolved from modules initialised earlier. A missing port fails boot. */
  needs?: readonly (keyof Ports & string)[];
  init: (deps: ModuleInitDeps<Ports>) => ModuleOutput<Exposes> | Promise<ModuleOutput<Exposes>>;
};

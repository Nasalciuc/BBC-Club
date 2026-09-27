/** The module contract lives in shared so modules never import from apps/api (that would be a cycle:
 *  apps/api imports the modules). Pure types — nothing here runs. */
import type { Hono } from "hono";
import type { ServerEnv } from "./env";
import type { PublishInput } from "./events/publish-input";
import type { AppEnv } from "./http/app-env";
import type { ConsumerSpec, JobSpec } from "./platform-specs";

export type Layer = "platform" | "integration" | "core" | "domain" | "intelligence" | "presentation";

/** Delivery transaction. `ctx.db` is a type error — a handler that escapes the poller's tx used to compile. */
type TxChain = {
  values: (v: unknown) => TxChain;
  where: (c: unknown) => unknown;
  returning: (sel?: unknown) => unknown;
  onConflictDoNothing: (opts?: unknown) => unknown;
};
export type HandlerTx = {
  execute: (...args: unknown[]) => Promise<unknown>;
  insert: (table: unknown) => TxChain;
  delete: (table: unknown) => TxChain;
  select: (...args: unknown[]) => unknown;
  update: (table: unknown) => TxChain;
};

export type HandlerLogger = {
  debug?: (o: object, m?: string) => void;
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
  error: (o: object, m?: string) => void;
};

export type HandlerContext = {
  tx: HandlerTx;
  logger: HandlerLogger;
  deliveryId: string;
  event: {
    id: string;
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    occurredAt: Date;
  };
  principal: { kind: "system"; role: "system"; source: "handler"; actorMemberId?: string };
  attempt: number;
  signal: AbortSignal;
};

export type ModuleDb = {
  /** Modules cast this once at their boundary: `db as unknown as Executor`. `unknown` is honest about
   *  what shared can know; the previous catch-all type let that cast be skipped. */
  transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type ModulePlatform = {
  logger: HandlerLogger;
  flags: {
    isEnabled: (key: string, fallback?: boolean) => Promise<boolean>;
    isKilled: (module: string) => Promise<boolean>;
    isConsumerPaused: (consumer: string) => Promise<boolean>;
  };
  events: {
    publish: (exec: unknown, input: PublishInput) => Promise<unknown>;
    tombstoneMember: (exec: unknown, memberId: string) => Promise<unknown>;
    registerConsumer: (type: string, name: string, handler: ConsumerSpec["handler"]) => void;
  };
  jobs: { register: (name: string, spec: JobSpec) => void };
  rateLimit: {
    check(
      rule: string,
      subject: string,
    ): Promise<{ allowed: boolean; remaining: number; resetMs: number; retryAfterMs?: number; limit: number }>;
  };
};

export type ModuleOutput<Exposes> = {
  /** The public facade other modules may receive as a port. */
  exposes?: Exposes;
  /** Routes mounted under their basePath; each already carries its own authorize(). */
  routes?: { basePath: string; app: Hono<AppEnv> }[];
  /** Event consumers, registered before the poller starts. */
  consumers?: { type: string; name: string; handler: (ctx: HandlerContext, payload: unknown) => Promise<void> }[];
  /** Jobs exposed at /v1/internal/run/:name. Spec shape is owned by platform.jobs. */
  jobs?: { name: string; spec: JobSpec }[];
};

export type ModuleInitDeps<Ports> = {
  db: ModuleDb;
  platform: ModulePlatform;
  env: ServerEnv;
  ports: Ports;
};

export type ModuleDescriptor<Ports = Record<string, never>, Exposes = unknown> = {
  name: string;
  layer: Layer;
  /** Facades this module needs, resolved from modules initialised earlier. A missing port fails boot. */
  needs?: readonly (keyof Ports & string)[];
  init: (deps: ModuleInitDeps<Ports>) => ModuleOutput<Exposes> | Promise<ModuleOutput<Exposes>>;
};

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@bbc/db";
import { flags as flagsTable } from "../infrastructure/schema";
import type { Cache } from "../cache";

export type FlagValue = { enabled?: boolean; variant?: string; segment?: string[]; [k: string]: unknown };

const FlagValueSchema = z
  .object({
    enabled: z.boolean().optional(),
    variant: z.string().optional(),
    segment: z.array(z.string()).optional(),
  })
  .passthrough();

function parseValue(raw: unknown): FlagValue | null {
  const r = FlagValueSchema.safeParse(raw);
  return r.success ? (r.data as FlagValue) : null;
}

/** Feature flags cache 30s. Kill/pause skip the cache. A read error on kill/pause is fail-closed (treat as killed).
 *  A missing row is not killed. isEnabled/variant still fall back to the caller default. */
export function createFlags(
  db: Executor,
  opts: {
    ttlMs?: number;
    logger?: { warn: (o: object, m?: string) => void };
    /** When set, ordinary flag reads go through it. Kill and pause never do. */
    cache?: Cache;
  } = {},
) {
  const ttl = opts.ttlMs ?? 30_000;
  const cache = new Map<string, { value: FlagValue | null; at: number }>();

  async function readDb(key: string): Promise<FlagValue | null> {
    const [row] = await db.select({ value: flagsTable.value }).from(flagsTable).where(eq(flagsTable.key, key)).limit(1);
    return parseValue(row?.value);
  }

  const localMs = 5_000;

  async function read(key: string): Promise<FlagValue | null> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < (opts.cache ? localMs : ttl)) return hit.value;
    if (opts.cache) {
      try {
        const value = await opts.cache.getOrLoad(`flags:${key}`, Math.max(1, Math.ceil(ttl / 1000)), () => readDb(key));
        cache.set(key, { value, at: Date.now() });
        return value;
      } catch (e) {
        opts.logger?.warn({ key, err: String(e) }, "flag read failed, using fallback");
        return null;
      }
    }
    try {
      const value = await readDb(key);
      cache.set(key, { value, at: Date.now() });
      return value;
    } catch (e) {
      opts.logger?.warn({ key, err: String(e) }, "flag read failed, using fallback");
      return hit?.value ?? null;
    }
  }

  async function readKill(key: string): Promise<FlagValue | null> {
    const [row] = await db.select({ value: flagsTable.value }).from(flagsTable).where(eq(flagsTable.key, key)).limit(1);
    return parseValue(row?.value);
  }

  return {
    async isEnabled(key: string, fallback = false): Promise<boolean> {
      const v = await read(key);
      return typeof v?.enabled === "boolean" ? v.enabled : fallback;
    },
    async variant(key: string, fallback: string): Promise<string> {
      const v = await read(key);
      return typeof v?.variant === "string" ? v.variant : fallback;
    },
    async isKilled(module: string): Promise<boolean> {
      try {
        const v = await readKill(`${module}.killed`);
        return v?.enabled === true;
      } catch (e) {
        opts.logger?.warn({ module, err: String(e) }, "kill flag unreadable, failing closed");
        return true;
      }
    },
    async isConsumerPaused(consumer: string): Promise<boolean> {
      try {
        const v = await readKill(`consumer.${consumer}.paused`);
        return v?.enabled === true;
      } catch (e) {
        opts.logger?.warn({ consumer, err: String(e) }, "pause flag unreadable, failing closed");
        return true;
      }
    },
    async inSegment(key: string, memberId: string): Promise<boolean> {
      const v = await read(key);
      const seg = v?.segment;
      return Array.isArray(seg) ? seg.includes(memberId) : false;
    },
    async set(key: string, value: FlagValue, description?: string) {
      await db
        .insert(flagsTable)
        .values({ key, value, description })
        .onConflictDoUpdate({ target: flagsTable.key, set: { value, description, updatedAt: sql`now()` } });
      cache.delete(key);
      await opts.cache?.invalidate(`flags:${key}`);
    },
    invalidate: (key?: string) => (key ? cache.delete(key) : cache.clear()),
    /** Cached flag row. The limiter reads `ratelimit.<rule>` here — never a query the facade exposes. */
    read,
    async killSwitches(modules: string[]): Promise<Record<string, boolean>> {
      const out: Record<string, boolean> = {};
      for (const m of modules) out[m] = await this.isKilled(m);
      return out;
    },
  };
}
export type Flags = ReturnType<typeof createFlags>;

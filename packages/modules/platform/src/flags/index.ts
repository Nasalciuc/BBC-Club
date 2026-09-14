import { eq, sql } from "drizzle-orm";
import { flags as flagsTable } from "../infrastructure/schema";

export type FlagValue = { enabled?: boolean; variant?: string; segment?: string[]; [k: string]: unknown };

/** Flags are read on hot paths, so they are cached in-process for 30 s and invalidated on write.
 *  Fail-safe: if the database cannot be read, killswitches report "not killed" — a read error must not
 *  take the product down; feature flags fall back to the caller's default. */
export function createFlags(
  db: any,
  opts: { ttlMs?: number; logger?: { warn: (o: object, m?: string) => void } } = {},
) {
  const ttl = opts.ttlMs ?? 30_000;
  const cache = new Map<string, { value: FlagValue | null; at: number }>();

  async function read(key: string): Promise<FlagValue | null> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    try {
      const [row] = await db
        .select({ value: flagsTable.value })
        .from(flagsTable)
        .where(eq(flagsTable.key, key))
        .limit(1);
      const value = (row?.value as FlagValue) ?? null;
      cache.set(key, { value, at: Date.now() });
      return value;
    } catch (e) {
      opts.logger?.warn({ key, err: String(e) }, "flag read failed, using fallback");
      return hit?.value ?? null; // stale-if-error
    }
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
    /** Module killswitch: `module.killed = { enabled: true }` disables the module. Never throws. */
    async isKilled(module: string): Promise<boolean> {
      const v = await read(`${module}.killed`);
      return v?.enabled === true;
    },
    /** Consumer pause, used by the poller. */
    async isConsumerPaused(consumer: string): Promise<boolean> {
      const v = await read(`consumer.${consumer}.paused`);
      return v?.enabled === true;
    },
    async inSegment(key: string, memberId: string): Promise<boolean> {
      const v = await read(key);
      return Array.isArray(v?.segment) ? v!.segment!.includes(memberId) : false;
    },
    async set(key: string, value: FlagValue, description?: string) {
      await db
        .insert(flagsTable)
        .values({ key, value, description })
        .onConflictDoUpdate({ target: flagsTable.key, set: { value, description, updatedAt: sql`now()` } });
      cache.delete(key);
    },
    invalidate: (key?: string) => (key ? cache.delete(key) : cache.clear()),
    /** For /v1/app-config: the killswitches the app needs to know about. */
    async killSwitches(modules: string[]): Promise<Record<string, boolean>> {
      const out: Record<string, boolean> = {};
      for (const m of modules) out[m] = await this.isKilled(m);
      return out;
    },
  };
}
export type Flags = ReturnType<typeof createFlags>;

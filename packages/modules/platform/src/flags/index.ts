import { sql } from "drizzle-orm";
import { z } from "zod";
import { errorForLog, type Executor } from "@bbc/db";
import { flags as flagsTable } from "../infrastructure/schema";
import { createGenerations, createSnapshot, type Generations } from "../generations";

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

/** Counters read longer ago than this make a kill or pause flag untrusted: `isKilled` says killed, `killedState` and
 *  `consumerPauseState` say "unknown" — OVERLOADED for a route, a delivery left pending (ADR-IMPL-075, ADR-IMPL-080). */
export const KILL_STALE_MS = 10_000;

/**
 * Feature, kill and pause flags, from one snapshot of `platform.flags` per process (ADR-IMPL-075). The table's trigger
 * bumps its generation in the writing statement, so a write — `set()` here, a job, an operator in psql — reaches every
 * replica in about a second; reading a flag costs no query in between.
 *
 * Failure: an ordinary flag that cannot be read falls back to the caller's default (the last value read, when there is
 * one). A kill or pause flag that cannot be read, or whose counters this process has not been able to ask Postgres for
 * in more than KILL_STALE_MS, is not trusted (ADR-IMPL-080): `killedState` and `consumerPauseState` answer "unknown" —
 * a route answers OVERLOADED, the poller leaves the delivery pending — and only a row that says so is "killed" or
 * "paused"; `isKilled` keeps failing closed (killed) for a yes or no. `killState` is the kill flag without that
 * fallback: it throws when the flag cannot be read, for boot, which must not take an unreadable flag for a killed module
 * (that would unmount it for the life of the process). `readStrict` throws the same way, for app-config, which keeps its
 * own last good answer.
 */
export function createFlags(
  db: Executor,
  opts: {
    logger?: { warn: (o: object, m?: string) => void };
    /** The process's counters (createPlatform passes its own); a flags object made alone makes its own. */
    generations?: Generations;
    now?: () => number;
  } = {},
) {
  const generations = opts.generations ?? createGenerations(db, { logger: opts.logger, now: opts.now });
  const snapshot = createSnapshot(
    generations,
    "platform.flags",
    async () => {
      const rows = await db.select({ key: flagsTable.key, value: flagsTable.value }).from(flagsTable);
      return new Map(rows.map((r) => [r.key, parseValue(r.value)] as const));
    },
    // A minute at most, whatever the counters say (G4): a flag written by a path no trigger sees still arrives. That
    // reload runs behind the callers, who answer from what is held meanwhile (ADR-IMPL-080).
    { now: opts.now, maxAgeMs: 60_000, logger: opts.logger },
  );

  /** The flag row as the snapshot holds it, or the error that kept the table from being read: no fallback. */
  async function readStrict(key: string): Promise<FlagValue | null> {
    return (await snapshot.get()).get(key) ?? null;
  }

  async function read(key: string): Promise<FlagValue | null> {
    try {
      return await readStrict(key);
    } catch (e) {
      opts.logger?.warn({ key, err: errorForLog(e) }, "flag read failed, using fallback");
      return null;
    }
  }

  /** A kill or pause flag: throws when it cannot be read or when the counters are older than KILL_STALE_MS. The counters
   *  are asked first (a bounded wait): flags that cannot be trusted are said so before any load of the table is waited
   *  for — a new replica whose Postgres stopped answering has nothing held, and its load would wait as long as the
   *  connection (ADR-IMPL-080). */
  async function readGuard(key: string): Promise<FlagValue | null> {
    await generations.current("platform.flags");
    const stale = generations.staleMs();
    if (stale > KILL_STALE_MS) throw new Error(`flags unread for ${Math.round(stale / 1000)} s`);
    return readStrict(key);
  }

  async function killState(module: string): Promise<boolean> {
    const v = await readStrict(`${module}.killed`);
    return v?.enabled === true;
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
    /** The kill flag as the snapshot holds it; throws when it cannot be read. Per request, use isKilled. */
    killState,
    async isKilled(module: string): Promise<boolean> {
      try {
        return (await readGuard(`${module}.killed`))?.enabled === true;
      } catch (e) {
        opts.logger?.warn({ module, err: errorForLog(e) }, "kill flag unreadable, failing closed");
        return true;
      }
    },
    /** "killed" when the row says so; "unknown" when the flags cannot be trusted (unread, or older than KILL_STALE_MS):
     *  a route answers OVERLOADED then — the module is not off, this process is behind (ADR-IMPL-080). */
    async killedState(module: string): Promise<"killed" | "live" | "unknown"> {
      try {
        return (await readGuard(`${module}.killed`))?.enabled === true ? "killed" : "live";
      } catch (e) {
        opts.logger?.warn({ module, err: errorForLog(e) }, "kill flag unreadable");
        return "unknown";
      }
    },
    /** "paused" only when the row says so. A flag that cannot be trusted (unread, or counters older than
     *  KILL_STALE_MS) is "unknown": the poller leaves the delivery pending for later and does not park it — a park
     *  outlived its cause, and only an operator undid it (ADR-IMPL-080). */
    async consumerPauseState(consumer: string): Promise<"paused" | "running" | "unknown"> {
      try {
        return (await readGuard(`consumer.${consumer}.paused`))?.enabled === true ? "paused" : "running";
      } catch (e) {
        opts.logger?.warn({ consumer, err: errorForLog(e) }, "pause flag unreadable, delivery left pending");
        return "unknown";
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
      // The trigger bumped the counter; this process asks for it at once rather than within the second.
      generations.invalidate();
    },
    /** The next read asks Postgres whether the table changed (after a write this process made outside `set`). */
    invalidate: () => generations.invalidate(),
    /** The flag row, from the snapshot. The limiter reads `ratelimit.<rule>` here — never a query the facade exposes. */
    read,
    readStrict,
  };
}
export type Flags = ReturnType<typeof createFlags>;

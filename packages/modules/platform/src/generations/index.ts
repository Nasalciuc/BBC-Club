import { sql } from "drizzle-orm";
import { errorForLog, withTx, type Executor } from "@bbc/db";
import { generations as generationsTable } from "../infrastructure/schema";

type Logger = { warn: (o: object, m?: string) => void };
/** Hits and misses, as `cache_hit` / `cache_miss` by `ns` (the app dashboard's hit ratio, ADR-IMPL-073). */
type Counted = { metrics?: { inc: (name: string, labels?: Record<string, string>) => void }; ns?: string };
const count = (o: Counted, hit: boolean) => {
  if (o.metrics && o.ns) o.metrics.inc(hit ? "cache_hit" : "cache_miss", { ns: o.ns });
};

/** How often a process asks Postgres whether a reference table changed. */
export const GENERATIONS_REFRESH_MS = 1_000;
/** A read of the counters that takes longer than this is stopped by the server (statement_timeout): the request goes on
 *  with what the process has. */
export const GENERATIONS_READ_TIMEOUT_MS = 500;
/** Counters older than this are waited for: past it a fail-closed caller would refuse anyway, so the request waits for
 *  the read — GENERATIONS_READ_TIMEOUT_MS + 100 ms at most — rather than answer from what may be minutes old. Half of
 *  KILL_STALE_MS. */
export const GENERATIONS_WAIT_WHEN_STALE_MS = 5_000;
/** A read that has not answered in this long is given up (a connection that stopped answering): the next caller starts
 *  another, and an answer that comes after a newer one is dropped. */
export const GENERATIONS_ABANDON_MS = 5_000;

/**
 * The counters of `platform.generations` as this process last read them (ADR-IMPL-075). A trigger on each reference
 * table bumps its counter in the transaction that writes it, so the counters say, for every replica, whether what it
 * holds in memory is still what Postgres holds — after a write from the app, a job or psql alike.
 *
 * Read lazily, one read at a time: the first caller after a second starts it and everyone answers from what is held
 * while it runs (ADR-IMPL-080). Callers wait for it while nothing is held yet, after this process wrote a reference table
 * itself (`invalidate`, `bump`: it must see its own write), and while what is held is older than
 * GENERATIONS_WAIT_WHEN_STALE_MS (Postgres has not answered for a while) — and never longer than the read's timeout and
 * 100 ms from when it began: the server stops the statement at GENERATIONS_READ_TIMEOUT_MS, so a lock on the table holds
 * one connection, not one per second, but a read can also wait for a pooled connection, a connect, or a connection that
 * stopped answering, and no caller waits for those. A read lost for GENERATIONS_ABANDON_MS is given up. A read that
 * fails keeps the last counters, and `staleMs()` says how long ago they were last read — what a fail-closed caller (the
 * kill switch) looks at. Time is the process's monotonic clock: a wall clock moved back does not freeze the counters.
 */
export function createGenerations(
  db: Executor,
  opts: {
    refreshMs?: number;
    readTimeoutMs?: number;
    now?: () => number;
    logger?: Logger;
    waitWhenStaleMs?: number;
    abandonMs?: number;
    /** Tests: stands in for the server's start time (`pg_postmaster_start_time()`) as the read returns it. */
    bootTime?: (fromServer: string | null) => string | null;
  } = {},
) {
  const refreshMs = opts.refreshMs ?? GENERATIONS_REFRESH_MS;
  const readTimeoutMs = Math.max(1, Math.floor(opts.readTimeoutMs ?? GENERATIONS_READ_TIMEOUT_MS));
  const now = opts.now ?? (() => performance.now());
  const waitWhenStaleMs = opts.waitWhenStaleMs ?? GENERATIONS_WAIT_WHEN_STALE_MS;
  const abandonMs = opts.abandonMs ?? GENERATIONS_ABANDON_MS;
  /** How long after a read began a caller may still wait for it (real time, whatever `now` is). */
  const waitMs = readTimeoutMs + 100;
  let values = new Map<string, number>();
  let readAt = Number.NEGATIVE_INFINITY;
  let askedAt = Number.NEGATIVE_INFINITY;
  /** The read running: `since` is `writes` when it began, `at` when (on `now`), `until` the last moment a caller waits
   *  for it (real time). */
  let reading: { done: Promise<void>; since: number; at: number; until: number } | null = null;
  let started = 0;
  let landed = 0;
  /** Moves when this process wrote a reference table itself; a read that started before it cannot see that write. */
  let writes = 0;
  let readSince = -1;
  let bootAt: string | null = null;
  let epoch = 0;
  const asked = new Set<string>();

  async function read(seq: number, since: number): Promise<void> {
    const rows = await withTx(db, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${readTimeoutMs}ms'`));
      return tx
        .select({
          key: generationsTable.key,
          value: generationsTable.value,
          boot: sql<string>`pg_postmaster_start_time()::text`,
        })
        .from(generationsTable);
    });
    if (seq < landed) return; // a read given up, answering after a newer one: what it saw is older
    landed = seq;
    const next = new Map(rows.map((r) => [r.key, Number(r.value)]));
    const boot = opts.bootTime ? opts.bootTime(rows[0]?.boot ?? null) : (rows[0]?.boot ?? null);
    // A restart, a restore or a failover can bring the counters back to values already seen, and a counter that went
    // down is one: the epoch moves, and every snapshot and memo built on the counters loads again (G4).
    const restarted = boot !== null && bootAt !== null && boot !== bootAt;
    const wentBack = [...values].some(([key, value]) => (next.get(key) ?? 0) < value);
    if (restarted || wentBack) epoch += 1;
    if (boot !== null) bootAt = boot;
    values = next;
    readAt = now();
    readSince = since;
  }

  function startRead(): NonNullable<typeof reading> {
    const seq = ++started;
    const since = writes;
    // Held in `reading` and awaited by whoever must wait for it; its failure is logged and the last counters stay.
    const done: Promise<void> = read(seq, since)
      .catch((e: unknown) => {
        opts.logger?.warn({ err: errorForLog(e) }, "generations unread, keeping the last ones");
      })
      .finally(() => {
        if (reading?.done === done) reading = null;
      });
    reading = { done, since, at: now(), until: performance.now() + waitMs };
    return reading;
  }

  /** Waits for the read until its `until` at most: a statement the server did not stop (a pool's queue, a connect, a
   *  connection that stopped answering) is not every caller's to wait for (ADR-IMPL-080). True when it ended. */
  async function within(r: NonNullable<typeof reading>): Promise<boolean> {
    const left = r.until - performance.now();
    if (left <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), left);
    });
    try {
      return await Promise.race([r.done.then(() => true as const), late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The counters, at most `refreshMs` old when Postgres answers; the last ones read when it does not. */
  async function fresh(): Promise<void> {
    // A read lost (a connection that stopped answering) must not keep every later read from starting.
    if (reading && now() - reading.at > abandonMs) reading = null;
    const wait = readSince < writes || now() - readAt > waitWhenStaleMs; // readAt is -Infinity before the first read
    if (now() - askedAt < refreshMs) {
      if (wait && reading) await within(reading);
      return;
    }
    askedAt = now();
    // A read already running that began before this process's own write cannot see it: let it end, then read again.
    if (wait && reading && reading.since < writes && !(await within(reading))) return;
    const current = reading ?? startRead();
    if (wait) await within(current);
  }

  return {
    /** This key's counter; `null` while the process has never read the counters (Postgres has not answered yet). A key
     *  with no row reads 0: its table's trigger makes the row on the first write, which moves it to 1. */
    async current(key: string): Promise<number | null> {
      asked.add(key);
      await fresh();
      if (readAt === Number.NEGATIVE_INFINITY) return null;
      return values.get(key) ?? 0;
    },
    /** Milliseconds since the counters were last read; `Infinity` before the first read. */
    staleMs(): number {
      return now() - readAt;
    },
    /** Moves when Postgres restarted under the counters, or one of them went back (G4): what was built on them loads
     *  again. */
    epoch(): number {
      return epoch;
    },
    /** The keys asked for since the process started (tests: each must have its table's trigger). */
    keysAsked(): string[] {
      return [...asked];
    },
    /** The next `current()` asks Postgres again, and waits for it — after this process wrote a reference table itself. */
    invalidate(): void {
      writes += 1;
      askedAt = Number.NEGATIVE_INFINITY;
    },
    /** Bumps a counter outside a trigger: for state a trigger cannot see (none today), and for tests. */
    async bump(key: string, exec: Executor = db): Promise<void> {
      // What platform.bump_generation does in SQL (0045), written here through the table's own schema.
      await exec
        .insert(generationsTable)
        .values({ key, value: 1 })
        .onConflictDoUpdate({
          target: generationsTable.key,
          set: { value: sql`${generationsTable.value} + 1`, updatedAt: sql`now()` },
        });
      writes += 1;
      askedAt = Number.NEGATIVE_INFINITY;
    },
  };
}
export type Generations = ReturnType<typeof createGenerations>;

/**
 * A whole reference table (or what is built from it) held in this process, loaded again when its generation changes
 * (ADR-IMPL-075). `maxAgeMs` also bounds what depends on the clock rather than on a write (a fare whose day has passed):
 * past it the value held is served once more while it loads again. While Postgres does not answer, the last value loaded
 * keeps being served; with nothing loaded yet, `get()` throws.
 */
export function createSnapshot<T>(
  generations: Generations,
  key: string,
  load: () => Promise<T>,
  opts: { maxAgeMs?: number; now?: () => number; logger?: Logger } & Counted = {},
) {
  const now = opts.now ?? (() => performance.now());
  let held: { gen: number | null; epoch: number; value: T; at: number } | null = null;
  let loading: Promise<T> | null = null;

  function startLoad(gen: number | null, epoch: number): Promise<T> {
    loading ??= load()
      .then((value) => {
        held = { gen, epoch, value, at: now() };
        return value;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  return {
    async get(): Promise<T> {
      const gen = await generations.current(key);
      const epoch = generations.epoch();
      // The counters unread (Postgres away), or still at what is held: what is held is served.
      if (held && (gen === null || (gen === held.gen && epoch === held.epoch))) {
        count(opts, true);
        // Older than maxAgeMs with nothing written: loaded again behind this caller, never waited for — a flag check
        // must not wait for the flags table once a minute (ADR-IMPL-080). The value held stays until the load lands.
        if (opts.maxAgeMs !== undefined && now() - held.at >= opts.maxAgeMs && !loading)
          startLoad(gen, epoch).catch((e: unknown) => {
            opts.logger?.warn({ key, err: errorForLog(e) }, "snapshot reload failed, the held value stays");
          });
        return held.value;
      }
      count(opts, false);
      try {
        return await startLoad(gen, epoch);
      } catch (e) {
        if (held) return held.value;
        throw e;
      }
    },
    /** The generation the held value was loaded at (tests, and the ETag of what is built from it). */
    heldGeneration(): number | null {
      return held?.gen ?? null;
    },
  };
}
export type Snapshot<T> = ReturnType<typeof createSnapshot<T>>;

/**
 * Results computed from reference tables, kept per key for one generation of each (ADR-IMPL-075): the airports'
 * typeahead by the text typed, the destinations by home airport. A new generation of any table it names empties it.
 * `maxEntries` caps the memory a stream of distinct keys can take; `ttlMs` bounds what changes with the clock.
 */
export function createGenerationMemo<T>(
  generations: Generations,
  keys: string | readonly string[],
  opts: { maxEntries: number; ttlMs?: number; now?: () => number } & Counted,
) {
  const now = opts.now ?? (() => performance.now());
  const names = typeof keys === "string" ? [keys] : [...keys];
  let gen: string | null = null;
  const entries = new Map<string, { value: Promise<T>; at: number }>();

  return {
    async get(k: string, load: () => Promise<T>): Promise<T> {
      const gens = await Promise.all(names.map((n) => generations.current(n)));
      const current = `${generations.epoch()}:${gens.join(":")}`;
      if (current !== gen) {
        entries.clear();
        gen = current;
      }
      const hit = entries.get(k);
      if (hit && (opts.ttlMs === undefined || now() - hit.at < opts.ttlMs)) {
        count(opts, true);
        return hit.value;
      }
      count(opts, false);
      entries.delete(k);
      // The oldest first (a key is deleted before it is set again, so the map's order is its age): up to 8 entries that
      // outlived ttlMs go with each insert, so expired keys do not wait for maxEntries to leave (C-R1).
      if (opts.ttlMs !== undefined) {
        let swept = 0;
        for (const [old, e] of entries) {
          if (swept >= 8 || now() - e.at < opts.ttlMs) break;
          entries.delete(old);
          swept += 1;
        }
      }
      if (entries.size >= opts.maxEntries) entries.delete(entries.keys().next().value as string);
      const value = load();
      entries.set(k, { value, at: now() });
      value.catch(() => {
        if (entries.get(k)?.value === value) entries.delete(k);
      });
      return value;
    },
    size: () => entries.size,
    generation: () => gen,
  };
}
export type GenerationMemo<T> = ReturnType<typeof createGenerationMemo<T>>;

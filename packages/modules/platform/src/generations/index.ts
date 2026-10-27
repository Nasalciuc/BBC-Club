import { sql } from "drizzle-orm";
import { errorForLog, type Executor } from "@bbc/db";
import { generations as generationsTable } from "../infrastructure/schema";

type Logger = { warn: (o: object, m?: string) => void };
/** Hits and misses, as `cache_hit` / `cache_miss` by `ns` (the app dashboard's hit ratio, ADR-IMPL-073). */
type Counted = { metrics?: { inc: (name: string, labels?: Record<string, string>) => void }; ns?: string };
const count = (o: Counted, hit: boolean) => {
  if (o.metrics && o.ns) o.metrics.inc(hit ? "cache_hit" : "cache_miss", { ns: o.ns });
};

/** How often a process asks Postgres whether a reference table changed. */
export const GENERATIONS_REFRESH_MS = 1_000;
/** A read of the counters that takes longer than this is left behind: the request goes on with what the process has. */
export const GENERATIONS_READ_TIMEOUT_MS = 500;

/**
 * The counters of `platform.generations` as this process last read them (ADR-IMPL-075). A trigger on each reference
 * table bumps its counter in the transaction that writes it, so the counters say, for every replica, whether what it
 * holds in memory is still what Postgres holds — after a write from the app, a job or psql alike.
 *
 * Read lazily: the first caller after a second asks Postgres (one small query, shared by every caller of that moment);
 * everyone else answers from memory. A read that fails or is slow keeps the last counters, and `staleMs()` says how long
 * ago they were last read — what a fail-closed caller (the kill switch) looks at.
 */
export function createGenerations(
  db: Executor,
  opts: { refreshMs?: number; readTimeoutMs?: number; now?: () => number; logger?: Logger } = {},
) {
  const refreshMs = opts.refreshMs ?? GENERATIONS_REFRESH_MS;
  const readTimeoutMs = opts.readTimeoutMs ?? GENERATIONS_READ_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  let values = new Map<string, number>();
  let readAt = Number.NEGATIVE_INFINITY;
  let askedAt = Number.NEGATIVE_INFINITY;
  let reading: Promise<void> | null = null;

  async function read(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const rows = await Promise.race([
        db.select({ key: generationsTable.key, value: generationsTable.value }).from(generationsTable),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`generations unread after ${readTimeoutMs} ms`)), readTimeoutMs);
        }),
      ]);
      values = new Map(rows.map((r) => [r.key, Number(r.value)]));
      readAt = now();
    } finally {
      clearTimeout(timer);
    }
  }

  /** The counters, at most `refreshMs` old when Postgres answers; the last ones read when it does not. */
  async function fresh(): Promise<void> {
    if (now() - askedAt < refreshMs) {
      if (reading) await reading;
      return;
    }
    askedAt = now();
    reading ??= read()
      .catch((e: unknown) => {
        opts.logger?.warn({ err: errorForLog(e) }, "generations unread, keeping the last ones");
      })
      .finally(() => {
        reading = null;
      });
    await reading;
  }

  return {
    /** This key's counter; `null` while the process has never read the counters (Postgres has not answered yet). */
    async current(key: string): Promise<number | null> {
      await fresh();
      if (readAt === Number.NEGATIVE_INFINITY) return null;
      return values.get(key) ?? 0;
    },
    /** Milliseconds since the counters were last read; `Infinity` before the first read. */
    staleMs(): number {
      return now() - readAt;
    },
    /** The next `current()` asks Postgres again — after this process wrote a reference table itself. */
    invalidate(): void {
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
      askedAt = Number.NEGATIVE_INFINITY;
    },
  };
}
export type Generations = ReturnType<typeof createGenerations>;

/**
 * A whole reference table (or what is built from it) held in this process, loaded again when its generation changes
 * (ADR-IMPL-075). `maxAgeMs` also bounds what depends on the clock rather than on a write (a fare whose day has passed).
 * While Postgres does not answer, the last value loaded keeps being served; with nothing loaded yet, `get()` throws.
 */
export function createSnapshot<T>(
  generations: Generations,
  key: string,
  load: () => Promise<T>,
  opts: { maxAgeMs?: number; now?: () => number } & Counted = {},
) {
  const now = opts.now ?? Date.now;
  let held: { gen: number | null; value: T; at: number } | null = null;
  let loading: Promise<T> | null = null;

  return {
    async get(): Promise<T> {
      const gen = await generations.current(key);
      const young = held !== null && (opts.maxAgeMs === undefined || now() - held.at < opts.maxAgeMs);
      // The counters unread (Postgres away): what is held stays, rather than a load that would fail too.
      if (held && young && (gen === null || gen === held.gen)) {
        count(opts, true);
        return held.value;
      }
      count(opts, false);
      loading ??= load()
        .then((value) => {
          held = { gen, value, at: now() };
          return value;
        })
        .finally(() => {
          loading = null;
        });
      try {
        return await loading;
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
  const now = opts.now ?? Date.now;
  const names = typeof keys === "string" ? [keys] : [...keys];
  let gen: string | null = null;
  const entries = new Map<string, { value: Promise<T>; at: number }>();

  return {
    async get(k: string, load: () => Promise<T>): Promise<T> {
      const current = (await Promise.all(names.map((n) => generations.current(n)))).join(":");
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

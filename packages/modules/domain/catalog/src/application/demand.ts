import type { Executor } from "@bbc/db";
import { demandDaily } from "@bbc/db/schema/catalog";
import { SearchEvent } from "@bbc/platform";

type Sketch = {
  topK: {
    reserve(key: string, k: number): Promise<unknown>;
    incrBy(key: string, item: { item: string; incrementBy: number }): Promise<unknown>;
    listWithCount(key: string): Promise<{ item: string; count: number }[]>;
  };
  cms: {
    initByProb(key: string, error: number, probability: number): Promise<unknown>;
    incrBy(key: string, item: { item: string; incrementBy: number }): Promise<unknown>;
    query(key: string, items: string[]): Promise<number[]>;
  };
};

const TOP = 1_000;

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function demandKeys(day: string) {
  return {
    routes: `demand:${day}:routes`,
    counts: `demand:${day}:counts`,
    nofare: `demand:${day}:nofare`,
  };
}

async function ensure(redis: Sketch, day: string) {
  const keys = demandKeys(day);
  await redis.topK.reserve(keys.routes, TOP).catch(() => undefined);
  await redis.cms.initByProb(keys.counts, 0.01, 0.001).catch(() => undefined);
  await redis.cms.initByProb(keys.nofare, 0.01, 0.001).catch(() => undefined);
}

/** One accepted search event. The caller already dropped identity fields. */
export async function recordSearch(redis: Sketch, event: SearchEvent) {
  const day = event.at ? utcDay(new Date(event.at)) : utcDay();
  await ensure(redis, day);
  const keys = demandKeys(day);
  const item = `${event.from}:${event.to}:${event.cabin}`;
  await redis.topK.incrBy(keys.routes, { item, incrementBy: 1 });
  await redis.cms.incrBy(keys.counts, { item, incrementBy: 1 });
  if (!event.hadFares) await redis.cms.incrBy(keys.nofare, { item, incrementBy: 1 });
}

/** Writes the previous UTC day from the sketches into catalog.demand_daily. */
export async function rollupDemand(redis: Sketch, db: Executor, day = yesterday()): Promise<{ rows: number }> {
  const ymd = utcDay(day);
  const keys = demandKeys(ymd);
  let listed: { item: string; count: number }[] = [];
  try {
    listed = await redis.topK.listWithCount(keys.routes);
  } catch {
    return { rows: 0 };
  }
  if (listed.length === 0) return { rows: 0 };
  const items = listed.map((row) => row.item);
  const counts = await redis.cms.query(keys.counts, items);
  const nofare = await redis.cms.query(keys.nofare, items);
  let rows = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const parts = item.split(":");
    const from = parts[0];
    const to = parts[1];
    const cabin = parts[2];
    if (!from || !to || (cabin !== "business" && cabin !== "first")) continue;
    const searches = Math.max(0, Number(counts[i] ?? 0));
    const searchesWithoutFare = Math.min(searches, Math.max(0, Number(nofare[i] ?? 0)));
    await db
      .insert(demandDaily)
      .values({
        day,
        routeFrom: from,
        routeTo: to,
        cabin,
        searches,
        searchesWithoutFare,
      })
      .onConflictDoUpdate({
        target: [demandDaily.day, demandDaily.routeFrom, demandDaily.routeTo, demandDaily.cabin],
        set: { searches, searchesWithoutFare },
      });
    rows++;
  }
  return { rows };
}

function yesterday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

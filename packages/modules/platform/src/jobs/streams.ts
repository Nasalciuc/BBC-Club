import type { Redis } from "../redis/client";

export const SHARDS = 8;
export const PUSH_GROUP = "push";

export const shardOf = (id: string) =>
  `jobs:push:{${[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % SHARDS}}`;

function shardKey(s: number) {
  return `jobs:push:{${s}}`;
}

export async function ensureGroups(redis: Redis, group: string) {
  for (let s = 0; s < SHARDS; s++) {
    await redis.xGroupCreate(shardKey(s), group, "0", { MKSTREAM: true }).catch((e) => {
      if (!String(e).includes("BUSYGROUP")) throw e;
    });
  }
}

export async function enqueue(redis: Redis, ids: string[]) {
  if (ids.length === 0) return;
  const multi = redis.multi();
  for (const id of ids) {
    multi.xAdd(shardOf(id), "*", { id }, { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 100_000 } });
  }
  await multi.exec();
}

type StreamId = { streamId: string; jobId: string; key: string };

function field(message: unknown, name: string): string | undefined {
  if (message instanceof Map) {
    const v = message.get(name);
    return typeof v === "string" ? v : undefined;
  }
  if (message && typeof message === "object" && name in message) {
    const v = (message as Record<string, unknown>)[name];
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

function takeMessages(
  key: string,
  messages: ({ id?: unknown; message?: unknown } | null)[] | null | undefined,
): StreamId[] {
  const out: StreamId[] = [];
  for (const m of messages ?? []) {
    if (!m?.id || !m.message) continue;
    const jobId = field(m.message, "id");
    if (jobId) out.push({ streamId: String(m.id), jobId, key });
  }
  return out;
}

/** Reclaim abandoned entries first, then read new ones, handle, ack. */
export async function runWorker(o: {
  redis: Redis;
  group: string;
  consumer: string;
  count: number;
  minIdleMs: number;
  signal: AbortSignal;
  handle: (ids: string[]) => Promise<void>;
}) {
  await ensureGroups(o.redis, o.group);
  while (!o.signal.aborted) {
    const pending: StreamId[] = [];
    try {
      for (let s = 0; s < SHARDS && pending.length < o.count; s++) {
        const key = shardKey(s);
        const claimed = await o.redis.xAutoClaim(key, o.group, o.consumer, o.minIdleMs, "0-0", {
          COUNT: o.count - pending.length,
        });
        pending.push(...takeMessages(key, claimed.messages));
      }
      if (pending.length < o.count) {
        const streams = Array.from({ length: SHARDS }, (_, s) => ({ key: shardKey(s), id: ">" }));
        const read = await o.redis.xReadGroup(o.group, o.consumer, streams, {
          COUNT: o.count - pending.length,
          BLOCK: 1000,
        });
        const batches = (read ?? []) as { name?: unknown; messages?: { id?: unknown; message?: unknown }[] }[];
        for (const batch of batches) {
          pending.push(...takeMessages(String(batch.name ?? ""), batch.messages));
        }
      }
      if (pending.length === 0) continue;
      await o.handle(pending.map((p) => p.jobId));
      for (const item of pending) {
        await o.redis.xAck(item.key, o.group, item.streamId);
      }
    } catch {
      if (o.signal.aborted) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

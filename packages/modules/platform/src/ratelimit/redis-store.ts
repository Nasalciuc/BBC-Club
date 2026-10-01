import type { Redis } from "../redis/client";
import type { GcraResult } from "./pg-store";

/** Same GCRA as memory-store.ts, one Lua script so every replica shares the counter. */
const GCRA_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local T = tonumber(ARGV[2])
local tau = tonumber(ARGV[3])
local raw = redis.call('GET', key)
local tat = tonumber(raw or now)
if tat < now then tat = now end
if tat - now > tau then
  return {0, 0, math.floor(tat - now), math.ceil(tat - tau - now)}
end
local nxt = tat + T
local ttl = math.ceil(tau + T + 1000)
redis.call('SET', key, tostring(nxt), 'PX', ttl)
return {1, math.floor((tau + T - (nxt - now)) / T), math.floor(nxt - now), 0}
`;

export async function loadGcraScript(redis: Redis): Promise<string> {
  return redis.scriptLoad(GCRA_LUA);
}

export async function redisGcraCheck(
  redis: Redis,
  sha: { current: string },
  key: string,
  limit: number,
  periodMs: number,
  burst: number,
  nowMs = Date.now(),
): Promise<GcraResult> {
  const T = periodMs / limit;
  const tau = T * (burst - 1);
  const run = async (digest: string) =>
    redis.evalSha(digest, {
      keys: [key],
      arguments: [String(nowMs), String(T), String(tau)],
    });
  let reply: unknown;
  try {
    reply = await run(sha.current);
  } catch (err) {
    if (!String(err).includes("NOSCRIPT")) throw err;
    sha.current = await loadGcraScript(redis);
    reply = await run(sha.current);
  }
  const row = Array.isArray(reply) ? reply : [];
  const allowed = Number(row[0]) === 1;
  const remaining = Number(row[1] ?? 0);
  const resetMs = Number(row[2] ?? 0);
  const retryAfterMs = Number(row[3] ?? 0);
  return allowed
    ? { allowed: true, remaining: Math.max(0, remaining), resetMs: Math.max(0, resetMs) }
    : { allowed: false, remaining: 0, resetMs: Math.max(0, resetMs), retryAfterMs: Math.max(0, retryAfterMs) };
}

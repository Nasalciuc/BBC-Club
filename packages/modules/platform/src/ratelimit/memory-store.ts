/** The same GCRA in process memory — for high-volume read routes, where a write per request is not worth it.
 *  Per replica: with N replicas a client gets at most N × the limit (acceptable for abuse protection; PR 8 moves it to
 *  Redis). Never fails, so it is fail-open by construction. Keys expire on their own (tat in the past = empty bucket). */
export function createMemoryLimiter(opts: { maxKeys?: number } = {}) {
  const tats = new Map<string, number>();
  const maxKeys = opts.maxKeys ?? 200_000;
  return {
    check(key: string, limit: number, periodMs: number, burst: number, nowMs = Date.now()) {
      const T = periodMs / limit,
        tau = T * (burst - 1);
      const tat = Math.max(tats.get(key) ?? nowMs, nowMs);
      if (tat - nowMs > tau)
        return { allowed: false, remaining: 0, resetMs: tat - nowMs, retryAfterMs: Math.ceil(tat - tau - nowMs) };
      const next = tat + T;
      if (tats.size >= maxKeys && !tats.has(key)) sweep(nowMs);
      tats.delete(key);
      tats.set(key, next); // re-insert: Map order = recency, oldest first
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor((tau + T - (next - nowMs)) / T)),
        resetMs: next - nowMs,
      };
    },
    size: () => tats.size,
  };
  function sweep(nowMs: number) {
    for (const [k, t] of tats) {
      if (t <= nowMs) tats.delete(k);
      else break;
    } // expired first (insertion order ≈ recency)
    while (tats.size >= maxKeys) {
      const oldest = tats.keys().next().value;
      if (oldest === undefined) break;
      tats.delete(oldest);
    }
  }
}

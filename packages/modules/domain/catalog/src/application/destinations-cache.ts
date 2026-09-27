import type { DestinationPin } from "../api";

/** A fare that expires mid-minute can still appear on the home map for at most `ttlMs` (default 60s).
 *  Opening that fare still answers 410. Import and expire-fares call clear(). */
export function createDestinationsCache(ttlMs = 60_000) {
  const done = new Map<string, { at: number; value: DestinationPin[] }>();
  const inflight = new Map<string, Promise<DestinationPin[]>>();
  let generation = 0;
  return {
    async get(home: string, load: () => Promise<DestinationPin[]>): Promise<DestinationPin[]> {
      const k = home.toUpperCase();
      const hit = done.get(k);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const running = inflight.get(k);
      if (running) return running;
      const gen = generation;
      const p = load()
        .then((value) => {
          if (gen === generation) done.set(k, { at: Date.now(), value });
          return value;
        })
        .finally(() => {
          if (inflight.get(k) === p) inflight.delete(k);
        });
      inflight.set(k, p);
      return p;
    },
    /** Called by the catalogue import and by expire-fares. Every cache here has an invalidation path. */
    clear(): void {
      generation += 1;
      done.clear();
      inflight.clear();
    },
  };
}

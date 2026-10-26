/** Eight numbers, no metrics stack. Counters and histograms in memory, exposed as Prometheus text at /metrics.
 *  If we ever need more, this interface is what an OTel exporter would implement. */
type Labels = Record<string, string>;
const key = (name: string, l?: Labels) =>
  l && Object.keys(l).length
    ? `${name}{${Object.entries(l)
        .sort()
        .map(([k, v]) => `${k}="${v}"`)
        .join(",")}}`
    : name;

/** Cumulative histogram edges in ms. 300 is the launch p99 target, so it is a bucket, not a gap. */
export const DURATION_BUCKETS_MS = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000, 30000];

export function createMetrics() {
  const counters = new Map<string, number>();
  const histos = new Map<string, { count: number; sum: number; buckets: Map<number, number> }>();
  const gauges = new Map<string, () => Promise<number> | number>();
  const gaugeValues = new Map<string, number>();

  return {
    inc(name: string, labels?: Labels, by = 1) {
      const k = key(name, labels);
      counters.set(k, (counters.get(k) ?? 0) + by);
    },
    observe(name: string, value: number, labels?: Labels) {
      const k = key(name, labels);
      const h = histos.get(k) ?? { count: 0, sum: 0, buckets: new Map(DURATION_BUCKETS_MS.map((b) => [b, 0])) };
      h.count++;
      h.sum += value;
      for (const b of DURATION_BUCKETS_MS) if (value <= b) h.buckets.set(b, (h.buckets.get(b) ?? 0) + 1);
      histos.set(k, h);
    },
    /** Gauges are pulled at scrape time (queue depth, oldest pending age, last job status). */
    gauge(name: string, fn: () => Promise<number> | number) {
      gauges.set(name, fn);
    },
    /** Point-in-time series (DB snapshots). Labelled keys use the same encoding as counters. */
    setGauge(name: string, value: number, labels?: Labels) {
      gaugeValues.set(key(name, labels), value);
    },
    /** Drop labelled series whose prefix matches (e.g. `db_connections`) before a refresh. */
    clearPrefix(prefix: string) {
      for (const k of [...gaugeValues.keys()]) {
        if (k === prefix || k.startsWith(`${prefix}{`)) gaugeValues.delete(k);
      }
    },
    /** Point-in-time gauges survive a scrape. clearPrefix (before each refresh) or reset() drops them. */
    async render(): Promise<string> {
      const lines: string[] = [];
      for (const [k, v] of counters) lines.push(`bbc_${k} ${v}`);
      for (const [k, h] of histos) {
        const base = k.includes("{") ? k.slice(0, k.indexOf("{")) : k;
        const labels = k.includes("{") ? k.slice(k.indexOf("{") + 1, -1) : "";
        for (const [b, c] of h.buckets) lines.push(`bbc_${base}_bucket{${labels}${labels ? "," : ""}le="${b}"} ${c}`);
        lines.push(`bbc_${base}_count{${labels}} ${h.count}`, `bbc_${base}_sum{${labels}} ${h.sum}`);
      }
      for (const [k, v] of gaugeValues) lines.push(`bbc_${k} ${v}`);
      for (const [name, fn] of gauges) {
        try {
          lines.push(`bbc_${name} ${await fn()}`);
        } catch {
          /* a broken gauge must not break /metrics */
        }
      }
      return lines.join("\n") + "\n";
    },
    reset() {
      counters.clear();
      histos.clear();
      gaugeValues.clear();
    },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;

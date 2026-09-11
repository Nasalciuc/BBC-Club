/** Eight numbers, no metrics stack. Counters and histograms in memory, exposed as Prometheus text at /metrics.
 *  If we ever need more, this interface is what an OTel exporter would implement. */
type Labels = Record<string, string>;
const key = (name: string, l?: Labels) => (l && Object.keys(l).length ? `${name}{${Object.entries(l).sort().map(([k, v]) => `${k}="${v}"`).join(",")}}` : name);

export function createMetrics() {
  const counters = new Map<string, number>();
  const histos = new Map<string, { count: number; sum: number; buckets: Map<number, number> }>();
  const BUCKETS = [5, 25, 100, 300, 1000, 5000, 30000];
  const gauges = new Map<string, () => Promise<number> | number>();

  return {
    inc(name: string, labels?: Labels, by = 1) { const k = key(name, labels); counters.set(k, (counters.get(k) ?? 0) + by); },
    observe(name: string, value: number, labels?: Labels) {
      const k = key(name, labels);
      const h = histos.get(k) ?? { count: 0, sum: 0, buckets: new Map(BUCKETS.map((b) => [b, 0])) };
      h.count++; h.sum += value;
      for (const b of BUCKETS) if (value <= b) h.buckets.set(b, (h.buckets.get(b) ?? 0) + 1);
      histos.set(k, h);
    },
    /** Gauges are pulled at scrape time (queue depth, oldest pending age, last job status). */
    gauge(name: string, fn: () => Promise<number> | number) { gauges.set(name, fn); },
    async render(): Promise<string> {
      const lines: string[] = [];
      for (const [k, v] of counters) lines.push(`bbc_${k} ${v}`);
      for (const [k, h] of histos) {
        const base = k.includes("{") ? k.slice(0, k.indexOf("{")) : k;
        const labels = k.includes("{") ? k.slice(k.indexOf("{") + 1, -1) : "";
        for (const [b, c] of h.buckets) lines.push(`bbc_${base}_bucket{${labels}${labels ? "," : ""}le="${b}"} ${c}`);
        lines.push(`bbc_${base}_count{${labels}} ${h.count}`, `bbc_${base}_sum{${labels}} ${h.sum}`);
      }
      for (const [name, fn] of gauges) { try { lines.push(`bbc_${name} ${await fn()}`); } catch { /* a broken gauge must not break /metrics */ } }
      return lines.join("\n") + "\n";
    },
    reset() { counters.clear(); histos.clear(); },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;

/** Counters, histograms and gauges in memory, exposed as Prometheus text at /metrics, which VictoriaMetrics scrapes on
 *  the box (ADR-IMPL-073). If we ever need more, this interface is what an OTel exporter would implement.
 *  The text is what a scraper reads without guessing: each family once, its `# TYPE` line before its samples; every
 *  histogram ends with its `+Inf` bucket; label values escaped. */
type Labels = Record<string, string>;
type Family = "counter" | "gauge" | "histogram";

/** A label value as the text format writes it: backslash, double quote and line feed escaped. */
const escapeValue = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const key = (name: string, l?: Labels) =>
  l && Object.keys(l).length
    ? `${name}{${Object.entries(l)
        .sort()
        .map(([k, v]) => `${k}="${escapeValue(v)}"`)
        .join(",")}}`
    : name;
const familyOf = (k: string) => (k.includes("{") ? k.slice(0, k.indexOf("{")) : k);

/** Cumulative histogram edges in ms. 300 is the launch p99 target, so it is a bucket, not a gap. */
export const DURATION_BUCKETS_MS = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000, 30000];

export function createMetrics() {
  const counters = new Map<string, number>();
  const histos = new Map<string, { count: number; sum: number; buckets: Map<number, number> }>();
  const gauges = new Map<string, { fn: () => Promise<number> | number; type: Family }>();
  const gaugeValues = new Map<string, number>();
  /** Totals another system keeps (Postgres, PgBouncer): set as read, rendered as counters. */
  const counterValues = new Map<string, number>();

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
    /** Gauges are pulled at scrape time (queue depth, oldest pending age, last job status). `type` "counter" for a
     *  total read at scrape time (the process's CPU seconds). */
    gauge(name: string, fn: () => Promise<number> | number, type: "gauge" | "counter" = "gauge") {
      gauges.set(name, { fn, type });
    },
    /** Point-in-time series (DB snapshots). Labelled keys use the same encoding as counters. */
    setGauge(name: string, value: number, labels?: Labels) {
      gaugeValues.set(key(name, labels), value);
    },
    /** A total as another system counts it (pg_stat_statements, PgBouncer SHOW STATS), set each time it is read. It
     *  falls back to zero when that system resets it, which a rate over it reads as a counter reset. */
    setCounter(name: string, value: number, labels?: Labels) {
      counterValues.set(key(name, labels), value);
    },
    /** Drop labelled series whose prefix matches (e.g. `db_connections`) before a refresh. */
    clearPrefix(prefix: string) {
      for (const map of [gaugeValues, counterValues]) {
        for (const k of [...map.keys()]) {
          if (k === prefix || k.startsWith(`${prefix}{`)) map.delete(k);
        }
      }
    },
    /** Point-in-time gauges survive a scrape. clearPrefix (before each refresh) or reset() drops them. */
    async render(): Promise<string> {
      const families = new Map<string, { type: Family; lines: string[] }>();
      const add = (family: string, type: Family, line: string) => {
        const f = families.get(family) ?? { type, lines: [] };
        f.lines.push(line);
        families.set(family, f);
      };
      for (const [k, v] of counters) add(familyOf(k), "counter", `bbc_${k} ${v}`);
      for (const [k, v] of counterValues) add(familyOf(k), "counter", `bbc_${k} ${v}`);
      for (const [k, h] of histos) {
        const base = familyOf(k);
        const labels = k.includes("{") ? k.slice(k.indexOf("{") + 1, -1) : "";
        const sep = labels ? "," : "";
        for (const [b, c] of h.buckets) add(base, "histogram", `bbc_${base}_bucket{${labels}${sep}le="${b}"} ${c}`);
        add(base, "histogram", `bbc_${base}_bucket{${labels}${sep}le="+Inf"} ${h.count}`);
        const own = labels ? `{${labels}}` : "";
        add(base, "histogram", `bbc_${base}_count${own} ${h.count}`);
        add(base, "histogram", `bbc_${base}_sum${own} ${h.sum}`);
      }
      for (const [k, v] of gaugeValues) add(familyOf(k), "gauge", `bbc_${k} ${v}`);
      for (const [name, g] of gauges) {
        try {
          add(name, g.type, `bbc_${name} ${await g.fn()}`);
        } catch {
          /* a broken gauge must not break /metrics */
        }
      }
      const lines: string[] = [];
      for (const [family, f] of families) lines.push(`# TYPE bbc_${family} ${f.type}`, ...f.lines);
      return lines.join("\n") + "\n";
    },
    reset() {
      counters.clear();
      histos.clear();
      gaugeValues.clear();
      counterValues.clear();
    },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;

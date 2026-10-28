import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Metrics } from "./metrics";

/** How long the delay figures are kept once read: the families of one scrape read the same window. */
const WINDOW_MS = 1_000;

/**
 * One sampler for the process: the event loop is the process's, whichever platform reads it — and Bun keeps a single
 * delay histogram anyway, so disabling it for one reader would disable it for all. Started by the first registration,
 * never stopped: its timer does not keep a process alive.
 */
let sampler: ReturnType<typeof monitorEventLoopDelay> | null = null;
let read = { at: 0, p50: 0, p99: 0, max: 0 };

/** When the process started, once: every platform reports the same second, never one past the true start. */
const PROCESS_START_SECONDS = Math.floor(Date.now() / 1000 - process.uptime());

function delayWindow() {
  if (sampler && Date.now() - read.at > WINDOW_MS) {
    const seconds = (ns: number) => (Number.isFinite(ns) ? ns / 1e9 : 0);
    read = {
      at: Date.now(),
      p50: seconds(sampler.percentile(50)),
      p99: seconds(sampler.percentile(99)),
      max: seconds(sampler.max),
    };
    sampler.reset();
  }
  return read;
}

/**
 * The process's own numbers on /metrics (ADR-IMPL-073): CPU seconds, memory, and how late the event loop runs — the
 * first sign that a replica has more work than its core. `performance.eventLoopUtilization()` reads 0 on Bun 1.3, so the
 * delay histogram it is: the p50, p99 and worst delay since the previous scrape, after which it starts again.
 */
export function registerProcessMetrics(metrics: Metrics) {
  if (!sampler) {
    sampler = monitorEventLoopDelay({ resolution: 20 });
    sampler.enable();
  }
  metrics.gauge(
    "process_cpu_seconds_total",
    () => {
      const used = process.cpuUsage();
      return (used.user + used.system) / 1e6;
    },
    "counter",
  );
  metrics.gauge("process_resident_memory_bytes", () => process.memoryUsage().rss);
  metrics.gauge("process_heap_used_bytes", () => process.memoryUsage().heapUsed);
  metrics.gauge("process_start_time_seconds", () => PROCESS_START_SECONDS);
  metrics.gauge("event_loop_delay_p50_seconds", () => delayWindow().p50);
  metrics.gauge("event_loop_delay_p99_seconds", () => delayWindow().p99);
  metrics.gauge("event_loop_delay_max_seconds", () => delayWindow().max);
}

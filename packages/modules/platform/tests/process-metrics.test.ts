/** The process's own numbers on /metrics (ADR-IMPL-073): what tells that a replica has more work than its core. */
import { describe, expect, it } from "bun:test";
import { createMetrics } from "../src/telemetry/metrics";
import { registerProcessMetrics } from "../src/telemetry/process";

/** The delay figures are kept a second once read (process.ts, WINDOW_MS) by the process's one sampler, whichever test
 *  read them last: waiting past it makes the next render start a window, so renders right after it read that one. */
const freshWindow = () => new Promise((r) => setTimeout(r, 1_050));

function value(text: string, name: string): number {
  const line = text.split("\n").find((l) => l.startsWith(`${name} `));
  return Number(line?.split(" ").at(-1));
}

describe("process metrics", () => {
  it("CPU seconds are a counter that grows; memory and the event loop's delay are gauges", async () => {
    const m = createMetrics();
    registerProcessMetrics(m);
    const first = await m.render();
    expect(first).toContain("# TYPE bbc_process_cpu_seconds_total counter");
    for (const g of [
      "process_resident_memory_bytes",
      "process_heap_used_bytes",
      "process_start_time_seconds",
      "event_loop_delay_p50_seconds",
      "event_loop_delay_p99_seconds",
      "event_loop_delay_max_seconds",
    ]) {
      expect(first).toContain(`# TYPE bbc_${g} gauge`);
      expect(value(first, `bbc_${g}`)).toBeGreaterThanOrEqual(0);
    }
    expect(value(first, "bbc_process_resident_memory_bytes")).toBeGreaterThan(0);
    // The process's start, not the registration's: a second platform in the same process reports the same one.
    expect(value(first, "bbc_process_start_time_seconds")).toBeLessThanOrEqual(Date.now() / 1000);
    const until = Date.now() + 30;
    while (Date.now() < until) Math.sqrt(Math.random());
    const second = await m.render();
    expect(value(second, "bbc_process_cpu_seconds_total")).toBeGreaterThan(
      value(first, "bbc_process_cpu_seconds_total"),
    );
  });

  it("the families of one scrape read one window of the delay, then it starts again", async () => {
    const m = createMetrics();
    registerProcessMetrics(m);
    await freshWindow();
    const text = await m.render();
    const again = await m.render();
    const p50 = value(text, "bbc_event_loop_delay_p50_seconds");
    const p99 = value(text, "bbc_event_loop_delay_p99_seconds");
    expect(p50).toBeLessThanOrEqual(p99);
    // Within the second the window is kept: a scrape that reads the families one by one sees one histogram.
    expect(value(again, "bbc_event_loop_delay_p99_seconds")).toBe(p99);
    expect(value(again, "bbc_event_loop_delay_max_seconds")).toBe(value(text, "bbc_event_loop_delay_max_seconds"));
  });

  it("two platforms in one process read one sampler: the event loop is the process's", async () => {
    const a = createMetrics();
    const b = createMetrics();
    registerProcessMetrics(a);
    registerProcessMetrics(b);
    await freshWindow();
    const fromA = await a.render();
    const fromB = await b.render();
    for (const g of ["event_loop_delay_p99_seconds", "process_start_time_seconds"]) {
      expect(value(fromB, `bbc_${g}`)).toBe(value(fromA, `bbc_${g}`));
    }
  });
});

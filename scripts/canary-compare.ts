/**
 * Compare one new API replica's /metrics with one old replica's over the same window.
 * Exit 0 when the canary may proceed; exit 1 with the reason on stdout when it must roll back.
 *
 *   bun scripts/canary-compare.ts canary.txt old.txt [old-at-start.txt]
 *
 * Members' requests only: the probes (/health every 10 s from Docker, /metrics from the scraper, /ready, /status) are
 * left out — on a quiet box they were nearly all of the canary's traffic and all of the old replica's, which made one
 * 11-ms request look like a regression (30 Oct 2026: production rolled back on "p99 25 ms vs 5 ms"). The old replica's
 * counters run from its start, so `old-at-start.txt`, read when the canary starts, is subtracted: both sides then cover
 * the same window. Latency fails a canary only when it is worse by two buckets AND over LATENCY_FLOOR_MS — the launch
 * p99 target (metrics.ts): a few milliseconds slower is not a regression.
 */
import { readFileSync } from "node:fs";
import { DURATION_BUCKETS_MS } from "@bbc/platform";

const MIN_REQUESTS = 50;
/** The launch p99 target (packages/modules/platform/src/telemetry/metrics.ts): below it, latency never fails a canary. */
export const LATENCY_FLOOR_MS = 300;
/** Probes and scrapes, not members: never judged. */
export const PROBE_ROUTES: ReadonlySet<string> = new Set(["/health", "/ready", "/status", "/metrics"]);

export type CanaryVerdict = { ok: boolean; reason: string };

type Traffic = { total: number; fivexx: number; byLe: Map<number, number> };

function samples(text: string, metric: string): { labels: Record<string, string>; value: number }[] {
  const out: { labels: Record<string, string>; value: number }[] = [];
  const re = new RegExp(`^bbc_${metric}(?:\\{([^}]*)\\})?\\s+(\\S+)\\s*$`, "gm");
  for (const m of text.matchAll(re)) {
    const labels: Record<string, string> = {};
    for (const lm of (m[1] ?? "").matchAll(/(\w+)="([^"]*)"/g)) {
      const name = lm[1];
      const value = lm[2];
      if (name) labels[name] = value ?? "";
    }
    out.push({ labels, value: Number(m[2]) });
  }
  return out;
}

const isProbe = (labels: Record<string, string>) => PROBE_ROUTES.has(labels.route ?? "");

function traffic(text: string): Traffic {
  let total = 0;
  let fivexx = 0;
  for (const s of samples(text, "http_requests")) {
    if (isProbe(s.labels)) continue;
    total += s.value;
    if (Number(s.labels.status ?? "0") >= 500) fivexx += s.value;
  }
  const byLe = new Map<number, number>();
  for (const s of samples(text, "http_duration_ms_bucket")) {
    if (isProbe(s.labels)) continue;
    const le = Number(s.labels.le);
    if (!Number.isFinite(le)) continue;
    byLe.set(le, (byLe.get(le) ?? 0) + s.value);
  }
  return { total, fivexx, byLe };
}

/** When the process started (`bbc_process_start_time_seconds`), or null where a read does not carry it. */
function startedAt(text: string): number | null {
  const v = samples(text, "process_start_time_seconds")[0]?.value;
  return v === undefined || !Number.isFinite(v) ? null : v;
}

/** What the old replica served between two reads of its counters. A restart in between — its start time changed, or,
 *  where a read has no start time, a count went down — means its counters started again, so the later read alone is
 *  the window: subtracting would mix two lives (a restart that served more than before reads as a window otherwise). */
function since(endText: string, startText: string): Traffic {
  const end = traffic(endText);
  const start = traffic(startText);
  const byLe = new Map<number, number>();
  for (const [le, n] of end.byLe) byLe.set(le, n - (start.byLe.get(le) ?? 0));
  const endStart = startedAt(endText);
  const startStart = startedAt(startText);
  const restarted =
    (endStart !== null && startStart !== null && endStart !== startStart) ||
    end.total < start.total ||
    end.fivexx < start.fivexx ||
    [...byLe.values()].some((n) => n < 0);
  if (restarted) return end;
  return { total: end.total - start.total, fivexx: end.fivexx - start.fivexx, byLe };
}

/** Smallest bucket index whose cumulative count covers 99% of observations. */
export function p99Index(byLe: Map<number, number>): number | null {
  const top = DURATION_BUCKETS_MS.at(-1);
  if (top == null) return null;
  const count = byLe.get(top) ?? 0;
  if (count <= 0) return null;
  for (let i = 0; i < DURATION_BUCKETS_MS.length; i++) {
    const le = DURATION_BUCKETS_MS[i];
    if (le != null && (byLe.get(le) ?? 0) / count >= 0.99) return i;
  }
  return DURATION_BUCKETS_MS.length - 1;
}

export function compareMetrics(canaryText: string, oldText: string, oldAtStartText?: string): CanaryVerdict {
  const canary = traffic(canaryText);
  const old = oldAtStartText === undefined ? traffic(oldText) : since(oldText, oldAtStartText);
  if (canary.total < MIN_REQUESTS) {
    if (canary.fivexx > 0) {
      return {
        ok: false,
        reason: `canary served ${canary.total} requests (< ${MIN_REQUESTS}) with ${canary.fivexx} 5xx`,
      };
    }
    return {
      ok: true,
      reason: `canary served ${canary.total} requests (< ${MIN_REQUESTS}); judged on /ready and zero 5xx only`,
    };
  }
  const canaryRatio = canary.fivexx / canary.total;
  const oldRatio = old.total > 0 ? old.fivexx / old.total : 0;
  const limit = Math.max(0.01, 2 * oldRatio);
  if (canaryRatio > limit) {
    return {
      ok: false,
      reason: `canary 5xx ratio ${canaryRatio.toFixed(4)} exceeds max(1%, 2× old ${oldRatio.toFixed(4)})`,
    };
  }
  if (old.total === 0) {
    return {
      ok: true,
      reason: `canary ok: 5xx ${canaryRatio.toFixed(4)} (limit ${limit.toFixed(4)}); old replica served 0 requests; latency compare skipped`,
    };
  }
  const canaryP99 = p99Index(canary.byLe);
  const oldP99 = p99Index(old.byLe);
  if (canaryP99 == null || oldP99 == null) {
    return {
      ok: true,
      reason: `canary ok: 5xx ${canaryRatio.toFixed(4)} (limit ${limit.toFixed(4)}); latency compare skipped`,
    };
  }
  const canaryMs = DURATION_BUCKETS_MS[canaryP99] ?? Number.POSITIVE_INFINITY;
  if (canaryP99 >= oldP99 + 2 && canaryMs > LATENCY_FLOOR_MS) {
    return {
      ok: false,
      reason: `canary p99 bucket ${DURATION_BUCKETS_MS[canaryP99]} is two or more above old ${DURATION_BUCKETS_MS[oldP99]} and over ${LATENCY_FLOOR_MS} ms`,
    };
  }
  return {
    ok: true,
    reason: `canary ok: 5xx ${canaryRatio.toFixed(4)} (limit ${limit.toFixed(4)}), p99 le=${DURATION_BUCKETS_MS[canaryP99]} vs old le=${DURATION_BUCKETS_MS[oldP99]}`,
  };
}

if (import.meta.main) {
  const canaryPath = process.argv[2];
  const oldPath = process.argv[3];
  const oldStartPath = process.argv[4];
  if (!canaryPath || !oldPath) {
    console.error("usage: canary-compare.ts <canary-metrics> <old-metrics> [old-metrics-at-canary-start]");
    process.exit(2);
  }
  const verdict = compareMetrics(
    readFileSync(canaryPath, "utf8"),
    readFileSync(oldPath, "utf8"),
    oldStartPath ? readFileSync(oldStartPath, "utf8") : undefined,
  );
  console.log(verdict.reason);
  process.exit(verdict.ok ? 0 : 1);
}

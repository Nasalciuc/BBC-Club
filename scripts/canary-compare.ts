/**
 * Compare one new API replica's /metrics with one old replica's over the same window.
 * Exit 0 when the canary may proceed; exit 1 with the reason on stdout when it must roll back.
 *
 *   bun scripts/canary-compare.ts canary.txt old.txt
 */
import { readFileSync } from "node:fs";
import { DURATION_BUCKETS_MS } from "@bbc/platform";

const MIN_REQUESTS = 50;

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

function traffic(text: string): Traffic {
  let total = 0;
  let fivexx = 0;
  for (const s of samples(text, "http_requests")) {
    total += s.value;
    if (Number(s.labels.status ?? "0") >= 500) fivexx += s.value;
  }
  const byLe = new Map<number, number>();
  for (const s of samples(text, "http_duration_ms_bucket")) {
    const le = Number(s.labels.le);
    if (!Number.isFinite(le)) continue;
    byLe.set(le, (byLe.get(le) ?? 0) + s.value);
  }
  return { total, fivexx, byLe };
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

export function compareMetrics(canaryText: string, oldText: string): CanaryVerdict {
  const canary = traffic(canaryText);
  const old = traffic(oldText);
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
  if (canaryP99 >= oldP99 + 2) {
    return {
      ok: false,
      reason: `canary p99 bucket ${DURATION_BUCKETS_MS[canaryP99]} is two or more above old ${DURATION_BUCKETS_MS[oldP99]}`,
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
  if (!canaryPath || !oldPath) {
    console.error("usage: canary-compare.ts <canary-metrics> <old-metrics>");
    process.exit(2);
  }
  const verdict = compareMetrics(readFileSync(canaryPath, "utf8"), readFileSync(oldPath, "utf8"));
  console.log(verdict.reason);
  process.exit(verdict.ok ? 0 : 1);
}

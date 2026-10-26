import { errorForLog, type Executor } from "@bbc/db";
import type { FlagValue } from "../flags";
import type { Redis } from "../redis/client";
import { createMemoryLimiter } from "./memory-store";
import { gcraCheck } from "./pg-store";
import { loadGcraScript, redisGcraCheck } from "./redis-store";
import { RULES, type RateRule, type RuleName } from "./rules";

export type RateCheck = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
  limit: number;
};

/** A rule as it applies now (`rule()`): what `check` counts by without reading anything first. */
export type ResolvedRule = RateRule & { readonly name: RuleName };

export class RateLimitUnavailable extends Error {
  constructor(rule: string) {
    super(`rate limit store unavailable: ${rule}`);
    this.name = "RateLimitUnavailable";
  }
}

type FlagReader = { read(key: string): Promise<FlagValue | null> };
type Metrics = { inc(name: string, labels?: Record<string, string>): void };
type Logger = { warn(o: object, m?: string): void };

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Defaults in code. A cached flag row `ratelimit.<rule>` may override limit, periodMs, burst. */
export function createRateLimiter(deps: {
  db: Executor;
  flags: FlagReader;
  metrics?: Metrics;
  logger?: Logger;
  redis?: Redis | null;
}) {
  const memory = createMemoryLimiter();
  const sha = { current: "" };
  let loading: Promise<string> | null = null;

  async function redisCheck(key: string, spec: RateRule) {
    const redis = deps.redis;
    if (!redis) return memory.check(key, spec.limit, spec.periodMs, spec.burst);
    try {
      if (!sha.current) {
        loading ??= loadGcraScript(redis).finally(() => {
          loading = null;
        });
        sha.current = await loading;
      }
      return await redisGcraCheck(redis, sha, key, spec.limit, spec.periodMs, spec.burst);
    } catch (err) {
      deps.logger?.warn({ rule: key, err: errorForLog(err) }, "redis rate limit fell back to memory");
      return memory.check(key, spec.limit, spec.periodMs, spec.burst);
    }
  }

  /** The rule as it applies now: its defaults in code, or the cached flag row `ratelimit.<rule>` that overrides them. The
   *  flag is read on a pooled connection (cached 30 s, or 5 s behind Redis). */
  async function rule(name: RuleName): Promise<ResolvedRule> {
    const base = RULES[name];
    const flag = await deps.flags.read(`ratelimit.${name}`);
    if (!flag) return { ...base, name };
    return {
      ...base,
      name,
      limit: num(flag.limit, base.limit),
      periodMs: num(flag.periodMs, base.periodMs),
      burst: num(flag.burst, base.burst),
    };
  }

  /** By name, the rule is resolved first. With `exec` — a transaction the caller holds — a postgres rule is counted on its
   *  connection, so a caller that must count inside its own transaction (requests.submit, under its idempotency lock)
   *  spends a unit only if that transaction commits; the other stores ignore it. Such a caller passes the rule it
   *  resolved with `rule()` before it opened the transaction: resolved inside it, on a cold cache, the flag read waits for
   *  a second pooled connection while the transaction holds one, and with as many callers as connections every one of
   *  them waits for ever (ADR-IMPL-071). A name with `exec` is refused. */
  function check(rule: RuleName, subject: string): Promise<RateCheck>;
  function check(rule: ResolvedRule, subject: string, exec?: Executor): Promise<RateCheck>;
  async function check(given: RuleName | ResolvedRule, subject: string, exec?: Executor): Promise<RateCheck> {
    if (typeof given === "string" && exec) {
      throw new Error(`rate rule ${given}: resolve it with rule() before the transaction (ADR-IMPL-071)`);
    }
    const spec = typeof given === "string" ? await rule(given) : given;
    const name = spec.name;
    const key = `${name}:${subject}`;
    try {
      const result =
        spec.store === "memory"
          ? memory.check(key, spec.limit, spec.periodMs, spec.burst)
          : spec.store === "redis"
            ? await redisCheck(key, spec)
            : await gcraCheck(exec ?? deps.db, key, spec.limit, spec.periodMs, spec.burst);
      if (!result.allowed) deps.metrics?.inc("rate_limited_total", { rule: name });
      return { ...result, limit: spec.limit };
    } catch (err) {
      if (spec.fail === "closed") {
        deps.logger?.warn({ rule: name, err: errorForLog(err) }, "rate limit fail-closed");
        throw new RateLimitUnavailable(name);
      }
      throw err;
    }
  }

  return { rule, check };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export { RULES, type RuleName, type RateRule } from "./rules";
export { rateLimit, subjectOf } from "./middleware";

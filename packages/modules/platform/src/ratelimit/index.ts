import type { Executor } from "@bbc/db";
import type { FlagValue } from "../flags";
import { createMemoryLimiter } from "./memory-store";
import { gcraCheck } from "./pg-store";
import { RULES, type RateRule, type RuleName } from "./rules";

export type RateCheck = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  retryAfterMs?: number;
  limit: number;
};

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
export function createRateLimiter(deps: { db: Executor; flags: FlagReader; metrics?: Metrics; logger?: Logger }) {
  const memory = createMemoryLimiter();

  async function ruleOf(name: RuleName): Promise<RateRule> {
    const base = RULES[name];
    const flag = await deps.flags.read(`ratelimit.${name}`);
    if (!flag) return base;
    return {
      ...base,
      limit: num(flag.limit, base.limit),
      periodMs: num(flag.periodMs, base.periodMs),
      burst: num(flag.burst, base.burst),
    };
  }

  return {
    async check(rule: RuleName, subject: string): Promise<RateCheck> {
      const spec = await ruleOf(rule);
      const key = `${rule}:${subject}`;
      try {
        const result =
          spec.store === "memory"
            ? memory.check(key, spec.limit, spec.periodMs, spec.burst)
            : await gcraCheck(deps.db, key, spec.limit, spec.periodMs, spec.burst);
        if (!result.allowed) deps.metrics?.inc("rate_limited_total", { rule });
        return { ...result, limit: spec.limit };
      } catch (err) {
        if (spec.fail === "closed") {
          deps.logger?.warn({ rule, err: err instanceof Error ? err.message : String(err) }, "rate limit fail-closed");
          throw new RateLimitUnavailable(rule);
        }
        throw err;
      }
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export { RULES, type RuleName, type RateRule } from "./rules";
export { rateLimit, subjectOf } from "./middleware";

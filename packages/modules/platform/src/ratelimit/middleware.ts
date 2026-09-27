import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { apiError } from "@bbc/shared/errors";
import type { Principal } from "@bbc/shared/authz/principal";
import type { RateLimiter, RuleName } from "./index";

/** The subject a limit counts: the member when signed in, otherwise the client IP (resolved once, PR 1). */
export function subjectOf(c: { get(k: "principal"): Principal; get(k: "clientIp"): string | null }): string {
  const p = c.get("principal");
  if (p.kind === "member" && p.memberId) return `m:${p.memberId}`;
  return `ip:${c.get("clientIp") ?? "unknown"}`;
}

export const rateLimit =
  (
    limiter: RateLimiter,
    rule: RuleName,
    subject: (c: { get(k: "principal"): Principal; get(k: "clientIp"): string | null }) => string = subjectOf,
  ): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    let r;
    try {
      r = await limiter.check(rule, subject(c));
    } catch {
      return c.json(apiError("SERVICE_DISABLED"), 503);
    }
    c.header("RateLimit-Limit", String(r.limit));
    c.header("RateLimit-Remaining", String(r.remaining));
    c.header("RateLimit-Reset", String(Math.ceil(r.resetMs / 1000)));
    if (!r.allowed) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((r.retryAfterMs ?? r.resetMs) / 1000))));
      return c.json(apiError("RATE_LIMITED"), 429);
    }
    await next();
  };

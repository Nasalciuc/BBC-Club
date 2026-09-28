import type { MiddlewareHandler } from "hono";
import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { CLOUDFLARE_RANGES } from "@bbc/shared/net/cloudflare-ranges";

/** The client IP exactly as Better Auth resolves it — every limit and log in the app uses this, nothing else. */
export function resolveClientIp(headers: Headers, extraTrusted: string[] = []): string | null {
  const xff = headers.get("x-forwarded-for");
  return xff ? getIPFromHeader(xff, { trustedProxies: [...CLOUDFLARE_RANGES, ...extraTrusted] }) : null;
}

export const clientIp =
  (extraTrusted: string[] = []): MiddlewareHandler =>
  async (c, next) => {
    c.set("clientIp", resolveClientIp(c.req.raw.headers, extraTrusted));
    await next();
  };

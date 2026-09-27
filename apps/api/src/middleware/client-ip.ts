import type { MiddlewareHandler } from "hono";
import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { CLOUDFLARE_RANGES } from "@bbc/shared/net/cloudflare-ranges";

const trustedProxies = [...CLOUDFLARE_RANGES];

/** The client IP exactly as Better Auth resolves it — every limit and log in the app uses this, nothing else. */
export function resolveClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  return xff ? getIPFromHeader(xff, { trustedProxies }) : null;
}

export const clientIp = (): MiddlewareHandler => async (c, next) => {
  c.set("clientIp", resolveClientIp(c.req.raw.headers));
  await next();
};

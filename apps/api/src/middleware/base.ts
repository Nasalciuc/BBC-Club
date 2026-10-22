import type { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { timing } from "hono/timing";
import { apiError } from "@bbc/shared/errors";

const KB = 1024;
/** A catalogue import of a few thousand fares; member bodies never come near their own limit. */
export const INTERNAL_BODY_LIMIT = 1024 * KB;
export const MEMBER_BODY_LIMIT = 256 * KB;

/** Over the limit: the API's own shape and a 413, never Hono's bare HTTPException (which the error contract would turn
 *  into 500 INTERNAL). No new error code: the app reads VALIDATION. Counted in http_errors as the error contract counts
 *  every other client error; the request metrics below never see it. */
const tooLarge = (metrics: { inc(n: string, l?: Record<string, string>): void }) => (c: Context) => {
  metrics.inc("http_errors", { code: "VALIDATION" });
  return c.json(
    apiError("VALIDATION", { message: "This request is too large.", requestId: c.get("requestId") as string }),
    413,
  );
};

/** Order is a security property: id → headers → cors(auth only) → body limit → (principal, added by the host). */
export function installBaseMiddleware(
  app: Hono<any>,
  opts: {
    /** Same list as Better Auth trustedOrigins — build with authOrigins(env). */
    origins: string[];
    metrics: {
      inc(n: string, l?: Record<string, string>): void;
      observe(n: string, v: number, l?: Record<string, string>): void;
    };
  },
) {
  app.use("*", requestId());
  app.use("*", secureHeaders());
  app.use("*", timing());
  app.use(
    "/api/auth/*",
    cors({
      origin: opts.origins,
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      credentials: true,
    }),
  );
  // One limit per request: /v1/* also matches /v1/internal/*, so the member limit skips the internal paths.
  const onError = tooLarge(opts.metrics);
  const internalLimit = bodyLimit({ maxSize: INTERNAL_BODY_LIMIT, onError });
  const memberLimit = bodyLimit({ maxSize: MEMBER_BODY_LIMIT, onError });
  app.use("/v1/internal/*", internalLimit);
  app.use("/v1/*", (c, next) => (c.req.path.startsWith("/v1/internal/") ? next() : memberLimit(c, next)));
  // RED metrics: one line per request, labels bounded (route template, not raw path)
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    const route = c.req.routePath || c.req.path.replace(/[0-9a-f-]{36}/g, ":id");
    opts.metrics.inc("http_requests", { route, status: String(c.res.status) });
    opts.metrics.observe("http_duration_ms", Date.now() - started, { route });
  });
}

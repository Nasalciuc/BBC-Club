import type { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { timing } from "hono/timing";

/** Order is a security property: id → headers → cors(auth only) → body limit → (principal, added by the host). */
export function installBaseMiddleware(
  app: Hono<any>,
  opts: {
    appOrigin: string;
    mobileScheme: string;
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
      origin: [opts.appOrigin, `${opts.mobileScheme}://`],
      allowHeaders: ["Content-Type", "Authorization", "Cookie"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      credentials: true,
    }),
  );
  app.use("/v1/internal/*", bodyLimit({ maxSize: 1024 * 1024 }));
  app.use("/v1/*", bodyLimit({ maxSize: 256 * 1024 }));
  // RED metrics: one line per request, labels bounded (route template, not raw path)
  app.use("*", async (c, next) => {
    const started = Date.now();
    await next();
    const route = c.req.routePath || c.req.path.replace(/[0-9a-f-]{36}/g, ":id");
    opts.metrics.inc("http_requests", { route, status: String(c.res.status) });
    opts.metrics.observe("http_duration_ms", Date.now() - started, { route });
  });
}

import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { DomainError, apiError, HTTP_STATUS, type ErrorCode } from "@bbc/shared/errors";
import { RateLimitUnavailable } from "@bbc/platform/ratelimit";
import { errorForLog } from "@bbc/db";

type Logger = { error: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
type Metrics = { inc(n: string, l?: Record<string, string>): void };

/** The code a client-side status (< 500) carries in our shape. */
function codeOf(status: number): ErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMITED";
  return "VALIDATION";
}

/** One shape for every error. Three sources, three behaviours; unexpected errors never leak their message. */
export function errorContract(logger: Logger, metrics?: Metrics): ErrorHandler<any> {
  return (err, c) => {
    const requestId = c.get("requestId") as string | undefined;

    if (err instanceof DomainError) {
      metrics?.inc("http_errors", { code: err.code });
      const status = HTTP_STATUS[err.code];
      if (err.code === "RATE_LIMITED") c.header("Retry-After", "30");
      return c.json(apiError(err.code, { message: err.message, requestId, details: err.details }), status as any);
    }
    if (err instanceof RateLimitUnavailable) {
      metrics?.inc("http_errors", { code: "SERVICE_DISABLED" });
      return c.json(apiError("SERVICE_DISABLED", { requestId }), 503);
    }
    if (err instanceof ZodError) {
      metrics?.inc("http_errors", { code: "VALIDATION" });
      return c.json(
        apiError("VALIDATION", {
          requestId,
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        }),
        400,
      );
    }
    // Hono's own client errors (a body over its limit → 413): keep the status, use our shape, never "unhandled". Its
    // message is Hono's text, not the club's voice, so the code's default message stands in for it.
    if (err instanceof HTTPException && err.status < 500) {
      const code = codeOf(err.status);
      metrics?.inc("http_errors", { code });
      if (err.status === 429) c.header("Retry-After", "30");
      return c.json(
        apiError(code, { requestId, message: err.status === 413 ? "This request is too large." : undefined }),
        err.status,
      );
    }
    // Better Auth surfaces APIError with a status; keep its status, use our shape.
    const anyErr = err as any;
    if (typeof anyErr?.status === "number" && anyErr.status < 500 && anyErr.body?.code) {
      const code = codeOf(anyErr.status);
      metrics?.inc("http_errors", { code });
      return c.json(apiError(code, { requestId, message: anyErr.body.message }), anyErr.status);
    }
    metrics?.inc("http_errors", { code: "INTERNAL" });
    // Never the error itself: a failed query's message holds its parameters (tokens, emails) — AGENTS.md rule 6.
    logger.error({ requestId, path: c.req.path, err: errorForLog(err) }, "unhandled");
    return c.json(apiError("INTERNAL", { requestId }), 500); // generic message; detail only in logs
  };
}

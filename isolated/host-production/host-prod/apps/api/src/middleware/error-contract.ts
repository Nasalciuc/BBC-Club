import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import { DomainError, apiError, HTTP_STATUS, type ErrorCode } from "@bbc/shared/errors";

type Logger = { error: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
type Metrics = { inc(n: string, l?: Record<string, string>): void };

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
    // Better Auth surfaces APIError with a status; keep its status, use our shape.
    const anyErr = err as any;
    if (typeof anyErr?.status === "number" && anyErr.status < 500 && anyErr.body?.code) {
      const code: ErrorCode =
        anyErr.status === 401
          ? "UNAUTHORIZED"
          : anyErr.status === 403
            ? "FORBIDDEN"
            : anyErr.status === 429
              ? "RATE_LIMITED"
              : "VALIDATION";
      metrics?.inc("http_errors", { code });
      return c.json(apiError(code, { requestId, message: anyErr.body.message }), anyErr.status);
    }
    metrics?.inc("http_errors", { code: "INTERNAL" });
    logger.error({ requestId, path: c.req.path, err: String(anyErr?.stack ?? err) }, "unhandled");
    return c.json(apiError("INTERNAL", { requestId }), 500); // generic message; detail only in logs
  };
}

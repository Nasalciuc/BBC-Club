import type { MiddlewareHandler } from "hono";
import { roleHas, type Permission } from "@bbc/shared/authz/permissions";
import { roleOf } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";

/** Alias of AppEnv — existing middleware and the host keep compiling. */
export type PrincipalVars = AppEnv;

/** Every protected route registers here at mount time; the inventory test asserts every /v1 route is present. */
export const routeRegistry = new Map<string, Permission | "public">();
/** Rule name passed to rateLimit() for that same route. Absent means the route is not limited. */
export const rateRuleRegistry = new Map<string, string>();
export function registerRoute(method: string, path: string, permission: Permission | "public", rate?: string) {
  const key = `${method.toUpperCase()} ${path}`;
  routeRegistry.set(key, permission);
  if (rate) rateRuleRegistry.set(key, rate);
}

type Flags = {
  isKilled(module: string): Promise<boolean>;
  /** "unknown" (flags that cannot be trusted) answers OVERLOADED, not SERVICE_DISABLED (ADR-IMPL-080). */
  killedState?(module: string): Promise<"killed" | "live" | "unknown">;
};

export const err = (code: string, message = MESSAGES[code]) => ({ error: { code, message } });
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Please sign in.",
  FORBIDDEN: "Not allowed.",
  NOT_FOUND: "Not found.",
  SERVICE_DISABLED: "This feature is temporarily unavailable.",
  OVERLOADED: "The club is busy for a moment. Please try again shortly.",
};

/** Route-level authorization. Resource-level ownership lives in the repositories (WHERE member_id = actor).
 *  `module`/`modules`: the route answers 503 SERVICE_DISABLED while any of them is killed (the route gate passes the
 *  owner and the modules the route reads, ADR-IMPL-075), and 503 OVERLOADED with Retry-After while this process cannot
 *  trust its flags (ADR-IMPL-080). */
export function authorize(
  permission: Permission,
  opts: { module?: string; modules?: readonly string[]; flags?: Flags; log?: (o: object, m: string) => void } = {},
): MiddlewareHandler<PrincipalVars> {
  const modules = [...(opts.module ? [opts.module] : []), ...(opts.modules ?? [])];
  return async (c, next) => {
    const p = c.get("principal");
    const role = roleOf(p);
    if (!role) return c.json(err("UNAUTHORIZED"), 401);
    if (!roleHas(role, permission)) {
      opts.log?.({ requestId: c.get("requestId"), role, permission, path: c.req.path }, "authz.denied");
      return c.json(err("FORBIDDEN"), 403);
    }
    if (p.kind === "system" && p.source === "internal-secret" && !c.req.path.startsWith("/v1/internal/"))
      return c.json(err("FORBIDDEN"), 403);
    const flags = opts.flags;
    if (flags && modules.length > 0) {
      const states = await Promise.all(
        modules.map((m) =>
          flags.killedState ? flags.killedState(m) : flags.isKilled(m).then((k) => (k ? "killed" : "live")),
        ),
      );
      if (states.includes("killed")) return c.json(err("SERVICE_DISABLED"), 503);
      if (states.includes("unknown")) {
        c.header("Retry-After", "5");
        return c.json(err("OVERLOADED"), 503);
      }
    }
    await next();
  };
}

import type { MiddlewareHandler } from "hono";
import { roleHas, type Permission } from "@bbc/shared/authz/permissions";
import { roleOf, type Principal } from "@bbc/shared/authz/principal";

export type PrincipalVars = { Variables: { principal: Principal; requestId: string } };

/** Every protected route registers here at mount time; the inventory test asserts every /v1 route is present. */
export const routeRegistry = new Map<string, Permission | "public">();
export function registerRoute(method: string, path: string, permission: Permission | "public") {
  routeRegistry.set(`${method.toUpperCase()} ${path}`, permission);
}

type Flags = { isKilled(module: string): Promise<boolean> };

export const err = (code: string, message = MESSAGES[code]) => ({ error: { code, message } });
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Please sign in.",
  FORBIDDEN: "Not allowed.",
  NOT_FOUND: "Not found.",
  SERVICE_DISABLED: "This feature is temporarily unavailable.",
};

/** Route-level authorization. Resource-level ownership lives in the repositories (WHERE member_id = actor). */
export function authorize(
  permission: Permission,
  opts: { module?: string; flags?: Flags; log?: (o: object, m: string) => void } = {},
): MiddlewareHandler<PrincipalVars> {
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
    if (opts.module && opts.flags && (await opts.flags.isKilled(opts.module)))
      return c.json(err("SERVICE_DISABLED"), 503);
    await next();
  };
}

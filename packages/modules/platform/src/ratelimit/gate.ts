import type { Hono, MiddlewareHandler } from "hono";
import type { AppEnv } from "@bbc/shared/http/app-env";
import type { Permission } from "@bbc/shared/authz/permissions";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import type { RuleName } from "./rules";
import { rateLimit } from "./middleware";

type Limiter = Parameters<typeof rateLimit>[0];
type Flags = { isKilled(module: string): Promise<boolean> };
type Logger = { warn: (o: object, m?: string) => void };

/**
 * A route's policy, declared once (ADR-IMPL-075): what it asks of the principal, the rate rule its numbers count
 * against, and the modules it reads besides its owner — any of them killed answers 503.
 */
export type RoutePolicy = {
  permission: Permission;
  /** The rule counted for the route. Absent: the route is not limited (or a later step limits it, see `rateBy`). */
  rate?: RuleName;
  /** `route`: the rule is the route's, but a step of its own counts it — under a subject of its own (a password
   *  change, a photo) or inside its transaction — so it is registered for the inventory and not applied here. */
  rateBy?: "gate" | "route";
  /** Modules the answer reads besides the owner's: a kill of any of them stops the route too. */
  reads?: readonly string[];
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The route gate (ADR-IMPL-075): each route states its policy once, beside its path, and every route is checked in
 * the same order — the rate rule (so a flood is refused before anything else is asked), then the permission, then the
 * kill flags of the modules it reads, from the flags snapshot (ADR-IMPL-075: no query). The route registry the
 * inventory tests read is written here, from the same declaration, so the two cannot disagree.
 *
 *   const r = routeGate(platform, "catalog").on(routes, "/v1");
 *   r.get("/airports", { permission: "fares:read", rate: "read" }, async (c) => …);
 */
export function routeGate(deps: { rateLimit: Limiter; flags: Flags; logger: Logger }, owner: string) {
  const log = deps.logger.warn.bind(deps.logger);

  function guard(method: Method, fullPath: string, policy: RoutePolicy): MiddlewareHandler<AppEnv>[] {
    registerRoute(method, fullPath, policy.permission, policy.rate);
    const modules = [owner, ...(policy.reads ?? []).filter((m) => m !== owner)];
    const steps: MiddlewareHandler<AppEnv>[] = [];
    if (policy.rate && (policy.rateBy ?? "gate") === "gate") steps.push(rateLimit(deps.rateLimit, policy.rate));
    steps.push(authorize(policy.permission, { modules, flags: deps.flags, log }));
    return steps;
  }

  return {
    /** The middleware for one route, registered under `fullPath` (for an app that is not mounted under a base). */
    guard,
    /** A Hono app mounted under `basePath`: each method takes the path once, the policy, then the handlers. */
    on<E extends AppEnv>(routes: Hono<E>, basePath: string) {
      const add =
        (method: Method) =>
        <P extends string>(path: P, policy: RoutePolicy, ...handlers: MiddlewareHandler<E, P>[]): void => {
          const steps = guard(method, `${basePath}${path}`, policy);
          // Hono's overloads type a fixed number of handlers; the chain is the gate's steps, then the route's.
          (routes as unknown as { on(m: string, p: string, ...h: unknown[]): unknown }).on(
            method,
            path,
            ...steps,
            ...handlers,
          );
        };
      return { get: add("GET"), post: add("POST"), put: add("PUT"), patch: add("PATCH"), delete: add("DELETE") };
    },
  };
}

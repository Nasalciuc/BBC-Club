import type { MiddlewareHandler } from "hono";
import { timingSafeEqual, createHash } from "node:crypto";
import { jwtVerify, createRemoteJWKSet, customFetch } from "jose";
import type { Principal } from "@bbc/shared/authz/principal";
import { err, type PrincipalVars } from "@bbc/shared/authz/authorize";
import type { IdentityFacade } from "@bbc/identity";
import { errorForLog } from "@bbc/db";

export type { PrincipalVars };

/** Pure: operator JWT without an email is 401 (JWKS mint is hard to unit-test through the host). */
export function principalFromJwtPayload(payload: {
  role?: unknown;
  sub?: unknown;
  email?: unknown;
}): { ok: true; principal: Principal } | { ok: false; status: 401 | 403 } {
  const role = payload.role;
  if (role === "operator") {
    if (typeof payload.email !== "string" || payload.email.length === 0) return { ok: false, status: 401 };
    return {
      ok: true,
      principal: { kind: "operator", role: "operator", operatorId: String(payload.sub ?? ""), email: payload.email },
    };
  }
  if (role === "system") return { ok: true, principal: { kind: "system", role: "system", source: "jwt" } };
  return { ok: false, status: 403 };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type Opts = {
  identity: IdentityFacade;
  appOrigin: string;
  internalSecrets: string[];
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
};

/** Order is the security property: secret → bearer → cookie → anonymous. First match wins; nothing else is read. */
export function resolvePrincipal(opts: Opts): MiddlewareHandler<PrincipalVars> {
  const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", opts.appOrigin), {
    // Tests boot the host in-memory (no listen); fetch JWKS through the identity handler.
    [customFetch]: async (input: string | URL | Request, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init);
      try {
        return await opts.identity.handler(req);
      } catch (err) {
        // A failed key read leaves Better Auth's handler (onAPIError.throw); jose then answers the bearer 401 without a
        // word, so the reason is logged here, through errorForLog (AGENTS.md rule 6).
        opts.logger.warn({ err: errorForLog(err) }, "jwks unavailable");
        throw err;
      }
    },
  });
  const secretHashes = opts.internalSecrets.map(sha256);

  return async (c, next) => {
    const secret = c.req.header("x-internal-secret");
    if (secret) {
      const ok = secretHashes.some((h) => timingSafeEqual(h, sha256(secret)));
      if (!ok) {
        opts.logger.warn({ ip: c.get("clientIp") }, "authz.denied internal-secret");
        return c.json(err("UNAUTHORIZED"), 401);
      }
      c.set("principal", { kind: "system", role: "system", source: "internal-secret" });
      return next();
    }
    const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try {
        const { payload } = await jwtVerify(bearer, jwks, { issuer: opts.appOrigin, audience: opts.appOrigin });
        const resolved = principalFromJwtPayload(payload);
        if (!resolved.ok) return c.json(err(resolved.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN"), resolved.status);
        c.set("principal", resolved.principal);
        return next();
      } catch {
        return c.json(err("UNAUTHORIZED"), 401);
      }
    }
    // A write reads the session from the database, not from the signed cookie cache (SESSION_COOKIE_CACHE_SECONDS): a
    // member deleted on another device, or a session ended there, must not land a request, a device token or a
    // preference after member.deleted has erased everything (nothing would erase them again). Reads keep the cache.
    const fresh = !SAFE_METHODS.has(c.req.method);
    const s = await opts.identity.getSession(c.req.raw.headers, { fresh });
    if (s) {
      c.set("principal", {
        kind: "member",
        role: "member",
        memberId: s.member.id,
        sessionId: s.sessionId,
        email: s.member.email,
      });
      return next();
    }
    c.set("principal", { kind: "anonymous" });
    return next();
  };
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest();
}

import type { MiddlewareHandler } from "hono";
import { timingSafeEqual, createHash } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { Principal } from "@bbc/platform/authz/principal";
import type { IdentityFacade } from "@bbc/identity";

export type PrincipalVars = { Variables: { principal: Principal; requestId: string } };

type Opts = {
  identity: IdentityFacade;
  appOrigin: string;                       // JWKS at `${appOrigin}/api/auth/jwks`
  internalSecrets: string[];               // current + next (rotation window)
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
};

/** Order is the security property: secret → bearer → cookie → anonymous. First match wins; nothing else is read. */
export function resolvePrincipal(opts: Opts): MiddlewareHandler<PrincipalVars> {
  const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", opts.appOrigin));
  const secretHashes = opts.internalSecrets.map(sha256);

  return async (c, next) => {
    // 1. system via internal secret (only meaningful on /v1/internal/*; the route guard enforces the path)
    const secret = c.req.header("x-internal-secret");
    if (secret) {
      const ok = secretHashes.some((h) => timingSafeEqual(h, sha256(secret)));   // constant-time, fixed length via hashing
      if (!ok) { opts.logger.warn({ ip: c.req.header("cf-connecting-ip") }, "authz.denied internal-secret"); return c.json(err("UNAUTHORIZED"), 401); }
      c.set("principal", { kind: "system", role: "system", source: "internal-secret" });
      return next();
    }
    // 2. operator/system via Better Auth JWT (EdDSA, verified against our own JWKS)
    const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try {
        const { payload } = await jwtVerify(bearer, jwks, { issuer: opts.appOrigin, audience: opts.appOrigin });
        const role = payload.role as string | undefined;
        if (role === "operator") c.set("principal", { kind: "operator", role, operatorId: String(payload.sub), email: String(payload.email ?? "") });
        else if (role === "system") c.set("principal", { kind: "system", role, source: "jwt" });
        else return c.json(err("FORBIDDEN"), 403);              // a member JWT is not a transport we accept
        return next();
      } catch { return c.json(err("UNAUTHORIZED"), 401); }
    }
    // 3. member via session cookie
    const s = await opts.identity.getSession(c.req.raw.headers);
    if (s) { c.set("principal", { kind: "member", role: "member", memberId: s.member.id, sessionId: s.sessionId }); return next(); }
    // 4. anonymous
    c.set("principal", { kind: "anonymous" });
    return next();
  };
}

function sha256(s: string) { return createHash("sha256").update(s).digest(); }
export const err = (code: string, message = MESSAGES[code]) => ({ error: { code, message } });
const MESSAGES: Record<string, string> = { UNAUTHORIZED: "Please sign in.", FORBIDDEN: "Not allowed.", NOT_FOUND: "Not found.", SERVICE_DISABLED: "This feature is temporarily unavailable." };

import type { MiddlewareHandler } from "hono";
import { timingSafeEqual, createHash } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { Principal } from "@bbc/shared/authz/principal";
import { err, type PrincipalVars } from "@bbc/shared/authz/authorize";
import type { IdentityFacade } from "@bbc/identity";

export type { PrincipalVars };

type Opts = {
  identity: IdentityFacade;
  appOrigin: string;
  internalSecrets: string[];
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };
};

/** Order is the security property: secret → bearer → cookie → anonymous. First match wins; nothing else is read. */
export function resolvePrincipal(opts: Opts): MiddlewareHandler<PrincipalVars> {
  const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", opts.appOrigin));
  const secretHashes = opts.internalSecrets.map(sha256);

  return async (c, next) => {
    const secret = c.req.header("x-internal-secret");
    if (secret) {
      const ok = secretHashes.some((h) => timingSafeEqual(h, sha256(secret)));
      if (!ok) {
        opts.logger.warn({ ip: c.req.header("cf-connecting-ip") }, "authz.denied internal-secret");
        return c.json(err("UNAUTHORIZED"), 401);
      }
      c.set("principal", { kind: "system", role: "system", source: "internal-secret" });
      return next();
    }
    const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      try {
        const { payload } = await jwtVerify(bearer, jwks, { issuer: opts.appOrigin, audience: opts.appOrigin });
        const role = payload.role as string | undefined;
        if (role === "operator")
          c.set("principal", {
            kind: "operator",
            role,
            operatorId: String(payload.sub),
            email: String(payload.email ?? ""),
          });
        else if (role === "system") c.set("principal", { kind: "system", role, source: "jwt" });
        else return c.json(err("FORBIDDEN"), 403);
        return next();
      } catch {
        return c.json(err("UNAUTHORIZED"), 401);
      }
    }
    const s = await opts.identity.getSession(c.req.raw.headers);
    if (s) {
      c.set("principal", { kind: "member", role: "member", memberId: s.member.id, sessionId: s.sessionId });
      return next();
    }
    c.set("principal", { kind: "anonymous" });
    return next();
  };
}

function sha256(s: string) {
  return createHash("sha256").update(s).digest();
}

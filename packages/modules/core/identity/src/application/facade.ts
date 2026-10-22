import type { MiddlewareHandler } from "hono";
import { desc, lt } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import type { Auth } from "../infrastructure/auth";
import { user } from "../infrastructure/schema";
import type { AuthVars, IdentityFacade, Member, SessionInfo } from "../api";

export type { Member, AuthVars, SessionInfo, IdentityFacade };

/** Methods that change nothing: they may answer from the cookie cache. Every other method reads the session fresh. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Implementation — imported by module.ts, not by other packages via api/index.ts. */
export function createIdentityFacade(auth: Auth, db: Executor): Omit<IdentityFacade, "auth"> {
  /** `fresh` reads the session row and its user from the database instead of the signed cookie cache
   *  (SESSION_COOKIE_CACHE_SECONDS): a deleted member or an ended session is anonymous at once, not a minute later. */
  async function getSession(headers: Headers, opts: { fresh?: boolean } = {}): Promise<SessionInfo | null> {
    let s = await auth.api.getSession({ headers, query: opts.fresh ? { disableCookieCache: true } : undefined });
    if (s?.user && !s.user.emailVerified && !opts.fresh) {
      // A code sign-in verifies an account registered unverified earlier, but Better Auth writes the user as it was
      // (emailVerified: false) into the cookie cache: read once more past the cache before calling the member unverified.
      s = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    }
    if (!s?.user) return null;
    if (!s.user.emailVerified) return null;
    return {
      member: {
        id: s.user.id,
        email: s.user.email,
        emailVerified: true,
        role: (s.user as { role?: string }).role ?? "member",
      },
      sessionId: s.session.id,
    };
  }

  const requireMember: MiddlewareHandler<AuthVars> = async (c, next) => {
    const s = await getSession(c.req.raw.headers, { fresh: !SAFE_METHODS.has(c.req.method) });
    if (!s) return c.json({ error: { code: "UNAUTHORIZED", message: "Please sign in." } }, 401);
    c.set("member", s.member);
    c.set("sessionId", s.sessionId);
    await next();
  };

  const requireRole =
    (...allowed: string[]): MiddlewareHandler<AuthVars> =>
    async (c, next) => {
      const m = c.get("member");
      if (!m || !allowed.includes(m.role))
        return c.json({ error: { code: "FORBIDDEN", message: "Not allowed." } }, 403);
      await next();
    };

  /** The same rule as the app's route: the password is asked for every time (club-guards runs for in-process calls). */
  async function deleteAccount(headers: Headers, password: string): Promise<void> {
    await auth.api.deleteUser({ headers, body: { password } });
  }

  async function listUsersCreatedBefore(
    before: Date,
    limit = 5000,
  ): Promise<{ id: string; email: string; createdAt: Date }[]> {
    const rows: { id: string; email: string; createdAt: Date }[] = await db
      .select({ id: user.id, email: user.email, createdAt: user.createdAt })
      .from(user)
      .where(lt(user.createdAt, before))
      .orderBy(desc(user.createdAt))
      .limit(limit);
    return rows;
  }

  return { handler: auth.handler, getSession, requireMember, requireRole, deleteAccount, listUsersCreatedBefore };
}

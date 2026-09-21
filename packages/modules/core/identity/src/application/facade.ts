import type { MiddlewareHandler } from "hono";
import { desc, lt } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import type { Auth } from "../infrastructure/auth";
import { user } from "../infrastructure/schema";
import type { AuthVars, IdentityFacade, Member, SessionInfo } from "../api";

export type { Member, AuthVars, SessionInfo, IdentityFacade };

/** Implementation — imported by module.ts, not by other packages via api/index.ts. */
export function createIdentityFacade(auth: Auth, db: Executor): Omit<IdentityFacade, "auth"> {
  async function getSession(headers: Headers): Promise<SessionInfo | null> {
    const s = await auth.api.getSession({ headers });
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
    const s = await getSession(c.req.raw.headers);
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

  async function deleteAccount(headers: Headers): Promise<void> {
    await auth.api.deleteUser({ headers, body: {} });
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

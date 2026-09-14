import type { MiddlewareHandler } from "hono";
import { desc, lt } from "drizzle-orm";
import type { Auth } from "../infrastructure/auth";
import { user } from "../infrastructure/schema";

export type Member = { id: string; email: string; emailVerified: boolean; role: string };
export type AuthVars = { Variables: { member: Member; sessionId: string } };
export type IdentityFacade = ReturnType<typeof createIdentityFacade>;

/** The only surface other modules and the host may import. */
export function createIdentityFacade(auth: Auth, db: any) {
  async function getSession(headers: Headers): Promise<{ member: Member; sessionId: string } | null> {
    const s = await auth.api.getSession({ headers }); // awaited — the tutorial's dead guard, fixed
    if (!s?.user) return null;
    if (!s.user.emailVerified) return null; // unverified accounts have no access
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

  /** 401 without a valid, verified session. Sets c.var.member / c.var.sessionId. */
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

  /** Deletion entrypoint for the BFF; the app re-asks the password in the confirmation sheet. */
  async function deleteAccount(headers: Headers): Promise<void> {
    await auth.api.deleteUser({ headers, body: {} }); // → beforeDelete → member.deleted → cascades
  }

  /** Users created before `before` — ids and emails only. Members diffs these against its profiles for the
   *  nightly reconciliation; no module reads auth.* directly. */
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

export type { Auth } from "../infrastructure/auth";
export { createAuth } from "../infrastructure/auth";
export { ac, roles } from "../infrastructure/access";

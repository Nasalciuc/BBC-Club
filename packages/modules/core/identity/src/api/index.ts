import type { MiddlewareHandler } from "hono";
import type { Auth } from "../infrastructure/auth";

export type Member = { id: string; email: string; emailVerified: boolean; role: string };
export type SessionInfo = { member: Member; sessionId: string };
export type AuthVars = { Variables: { member: Member; sessionId: string } };

/** The only import surface of @bbc/identity. module.ts implements it; consumers import it. */
export type IdentityFacade = {
  auth: Auth;
  handler: Auth["handler"];
  getSession(headers: Headers): Promise<SessionInfo | null>;
  requireMember: MiddlewareHandler<AuthVars>;
  requireRole(...allowed: string[]): MiddlewareHandler<AuthVars>;
  deleteAccount(headers: Headers): Promise<void>;
  listUsersCreatedBefore(before: Date, limit?: number): Promise<{ id: string; email: string; createdAt: Date }[]>;
};

export type { Auth } from "../infrastructure/auth";
export { createAuth } from "../infrastructure/auth";
export { ac, roles } from "../infrastructure/access";

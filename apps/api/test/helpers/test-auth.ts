import { sql } from "drizzle-orm";
import type { Auth } from "@bbc/identity";

/** Real Better Auth against the test DB. Members are created through the same API the app uses;
 *  the cookie returned is exactly what the mobile client stores. */
export function testAuth(auth: Auth, db: any) {
  async function createMember(email: string, password = "atlantic2026!", opts: { verified?: boolean } = {}) {
    await auth.api.signUpEmail({ body: { email, password, name: "" } });
    if (opts.verified ?? true)
      await db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE email = ${email.toLowerCase()}`);
    const [{ id }]: any = await db.execute(sql`SELECT id FROM auth."user" WHERE email = ${email.toLowerCase()}`);
    return { id: id as string, email, password };
  }

  /** Sign in through the API and return the Set-Cookie value as a Cookie header — the real session, not a fake. */
  async function cookieFor(email: string, password = "atlantic2026!"): Promise<string> {
    const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("no session cookie returned");
    return setCookie
      .split(",")
      .map((c) => (c.split(";")[0] ?? "").trim())
      .join("; ");
  }

  /** Operator: a member promoted by role, then a JWT from Better Auth's jwt plugin. */
  async function operatorJwt(email = "ops@test.dev"): Promise<string> {
    const m = await createMember(email);
    await db.execute(sql`UPDATE auth."user" SET role = 'operator' WHERE id = ${m.id}`);
    const cookie = await cookieFor(email);
    const res = await auth.api.getToken({ headers: new Headers({ Cookie: cookie }) });
    return (res as any).token;
  }

  return { createMember, cookieFor, operatorJwt };
}

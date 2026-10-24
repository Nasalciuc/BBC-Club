import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { sql } from "drizzle-orm";
import { testAuth } from "./helpers/test-auth";

/**
 * Better Auth's own error lines go through the club's logger and errorForLog (AGENTS.md rule 6): a query that fails
 * while it reads a session or a member carries its parameters in its message, and those are session tokens and
 * addresses. Nothing of them may reach a log line, the console included.
 */
describe("Better Auth's error lines carry no query parameter", () => {
  let printed: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  beforeEach(() => {
    printed = [];
    for (const name of ["error", "warn", "log", "info", "debug"] as const) {
      spies.push(
        spyOn(console, name).mockImplementation((...args: unknown[]) => {
          printed.push(args.map((a) => (a instanceof Error ? `${a.message} ${String(a.cause)}` : String(a))).join(" "));
        }),
      );
    }
  });
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("a session read that fails: no token in any line, and the failure is still logged", async () => {
    const ctx = await testAuth();
    try {
      const token = `tok${crypto.randomUUID().replaceAll("-", "")}`;
      await ctx.db.execute(sql`ALTER TABLE auth.session RENAME TO session_gone`);

      const headers = new Headers({ authorization: `Bearer ${token}` });
      await ctx.auth.api.getSession({ headers }).catch(() => undefined);
      const res = await ctx.auth.handler(new Request("http://localhost:8000/api/auth/get-session", { headers }));
      expect(res.status).toBeGreaterThanOrEqual(400);

      const lines = [...printed, JSON.stringify(ctx.seen.logs)].join("\n");
      expect(lines).not.toContain(token);
      expect(lines).not.toContain("params:");
      // Still seen: an error line through the club's logger, with the failure's facts (errorForLog keeps the SQLSTATE).
      expect(ctx.seen.logs.some((l) => l.level === "error" && JSON.stringify(l.fields).includes("42P01"))).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it("a member lookup that fails: no address in any line, and the error leaves the handler", async () => {
    const ctx = await testAuth();
    try {
      const email = `leak.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      await ctx.db.execute(sql`ALTER TABLE auth."user" RENAME TO user_gone`);

      // A failed query is not one of Better Auth's answers: it leaves the handler, for the host's error contract to log
      // through errorForLog and answer 500 (apps/api/test/auth-logging.test.ts).
      const out = await ctx.auth
        .handler(
          new Request("http://localhost:8000/api/auth/sign-in/email", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
            body: JSON.stringify({ email, password: "a-password-1" }),
          }),
        )
        .catch((e: unknown) => e);
      expect(out).toBeInstanceOf(Error);

      const lines = [...printed, JSON.stringify(ctx.seen.logs)].join("\n");
      expect(lines).not.toContain(email);
      expect(lines).not.toContain("params:");
    } finally {
      await ctx.close();
    }
  });
});

describe("Better Auth's answers are unchanged", () => {
  it("a wrong password still answers 401 from the handler, not a thrown error", async () => {
    const ctx = await testAuth();
    try {
      const res = await ctx.auth.handler(
        new Request("http://localhost:8000/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
          body: JSON.stringify({
            email: `nobody.${crypto.randomUUID().slice(0, 8)}@test.dev`,
            password: "a-password-1",
          }),
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      await ctx.close();
    }
  });
});

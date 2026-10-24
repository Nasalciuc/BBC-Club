import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { sql } from "drizzle-orm";
import { createIdentityFacade } from "../src/application/facade";
import { betterAuthLine } from "../src/infrastructure/auth";
import { testAuth } from "./helpers/test-auth";

/**
 * Better Auth's own error lines go through the club's logger and errorForLog (AGENTS.md rule 6): a query that fails
 * while it reads a session or a member carries its parameters in its message, and those are session tokens and
 * addresses. Nothing of them may reach a log line, the console included.
 */
describe("Better Auth's error lines carry no query parameter", () => {
  let printed: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  // What the console would print: Bun.inspect shows an object's fields, an error's message and its cause.
  beforeEach(() => {
    printed = [];
    for (const name of ["error", "warn", "log", "info", "debug"] as const) {
      spies.push(
        spyOn(console, name).mockImplementation((...args: unknown[]) => {
          printed.push(args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" "));
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
  it("refusals that pass through its error handler still answer, never throw: bad JSON 400, no password 400", async () => {
    const ctx = await testAuth();
    try {
      const call = (path: string, body: string) =>
        ctx.auth.handler(
          new Request(`http://localhost:8000/api/auth${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
            body,
          }),
        );
      expect((await call("/sign-in/email", "{nope")).status).toBe(400);
      const noPassword = await call("/delete-user", "{}");
      expect(noPassword.status).toBe(400);
      expect(((await noPassword.json()) as { code?: string }).code).toBe("INVALID_PASSWORD");
    } finally {
      await ctx.close();
    }
  });
});

describe("the library's own console lines (patched @better-auth/core)", () => {
  let printed: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  beforeEach(() => {
    printed = [];
    for (const name of ["error", "warn", "log", "info", "debug"] as const) {
      spies.push(
        spyOn(console, name).mockImplementation((...args: unknown[]) => {
          printed.push(args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" "));
        }),
      );
    }
  });
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("a session read whose user join fails prints no member id", async () => {
    const ctx = await testAuth();
    try {
      const id = crypto.randomUUID();
      const token = `tok${crypto.randomUUID().replaceAll("-", "")}`;
      await ctx.db.execute(
        sql`INSERT INTO auth."user" (id, name, email, email_verified) VALUES (${id}, 'P', ${`p.${id.slice(0, 8)}@test.dev`}, true)`,
      );
      await ctx.db.execute(
        sql`INSERT INTO auth.session (id, user_id, token, expires_at) VALUES (${crypto.randomUUID()}, ${id}, ${token}, now() + interval '1 day')`,
      );
      await ctx.db.execute(sql`ALTER TABLE auth."user" RENAME COLUMN name TO name_gone`);

      const headers = new Headers({ authorization: `Bearer ${token}` });
      await ctx.auth
        .handler(new Request("http://localhost:8000/api/auth/get-session", { headers }))
        .catch(() => undefined);
      await ctx.auth.api.getSession({ headers }).catch(() => undefined);

      const lines = [...printed, JSON.stringify(ctx.seen.logs)].join("\n");
      expect(lines).not.toContain(id);
      expect(lines).not.toContain(token);
      expect(lines).not.toContain("params:");
    } finally {
      await ctx.close();
    }
  });

  it("a session-data cookie that is not JSON prints none of its text", async () => {
    const ctx = await testAuth();
    try {
      const secret = `SECRETLOOKING${crypto.randomUUID().slice(0, 8)}`;
      // Bare text: the JSON parser's error quotes it ("Unexpected identifier …").
      const data = Buffer.from(secret).toString("base64url");
      // A session cookie signed as Better Auth signs it (HMAC-SHA256 with the secret), so the cookie cache is read.
      const token = await signedCookieValue("any-token", process.env.BETTER_AUTH_SECRET ?? "");
      const headers = new Headers({ cookie: `bbc.session_token=${token}; bbc.session_data=${data}` });
      await ctx.auth
        .handler(new Request("http://localhost:8000/api/auth/get-session", { headers }))
        .catch(() => undefined);

      expect([...printed, JSON.stringify(ctx.seen.logs)].join("\n")).not.toContain(secret);
    } finally {
      await ctx.close();
    }
  });
});

/** A cookie value signed the way better-call signs it: `<value>.<base64 HMAC-SHA256>`, URI-encoded. */
async function signedCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`);
}

describe("betterAuthLine", () => {
  it("finds an error passed as the message, logs it through errorForLog and never its query text", () => {
    const lines: { fields: Record<string, unknown>; message?: string }[] = [];
    const push = (fields: object, message?: string) =>
      void lines.push({ fields: fields as Record<string, unknown>, message });
    // As Drizzle throws it: its name, its message with the parameters, the driver's error as its cause.
    const query = Object.assign(new Error("Failed query: select 1 where email = $1\nparams: a@b.dev"), {
      name: "DrizzleQueryError",
      cause: Object.assign(new Error('relation "auth.user" does not exist'), { code: "42P01" }),
    });
    betterAuthLine({ info: push, warn: push, error: push }, "error", query, []);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toBe("better-auth: failed query");
    expect(JSON.stringify(lines[0])).not.toContain("a@b.dev");
    expect(lines[0]?.fields.err).toBeDefined();
  });
});

describe("a reset-code request that fails", () => {
  it("still waits out the answer floor before the error leaves the facade", async () => {
    const ctx = await testAuth();
    try {
      await ctx.db.execute(sql`ALTER TABLE auth.verification RENAME COLUMN value TO value_gone`);
      const facade = createIdentityFacade(ctx.auth, ctx.db, { otpAnswerFloorMs: 400 });
      const t0 = performance.now();
      const out = await facade
        .handler(
          new Request("http://localhost:8000/api/auth/email-otp/request-password-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
            body: JSON.stringify({ email: `nobody.${crypto.randomUUID().slice(0, 8)}@test.dev` }),
          }),
        )
        .catch((e: unknown) => e);
      expect(out).toBeInstanceOf(Error);
      expect(performance.now() - t0).toBeGreaterThanOrEqual(400);
    } finally {
      await ctx.close();
    }
  });
});

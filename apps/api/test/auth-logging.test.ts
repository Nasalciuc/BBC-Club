/** Through the whole host: an auth query that fails answers the API's 500 INTERNAL, and no line the process writes
 *  — the club's logger or the console — carries the query's parameters (AGENTS.md rule 6). */
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("a failed auth query is logged without its parameters", () => {
  const lines: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  // What the console would print: Bun.inspect shows an object's fields, an error's message and its cause.
  beforeEach(() => {
    lines.length = 0;
    for (const name of ["error", "warn", "log", "info"] as const) {
      spies.push(
        spyOn(console, name).mockImplementation((...args: unknown[]) => {
          lines.push(args.map((a) => (typeof a === "string" ? a : Bun.inspect(a))).join(" "));
        }),
      );
    }
  });
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("sign-in while auth.user cannot be read: 500 INTERNAL, logged as unhandled, no address anywhere", async () => {
    const t = await testApp({ suite: "auth-logging" });
    const logger = t.platform.logger as unknown as Record<string, (o: object, m?: string) => void>;
    for (const level of ["error", "warn", "info"] as const) {
      const original = logger[level]!.bind(logger);
      logger[level] = (o: object, m?: string) => {
        lines.push(`${m ?? ""} ${JSON.stringify(o)}`);
        original(o, m);
      };
    }
    try {
      const email = `leak.${crypto.randomUUID().slice(0, 8)}@test.dev`;
      await t.db.execute(sql`ALTER TABLE auth."user" RENAME TO user_gone`);
      const res = await t.app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:8000" },
        body: JSON.stringify({ email, password: "a-password-1" }),
      });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");

      const all = lines.join("\n");
      expect(all).toContain("unhandled");
      expect(all).not.toContain(email);
      expect(all).not.toContain("params:");
    } finally {
      await t.close();
    }
  });

  it("a bearer token while the signing keys cannot be read: 401, and the reason is logged without parameters", async () => {
    const t = await testApp({ suite: "auth-logging-jwks" });
    const logger = t.platform.logger as unknown as Record<string, (o: object, m?: string) => void>;
    for (const level of ["error", "warn", "info"] as const) {
      const original = logger[level]!.bind(logger);
      logger[level] = (o: object, m?: string) => {
        lines.push(`${m ?? ""} ${JSON.stringify(o)}`);
        original(o, m);
      };
    }
    try {
      await t.db.execute(sql`ALTER TABLE auth.jwks RENAME TO jwks_gone`);
      // Shaped like a JWT, so jose asks for the keys before it checks anything else.
      const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const jwt = `${part({ alg: "EdDSA", kid: "k1" })}.${part({ sub: "x" })}.${Buffer.from("sig").toString("base64url")}`;
      const res = await t.app.request("/v1/profile", { headers: { Authorization: `Bearer ${jwt}` } });
      expect(res.status).toBe(401);

      const all = lines.join("\n");
      expect(all).toContain("jwks unavailable");
      expect(all).not.toContain("params:");
    } finally {
      await t.close();
    }
  });
});

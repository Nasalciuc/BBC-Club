/** scripts/check-env.ts: the server's boot rules, run before a deploy starts anything — no database. */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerEnv } from "@bbc/shared/env";
import { checkEnv } from "./check-env";

const SECRET = "s3cr3t-value-that-must-never-be-printed-0001";
const production = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://api.example.com",
  DATABASE_URL: "postgres://bbc:x@pgbouncer:5432/bbc",
  BETTER_AUTH_SECRET: SECRET,
  INTERNAL_API_SECRET: SECRET,
  POSTMARK_SERVER_TOKEN: SECRET,
  APP_ROLE: "api",
};

function without(key: keyof typeof production): Record<string, string> {
  return Object.fromEntries(Object.entries(production).filter(([name]) => name !== key));
}

describe("checkEnv", () => {
  it("passes a complete production env and says how it will run", () => {
    expect(checkEnv(production)).toEqual({
      ok: true,
      summary: "NODE_ENV production, APP_ROLE api, CRM mock, push recording",
    });
  });

  it("names what is missing and never prints a value", () => {
    const result = checkEnv(without("POSTMARK_SERVER_TOKEN"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("POSTMARK_SERVER_TOKEN is required in production");
    expect(result.reason).not.toContain(SECRET);
  });

  it("names what the CRM http adapter lacks, and never prints its secret (ADR-IMPL-065)", () => {
    expect(checkEnv({ ...production, CRM_ADAPTER: "http" })).toEqual({
      ok: false,
      reason: "CRM_ADAPTER=http: requires CRM_API_URL; requires CRM_API_SECRET (at least 32 characters)",
    });
    const plain = checkEnv({
      ...production,
      CRM_ADAPTER: "http",
      CRM_API_URL: "http://crm.example.com/requests",
      CRM_API_SECRET: SECRET,
    });
    expect(plain).toEqual({
      ok: false,
      reason: "CRM_ADAPTER=http: CRM_API_URL must be https (http only to localhost, outside production)",
    });
    expect(
      checkEnv({
        ...production,
        CRM_ADAPTER: "http",
        CRM_API_URL: "https://crm.example.com/requests",
        CRM_API_SECRET: SECRET,
      }),
    ).toEqual({ ok: true, summary: "NODE_ENV production, APP_ROLE api, CRM http, push recording" });
  });

  it("refuses live push without FCM, by name", () => {
    const result = checkEnv({ ...production, PUSH_ADAPTER: "live" });
    expect(result).toEqual({
      ok: false,
      reason: "PUSH_ADAPTER=live: requires FCM_SERVICE_ACCOUNT_BASE64 (Android)",
    });
  });

  // `OPS_LINK_SECRET=     # min 32 characters; …` reaches the server as that text, which is long enough for min(32).
  it("refuses a secret left as the example's comment, by name", () => {
    const result = checkEnv({
      ...production,
      CRM_ADAPTER: "email",
      OPERATORS_EMAIL: "ops@example.com",
      OPS_LINK_SECRET: "# min 32 characters; required when CRM_ADAPTER=email",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toStartWith("OPS_LINK_SECRET: the example file's comment, not a secret");
    expect(result.reason).not.toContain("min 32 characters");
  });

  it("passes any other setting left as the example's comment, and names it", () => {
    const result = checkEnv({ ...production, POSTMARK_SERVER_TOKEN: "# sandbox stream; empty = codes are logged" });
    expect(result).toMatchObject({ ok: true, summary: "NODE_ENV production, APP_ROLE api, CRM mock, push recording" });
    if (!result.ok) return;
    expect(result.warning).toStartWith("POSTMARK_SERVER_TOKEN: the example file's comment, not a value");
    expect(result.warning).not.toContain("sandbox stream");
  });
});

describe("bun scripts/check-env.ts", () => {
  /**
   * Runs the script from an empty directory, so no .env file of this checkout reaches it, with this shell's environment
   * minus every setting the server reads (a DATABASE_URL exported here must not decide the result).
   */
  async function run(env: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), "bbc-check-env-"));
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !(key in ServerEnv.shape)));
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "check-env.ts")], {
      cwd: dir,
      env: { ...inherited, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    rmSync(dir, { recursive: true, force: true });
    return { code, out, err };
  }

  it("exits 0 with the summary", async () => {
    const result = await run(production);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toBe("env ok: NODE_ENV production, APP_ROLE api, CRM mock, push recording\n");
  });

  it("adds a line for a setting left as the example's comment", async () => {
    const result = await run({ ...production, POSTMARK_SERVER_TOKEN: "# sandbox stream" });
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("\n⚠ POSTMARK_SERVER_TOKEN: the example file's comment, not a value");
  });

  it("exits 1 with the reason on stderr, and no value anywhere", async () => {
    const result = await run(without("BETTER_AUTH_SECRET"));
    expect(result.code).toBe(1);
    expect(result.err).toContain("env refused: Invalid environment:");
    expect(result.err).toContain("BETTER_AUTH_SECRET");
    expect(result.out + result.err).not.toContain(SECRET);
  });
});

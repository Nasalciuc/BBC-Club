import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dir, "..");
const lib = "infra/env-value.sh";
const refusal =
  "staging shares redis-app and kafka with production and has no key or topic isolation — leave REDIS_URL, KAFKA_BROKERS and REDIS_APP_PASSWORD unset in staging.env (ADR-IMPL-029).";

/** Git bash does not open a quoted `C:/…` path. Pass a repo-relative slash path. */
function shPath(p: string) {
  return JSON.stringify(relative(root, p).replace(/\\/g, "/"));
}

function bash(script: string): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bash", "-c", script], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return proc.exited.then(async (code) => ({
    code,
    out: await new Response(proc.stdout).text(),
    err: await new Response(proc.stderr).text(),
  }));
}

async function profile(prodBody: string, stagingBody?: string): Promise<string> {
  const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
  const prod = join(dir, "production.env");
  writeFileSync(prod, prodBody);
  const stg = stagingBody === undefined ? "" : join(dir, "staging.env");
  if (stagingBody !== undefined) writeFileSync(stg, stagingBody);
  const result = await bash(
    `source ${lib}\n` + `if redis_kafka_wanted ${shPath(prod)} ${shPath(stg)}; then echo on; else echo off; fi`,
  );
  rmSync(dir, { recursive: true, force: true });
  expect(result.code).toBe(0);
  return result.out.trim();
}

describe("redis-kafka profile", () => {
  it("stays off when the key is absent", async () => {
    expect(await profile("OTHER=1\n")).toBe("off");
  });

  it("stays off for a commented URL", async () => {
    expect(await profile("# REDIS_URL=redis://x\n")).toBe("off");
  });

  it("stays off for an empty assignment", async () => {
    expect(await profile("REDIS_URL=\n")).toBe("off");
  });

  it("stays off for double-quoted empty", async () => {
    expect(await profile('REDIS_URL=""\n')).toBe("off");
  });

  it("stays off for single-quoted empty", async () => {
    expect(await profile("REDIS_URL=''\n")).toBe("off");
  });

  it("stays off when the value is only a comment", async () => {
    expect(await profile("REDIS_URL=        # off for now\n")).toBe("off");
  });

  it("turns on for a redis URL", async () => {
    expect(await profile("REDIS_URL=redis://:abc@redis-app:6379\n")).toBe("on");
  });

  it("turns on for brokers with a trailing comment", async () => {
    expect(await profile("KAFKA_BROKERS=kafka:9092   # comment\n")).toBe("on");
  });

  it("uses the last assignment", async () => {
    expect(await profile("REDIS_URL=redis://x\nREDIS_URL=\n")).toBe("off");
  });

  it("turns on when only the attached staging file is set", async () => {
    expect(await profile("REDIS_URL=\n", "REDIS_URL=redis://x\n")).toBe("on");
  });
});

describe("staging isolation", () => {
  async function guard(body: string) {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    const stg = join(dir, "staging.env");
    writeFileSync(stg, body);
    const result = await bash(`source ${lib}\nguard_staging ${shPath(stg)}`);
    rmSync(dir, { recursive: true, force: true });
    return result;
  }

  it("refuses a staging redis URL", async () => {
    const result = await guard("REDIS_URL=redis://x\n");
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(refusal);
  });

  it("allows a quoted empty staging URL", async () => {
    expect((await guard('REDIS_URL=""\n')).code).toBe(0);
  });

  it("allows a commented-out staging URL", async () => {
    expect((await guard("REDIS_URL=   # off\n")).code).toBe(0);
  });

  it("allows a staging file that does not mention redis", async () => {
    expect((await guard("NODE_ENV=production\n")).code).toBe(0);
  });

  it("refuses a staging redis password", async () => {
    const result = await guard("REDIS_APP_PASSWORD=abc\n");
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(refusal);
  });
});

describe("redis-app password interpolation", () => {
  const image = "ghcr.io/example/bbc-api:local";

  async function config(stagingPasswordLine: string | null) {
    const dir = mkdtempSync(join(tmpdir(), "bbc-pw-"));
    const prod = join(dir, "production.env");
    const stg = join(dir, "staging.env");
    writeFileSync(
      prod,
      `API_IMAGE=${image}\nAPI_IMAGE_STAGING=${image}\nREDIS_APP_PASSWORD=prodpass\nPOSTGRES_PASSWORD=x\n`,
    );
    const stgBody =
      stagingPasswordLine === null
        ? `API_IMAGE_STAGING=${image}\n`
        : `API_IMAGE_STAGING=${image}\n${stagingPasswordLine}\n`;
    writeFileSync(stg, stgBody);
    const proc = Bun.spawn(
      [
        "docker",
        "compose",
        "-f",
        "infra/docker-compose.yml",
        "-f",
        "infra/compose.prod.yml",
        "-f",
        "infra/compose.staging.yml",
        "--env-file",
        prod,
        "--env-file",
        stg,
        "--profile",
        "redis-kafka",
        "config",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    rmSync(dir, { recursive: true, force: true });
    expect(code, err).toBe(0);
    const block = out.split(/\n(?=  [a-z0-9-]+:)/).find((part) => part.startsWith("  redis-app:"));
    expect(block).toBeDefined();
    return block ?? "";
  }

  it("keeps the production password when staging does not set it", async () => {
    expect(await config(null)).toContain("REDIS_APP_PASSWORD: prodpass");
  });

  it("shows the old empty staging assignment wiping the password", async () => {
    const block = await config("REDIS_APP_PASSWORD=");
    expect(block).not.toContain("REDIS_APP_PASSWORD: prodpass");
  });
});

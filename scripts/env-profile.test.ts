import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("turns on when the value is only a hash after spaces", async () => {
    expect(await profile("REDIS_URL=        # off for now\n")).toBe("on");
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

  it("refuses a hash that Compose keeps as the value", async () => {
    const result = await guard("REDIS_URL=   # off\n");
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(refusal);
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

const UNKNOWN = "UNKNOWN";

const grammar: { id: string; content: string; key: string; expected: string }[] = [
  { id: "01", content: "OTHER=1\n", key: "REDIS_URL", expected: "" },
  { id: "02", content: "# REDIS_URL=redis://x\n", key: "REDIS_URL", expected: "" },
  { id: "03", content: "REDIS_URL=\n", key: "REDIS_URL", expected: "" },
  { id: "04", content: 'REDIS_URL=""\n', key: "REDIS_URL", expected: "" },
  { id: "05", content: "REDIS_URL=''\n", key: "REDIS_URL", expected: "" },
  { id: "06", content: "REDIS_URL=        # off for now\n", key: "REDIS_URL", expected: "# off for now" },
  {
    id: "07",
    content: "REDIS_URL=redis://:abc@redis-app:6379\n",
    key: "REDIS_URL",
    expected: "redis://:abc@redis-app:6379",
  },
  { id: "08", content: "KAFKA_BROKERS=kafka:9092   # comment\n", key: "KAFKA_BROKERS", expected: "kafka:9092" },
  { id: "09", content: "REDIS_URL=redis://x\nREDIS_URL=\n", key: "REDIS_URL", expected: "" },
  { id: "10", content: "REDIS_URL: redis://redis-app:6379\n", key: "REDIS_URL", expected: "redis://redis-app:6379" },
  { id: "11", content: "KAFKA_BROKERS: kafka:9092\n", key: "KAFKA_BROKERS", expected: "kafka:9092" },
  { id: "12", content: "REDIS_APP_PASSWORD: abc123\n", key: "REDIS_APP_PASSWORD", expected: "abc123" },
  { id: "13", content: "REDIS_URL = redis://x\n", key: "REDIS_URL", expected: "redis://x" },
  { id: "14", content: "REDIS_URL=val#notacomment\n", key: "REDIS_URL", expected: "val#notacomment" },
  { id: "15", content: 'REDIS_URL="a # not a comment"\n', key: "REDIS_URL", expected: "a # not a comment" },
  { id: "16", content: 'REDIS_URL="" # comment\n', key: "REDIS_URL", expected: "" },
  { id: "17", content: "export REDIS_URL=redis://x\n", key: "REDIS_URL", expected: UNKNOWN },
  { id: "18", content: "export REDIS_URL=\n", key: "REDIS_URL", expected: UNKNOWN },
  { id: "19", content: "REDIS_URL=${X}\n", key: "REDIS_URL", expected: UNKNOWN },
  { id: "20", content: 'REDIS_URL="${X}"\n', key: "REDIS_URL", expected: UNKNOWN },
  { id: "21", content: "REDIS_URL='${X}'\n", key: "REDIS_URL", expected: "${X}" },
  { id: "22", content: "OTHER='line1\nREDIS_URL=fake\nend'\n", key: "REDIS_URL", expected: "" },
  { id: "23", content: "REDIS_URL=\r\n", key: "REDIS_URL", expected: "" },
  { id: "24", content: "REDIS_URL:\n", key: "REDIS_URL", expected: "" },
  { id: "25", content: "REDIS_URLX=foo\n", key: "REDIS_URL", expected: "" },
  { id: "26", content: 'REDIS_URL="abc\n', key: "REDIS_URL", expected: UNKNOWN },
  { id: "27", content: "REDIS_URL=#x\n", key: "REDIS_URL", expected: UNKNOWN },
  { id: "28", content: "REDIS_URL:   # off\n", key: "REDIS_URL", expected: "# off" },
];

const exactCompose = new Set([
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "21",
  "22",
  "23",
  "24",
  "25",
  "28",
]);

function grammarCase(id: string) {
  const found = grammar.find((row) => row.id === id);
  if (!found) throw new Error(`missing case ${id}`);
  return found;
}

async function readKey(content: string, key: string): Promise<string> {
  const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
  const file = join(dir, "case.env");
  const out = join(dir, "out.txt");
  const sent = join(dir, "sentinel.txt");
  const runner = join(dir, "run.sh");
  writeFileSync(file, content);
  writeFileSync(
    runner,
    "#!/bin/bash\n" +
      "source " +
      JSON.stringify(lib) +
      "\n" +
      "env_value " +
      shPath(file) +
      " " +
      key +
      " > " +
      shPath(out) +
      "\n" +
      "printf '%s' \"$ENV_VALUE_UNKNOWN\" > " +
      shPath(sent) +
      "\n",
  );
  const result = await bash("bash " + shPath(runner));
  const value = readFileSync(out, "utf8");
  const sentinel = readFileSync(sent, "utf8");
  rmSync(dir, { recursive: true, force: true });
  expect(result.code, result.err).toBe(0);
  if (sentinel.length === 0) throw new Error("sentinel was not written");
  return value === sentinel ? UNKNOWN : value;
}

describe("env_value grammar", () => {
  for (const row of grammar) {
    it(`case ${row.id}`, async () => {
      expect(await readKey(row.content, row.key)).toBe(row.expected);
    });
  }
});

describe("guard and profile for the new grammar", () => {
  async function guard(body: string) {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    const stg = join(dir, "staging.env");
    writeFileSync(stg, body);
    const result = await bash(`source ${lib}\nguard_staging ${shPath(stg)}`);
    rmSync(dir, { recursive: true, force: true });
    return result;
  }

  for (const id of ["07", "10", "12", "17", "19"]) {
    it(`refuses case ${id} in staging`, async () => {
      const result = await guard(grammarCase(id).content);
      expect(result.code).not.toBe(0);
      expect(result.err).toContain(refusal);
    });
  }

  it("turns the profile on for a colon redis URL", async () => {
    expect(await profile(grammarCase("10").content)).toBe("on");
  });

  it("turns the profile on for colon brokers", async () => {
    expect(await profile(grammarCase("11").content)).toBe("on");
  });

  it("turns the profile on when spaces then a hash are a real value", async () => {
    expect(await profile(grammarCase("06").content)).toBe("on");
  });

  it("turns the profile on for a colon hash value", async () => {
    expect(await profile(grammarCase("28").content)).toBe("on");
  });
});

const dockerProbe = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
const dockerReason =
  dockerProbe.status === 0
    ? null
    : (dockerProbe.stderr || dockerProbe.error?.message || "docker compose unavailable").trim();

function composeValue(json: unknown, key: string): string {
  const services = (json as { services?: { probe?: { environment?: unknown } } }).services;
  const env = services?.probe?.environment;
  if (env == null) return "";
  if (Array.isArray(env)) {
    for (const entry of env) {
      if (typeof entry !== "string") continue;
      if (entry === key) return "";
      if (entry.startsWith(`${key}=`)) return entry.slice(key.length + 1);
    }
    return "";
  }
  if (typeof env === "object") {
    const value = (env as Record<string, unknown>)[key];
    if (value == null) return "";
    return String(value).replaceAll("$$", "$");
  }
  return "";
}

function composeRead(content: string, key: string): { ok: true; value: string } | { ok: false; err: string } {
  const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
  const file = join(dir, "compose.yml");
  writeFileSync(join(dir, "case.env"), content);
  writeFileSync(file, "services:\n  probe:\n    image: alpine:3.20\n    env_file:\n      - case.env\n");
  const proc = spawnSync("docker", ["compose", "-f", file, "config", "--format", "json"], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  if (proc.status !== 0) return { ok: false, err: proc.stderr || proc.stdout };
  return { ok: true, value: composeValue(JSON.parse(proc.stdout), key) };
}

describe("compose parity", () => {
  if (dockerReason) {
    it("needs docker compose", () => {
      console.log(`parity skipped: ${dockerReason}`);
      if (process.env.CI) expect(dockerReason).toBeNull();
    });
  } else {
    for (const row of grammar) {
      it(`case ${row.id} matches what Compose would set`, async () => {
        const parsed = await readKey(row.content, row.key);
        const compose = composeRead(row.content, row.key);
        if (!compose.ok) {
          if (exactCompose.has(row.id)) expect(compose.err).toBe("");
          return;
        }
        if (compose.value !== "") expect(parsed).not.toBe("");
        if (exactCompose.has(row.id)) expect(parsed).toBe(compose.value);
      });
    }
  }
});

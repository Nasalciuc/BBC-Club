import { spawnSync } from "node:child_process";
import { describe, expect, it } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findUnannounced } from "./check-destructive-migrations";

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

/** Sources the parser, binds $F to a throwaway env file holding `content`, then runs `snippet`. */
async function withEnv(content: string, snippet: string) {
  const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
  const file = join(dir, "case.env");
  writeFileSync(file, content);
  const result = await bash(`source ${lib}\nF=${shPath(file)}\n${snippet}`);
  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe("required settings", () => {
  async function known(content: string): Promise<string> {
    const result = await withEnv(content, `if env_known "$F" SECRET; then echo yes; else echo no; fi`);
    expect(result.code, result.err).toBe(0);
    return result.out.trim();
  }

  it("accepts a filled value", async () => {
    expect(await known("SECRET=abc123\n")).toBe("yes");
  });

  it("accepts a filled value with a trailing comment and CRLF", async () => {
    expect(await known("SECRET=abc123   # note\r\n")).toBe("yes");
  });

  it("refuses an absent key", async () => {
    expect(await known("OTHER=1\n")).toBe("no");
  });

  it("refuses an empty value", async () => {
    expect(await known("SECRET=\n")).toBe("no");
  });

  it("refuses empty quotes", async () => {
    expect(await known('SECRET=""\n')).toBe("no");
  });

  it("refuses an unfilled template line, which Compose reads as its comment", async () => {
    expect(await known("SECRET=                    # openssl rand -base64 48\n")).toBe("no");
  });

  it("refuses a value the parser cannot resolve", async () => {
    expect(await known("SECRET=${HOST}\n")).toBe("no");
  });

  it("refuses an export line", async () => {
    expect(await known("export SECRET=abc123\n")).toBe("no");
  });
});

describe("optional settings", () => {
  async function optional(content: string) {
    const result = await withEnv(content, `printf '[%s]' "$(env_optional "$F" HOOK)"`);
    expect(result.code, result.err).toBe(0);
    return result;
  }

  it("returns a filled webhook without its quotes or CR", async () => {
    expect((await optional('HOOK="https://hooks.example/x"\r\n')).out).toBe("[https://hooks.example/x]");
  });

  it("returns nothing, quietly, for an unfilled template line", async () => {
    const result = await optional("HOOK=        # Slack incoming webhook\n");
    expect(result.out).toBe("[]");
    expect(result.err).toBe("");
  });

  it("returns nothing, and says so, for a line it cannot read", async () => {
    const result = await optional("HOOK=https://hooks.example/${PART}\n");
    expect(result.out).toBe("[]");
    expect(result.err).toContain("HOOK");
    expect(result.err).toContain("could not be read");
  });

  it("returns nothing, quietly, for an absent key", async () => {
    const result = await optional("OTHER=1\n");
    expect(result.out).toBe("[]");
    expect(result.err).toBe("");
  });
});

/** Sources the parser with production.env (and staging.env when given) in a throwaway dir: $P and $S, then `snippet`. */
async function withFiles(prod: string, staging: string | null, snippet: string) {
  const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
  writeFileSync(join(dir, "production.env"), prod);
  if (staging !== null) writeFileSync(join(dir, "staging.env"), staging);
  const s = staging === null ? '""' : shPath(join(dir, "staging.env"));
  const result = await bash(`source ${lib}\nP=${shPath(join(dir, "production.env"))}\nS=${s}\n${snippet}`);
  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe("an absent key", () => {
  it("prints the third argument when the file never assigns the key, or is missing", async () => {
    const result = await withEnv(
      "OTHER=1\nEMPTY=\n",
      `printf '[%s][%s][%s]' "$(env_value "$F" KEY "<none>")" "$(env_value "$F" EMPTY "<none>")" "$(env_value /no/such/file KEY "<none>")"`,
    );
    expect(result.code, result.err).toBe(0);
    expect(result.out).toBe("[<none>][][<none>]");
  });
});

describe("staging.env never sets what production's services read", () => {
  const composeFiles = "infra/docker-compose.yml infra/compose.prod.yml";

  it("refuses each such key, by name", async () => {
    const staging =
      "INTERNAL_API_SECRET=${INTERNAL_API_SECRET_STAGING}\nMINIO_PASSWORD=\nORIGIN_TLS=on\nAPI_REPLICAS_STAGING=1\n";
    const result = await withFiles("OTHER=1\n", staging, `guard_staging "$S" ${composeFiles}`);
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("sets INTERNAL_API_SECRET MINIO_PASSWORD ORIGIN_TLS: production's services read");
  });

  it("passes staging's own names, and the example this repository ships", async () => {
    const own =
      "INTERNAL_API_SECRET_STAGING=x\nPOSTGRES_PASSWORD_STAGING=x\nAPI_REPLICAS_STAGING=1\nCRM_ADAPTER=mock\n";
    const result = await withFiles("OTHER=1\n", own, `guard_staging "$S" ${composeFiles}`);
    expect(result.code, result.err).toBe(0);
    const example = await bash(`source ${lib}\nguard_staging infra/env/staging.env.example ${composeFiles}`);
    expect(example.code, example.err).toBe(0);
  });
});

describe("compose_value, the way Compose substitutes ${KEY:-DEFAULT}", () => {
  async function value(prod: string, staging: string | null, shell = "") {
    const result = await withFiles(
      prod,
      staging,
      `${shell}\nprintf '[%s]' "$(compose_value API_REPLICAS 2 "$P" "$S")"`,
    );
    expect(result.code, result.err).toBe(0);
    return result.out;
  }

  it("falls back to the default", async () => {
    expect(await value("OTHER=1\n", null)).toBe("[2]");
  });

  it("reads production.env", async () => {
    expect(await value("API_REPLICAS=3\n", "OTHER=1\n")).toBe("[3]");
  });

  it("lets the later file win", async () => {
    expect(await value("API_REPLICAS=3\n", "API_REPLICAS=1\n")).toBe("[1]");
  });

  it("lets a later empty assignment blank an earlier value, which then takes the default", async () => {
    expect(await value("API_REPLICAS=3\n", "API_REPLICAS=\n")).toBe("[2]");
  });

  it("lets the shell win over both files, and an empty shell value take the default", async () => {
    expect(await value("API_REPLICAS=3\n", "API_REPLICAS=1\n", "export API_REPLICAS=4")).toBe("[4]");
    expect(await value("API_REPLICAS=3\n", null, "export API_REPLICAS=")).toBe("[2]");
  });
});

describe("compose_value matches Compose", () => {
  const image = "ghcr.io/example/bbc-api:abc1234";
  const cases: { prod: string; staging: string }[] = [
    { prod: "", staging: "" },
    { prod: "API_REPLICAS=3\n", staging: "" },
    { prod: "API_REPLICAS=3\n", staging: "API_REPLICAS=1\n" },
    { prod: "API_REPLICAS=3\n", staging: "API_REPLICAS=\n" },
    { prod: "API_REPLICAS_STAGING=1\n", staging: "" },
    { prod: "API_REPLICAS_STAGING=3\n", staging: "API_REPLICAS_STAGING=1   # one is enough\n" },
  ];

  if (dockerReason) {
    it("needs docker compose", () => {
      console.log(`compose_value parity skipped: ${dockerReason}`);
      if (process.env.CI) expect(dockerReason).toBeNull();
    });
  } else {
    for (const [i, c] of cases.entries()) {
      it(`case ${i + 1}: the replicas deploy.sh scales to are the replicas Compose sets`, async () => {
        const dir = mkdtempSync(join(tmpdir(), "bbc-replicas-"));
        const prod = join(dir, "production.env");
        const stg = join(dir, "staging.env");
        writeFileSync(prod, `API_IMAGE=${image}\nAPI_IMAGE_STAGING=${image}\nPOSTGRES_PASSWORD=x\n${c.prod}`);
        writeFileSync(stg, `API_IMAGE_STAGING=${image}\n${c.staging}`);
        const env = Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key !== "API_REPLICAS" && key !== "API_REPLICAS_STAGING"),
        );
        const files = [
          "-f",
          "infra/docker-compose.yml",
          "-f",
          "infra/compose.prod.yml",
          "-f",
          "infra/compose.staging.yml",
        ];
        const proc = spawnSync(
          "docker",
          ["compose", ...files, "--env-file", prod, "--env-file", stg, "config", "--format", "json"],
          { cwd: root, encoding: "utf8", env },
        );
        const ours = spawnSync(
          "bash",
          [
            "-c",
            `source ${lib}; printf '%s %s' "$(compose_value API_REPLICAS 2 "$1" "$2")" "$(compose_value API_REPLICAS_STAGING 2 "$1" "$2")"`,
            "bash",
            prod,
            stg,
          ],
          { cwd: root, encoding: "utf8", env },
        );
        rmSync(dir, { recursive: true, force: true });
        expect(proc.status, proc.stderr).toBe(0);
        expect(ours.status, ours.stderr).toBe(0);
        const services = (JSON.parse(proc.stdout) as { services: Record<string, { deploy?: { replicas?: number } }> })
          .services;
        expect(ours.stdout).toBe(`${services.api?.deploy?.replicas} ${services["api-staging"]?.deploy?.replicas}`);
      });
    }
  }
});

describe("rotate-secret.sh", () => {
  /** Runs a copy of the script beside its own env files, in a throwaway infra/ directory; returns the files after. */
  async function rotate(files: Record<string, string>, args: string) {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    mkdirSync(join(dir, "infra", "env"), { recursive: true });
    for (const name of ["rotate-secret.sh", "env-value.sh", "docker-compose.yml"]) {
      copyFileSync(join(root, "infra", name), join(dir, "infra", name));
    }
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, "infra", "env", name), body);
    const result = await bash(`bash ${shPath(join(dir, "infra", "rotate-secret.sh"))} ${args}`);
    const after = Object.keys(files).map((name) => readFileSync(join(dir, "infra", "env", name), "utf8"));
    rmSync(dir, { recursive: true, force: true });
    return { ...result, after };
  }

  it("never promotes into a key the file does not set, and keeps the new secret", async () => {
    const result = await rotate({ "production.env": "OTHER=1\nFOO_NEXT=abc123\n" }, "production FOO --promote");
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("has no FOO= line to promote FOO_NEXT into");
    expect(result.after[0]).toContain("FOO_NEXT=abc123");
  });

  it("sends staging's internal secret to INTERNAL_API_SECRET_STAGING", async () => {
    const result = await rotate({ "staging.env": "INTERNAL_API_SECRET_STAGING=old\n" }, "staging INTERNAL_API_SECRET");
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("staging's secret is INTERNAL_API_SECRET_STAGING in staging.env");
  });
});

describe("restore.sh (ADR-IMPL-077)", () => {
  /** A copy of restore.sh in a throwaway infra/, its two questions answered, with a `docker` that records each command
   *  (the compose files and env file left out) and answers the checks; `sleep` returns at once. */
  async function restore(opts: { promoted: boolean | "refused"; workerReady: boolean; rejecting?: number }) {
    // "refused": the recovery check fails as a password the restored database does not take would make it fail.
    const recovery =
      opts.promoted === "refused"
        ? `echo 'psql: error: FATAL:  password authentication failed for user "bbc"' >&2; return 2`
        : `echo ${opts.promoted ? "f" : "t"}`;
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    try {
      mkdirSync(join(dir, "infra", "env"), { recursive: true });
      for (const name of ["restore.sh", "docker-compose.yml", "compose.prod.yml"]) {
        copyFileSync(join(root, "infra", name), join(dir, "infra", name));
      }
      writeFileSync(join(dir, "infra", "env", "production.env"), "OTHER=1\n");
      const log = join(dir, "docker.log");
      writeFileSync(log, "");
      const result = await bash(`
        export LOG=${JSON.stringify(log.replace(/\\/g, "/"))} # absolute: restore.sh changes directory
        docker() {
          echo "$*" >> "$LOG"
          case "$*" in
            *" exec -T postgres pg_isready "*)
              # The first opts.rejecting answers are a restore still short of a consistent state.
              n=$(( $(cat "$LOG.ready" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$LOG.ready"
              if (( n <= ${opts.rejecting ?? 0} )); then echo "/var/run/postgresql:5432 - rejecting connections"; return 1; fi
              echo "/var/run/postgresql:5432 - accepting connections" ;;
            *" exec -T postgres psql "*"pg_is_in_recovery"*) ${recovery} ;;
            *" exec -T postgres psql "*) echo 8 ;;
            *" ps -q worker") echo ct-worker ;;
            "exec ct-worker bun -e "*"http://localhost:8001/ready"*) return ${opts.workerReady ? 0 : 1} ;;
          esac
        }
        sleep() { :; }
        export -f docker sleep
        printf 'production\nyes\n' | bash ${shPath(join(dir, "infra", "restore.sh"))}`);
      const commands = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((l) => l.replace(/(-f|--env-file) \S+ /g, ""));
      return { ...result, commands };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const at = (commands: string[], prefix: string) => commands.findIndex((c) => c.startsWith(prefix));
  const starts = (commands: string[]) => commands.filter((c) => /^compose (up|start|restart) /.test(c));
  const probes = (commands: string[]) => commands.filter((c) => c.startsWith("exec ct-worker bun -e"));

  it("stops the worker with the API and cron; once promoted, starts the API and the worker, and cron after /ready", async () => {
    const { code, out, commands } = await restore({ promoted: true, workerReady: true });
    expect(code).toBe(0);
    expect(out).toContain("restore complete");
    expect(commands[0]).toBe("compose stop api worker cron");
    const restored = at(commands, "compose exec -T -u postgres postgres pgbackrest");
    const promoted = commands.findIndex((c) => c.includes("pg_is_in_recovery"));
    const checked = commands.findIndex((c) => c.includes("information_schema.schemata"));
    const ready = at(commands, "exec ct-worker bun -e");
    expect([0 < restored, restored < promoted, promoted < checked, checked < ready]).toEqual([true, true, true, true]);
    // Postgres restarted once; then the API and the worker, then cron after the one /ready probe it took.
    expect(starts(commands)).toEqual([
      "compose restart postgres",
      "compose up -d --no-deps api worker",
      "compose up -d --no-deps cron",
    ]);
    expect(commands.indexOf("compose up -d --no-deps api worker")).toBeLessThan(ready);
    expect(commands.indexOf("compose up -d --no-deps cron")).toBeGreaterThan(ready);
    expect(probes(commands)).toHaveLength(1);
    expect(probes(commands)[0]).toContain("http://localhost:8001/ready");
  });

  it("a Postgres still replaying WAL starts nothing", async () => {
    const { code, out, commands } = await restore({ promoted: false, workerReady: true });
    expect(code).toBe(1);
    expect(out).toContain("still replaying WAL after an hour");
    expect(starts(commands)).toEqual(["compose restart postgres"]);
    expect(commands.some((c) => c.includes("information_schema.schemata"))).toBe(false);
  });

  it("a recovery check Postgres refuses stops the restore at once and says why, starting nothing", async () => {
    const { code, out, commands } = await restore({ promoted: "refused", workerReady: true });
    expect(code).toBe(1);
    expect(out).toContain("refuses the recovery check");
    expect(out).toContain("password authentication failed");
    expect(out).not.toContain("still replaying WAL");
    expect(commands.filter((c) => c.includes("pg_is_in_recovery"))).toHaveLength(3);
    expect(starts(commands)).toEqual(["compose restart postgres"]);
  });

  it("a restore that rejects connections past the old minute, short of consistency, is waited on", async () => {
    const { code, out } = await restore({ promoted: true, workerReady: true, rejecting: 40 });
    expect(code).toBe(0);
    expect(out).toContain("restore complete");
  });

  it("a worker's /ready probe gives up after five seconds", async () => {
    const { commands } = await restore({ promoted: true, workerReady: true });
    expect(probes(commands)[0]).toContain("AbortSignal.timeout(5000)");
  });

  it("a worker whose /ready stays red leaves cron stopped and says how to start it", async () => {
    const { code, out, commands } = await restore({ promoted: true, workerReady: false });
    expect(code).toBe(1);
    expect(out).toContain("cron NOT started");
    expect(out).toContain("up -d --no-deps cron");
    expect(starts(commands)).toEqual(["compose restart postgres", "compose up -d --no-deps api worker"]);
    expect(probes(commands)).toHaveLength(12);
  });
});

describe("each environment's internal secret, as Compose hands it out", () => {
  if (dockerReason) {
    it("needs docker compose", () => {
      console.log(`internal secret parity skipped: ${dockerReason}`);
      if (process.env.CI) expect(dockerReason).toBeNull();
    });
    return;
  }

  it("gives production's cron production's secret, and staging's services staging's", () => {
    const image = "ghcr.io/example/bbc-api:abc1234";
    const dir = mkdtempSync(join(tmpdir(), "bbc-secrets-"));
    const prod = join(dir, "production.env");
    const stg = join(dir, "staging.env");
    writeFileSync(prod, `API_IMAGE=${image}\nPOSTGRES_PASSWORD=x\nINTERNAL_API_SECRET=production-secret\n`);
    writeFileSync(stg, `API_IMAGE_STAGING=${image}\nINTERNAL_API_SECRET_STAGING=staging-secret\n`);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("INTERNAL_API_SECRET")),
    );
    const files = ["-f", "infra/docker-compose.yml", "-f", "infra/compose.prod.yml", "-f", "infra/compose.staging.yml"];
    const proc = spawnSync(
      "docker",
      ["compose", ...files, "--env-file", prod, "--env-file", stg, "config", "--format", "json"],
      { cwd: root, encoding: "utf8", env },
    );
    rmSync(dir, { recursive: true, force: true });
    expect(proc.status, proc.stderr).toBe(0);
    const services = (JSON.parse(proc.stdout) as { services: Record<string, { environment?: Record<string, string> }> })
      .services;
    const secret = (name: string) => services[name]?.environment?.INTERNAL_API_SECRET;
    expect(secret("cron")).toBe("production-secret");
    for (const name of ["api-staging", "worker-staging", "cron-staging"]) expect(secret(name)).toBe("staging-secret");
  });
});

describe("GlitchTip profile", () => {
  async function wanted(content: string) {
    const result = await withEnv(content, `if glitchtip_wanted "$F"; then echo on; else echo off; fi`);
    expect(result.code, result.err).toBe(0);
    return result.out.trim();
  }

  it("is on only for GLITCHTIP=on", async () => {
    expect(await wanted("GLITCHTIP=on\n")).toBe("on");
    expect(await wanted("GLITCHTIP=on   # I2\r\n")).toBe("on");
  });

  it("stays off when absent, off, empty, or a comment Compose would keep", async () => {
    for (const content of [
      "OTHER=1\n",
      "GLITCHTIP=off\n",
      "GLITCHTIP=\n",
      "GLITCHTIP=     # on|off\n",
      "GLITCHTIP=ON\n",
    ]) {
      expect(await wanted(content)).toBe("off");
    }
  });
});

describe("monitoring and media profiles (ADR-IMPL-073)", () => {
  async function wanted(fn: "monitoring_wanted" | "media_wanted", content: string) {
    const result = await withEnv(content, `if ${fn} "$F"; then echo on; else echo off; fi`);
    expect(result.code, result.err).toBe(0);
    return result.out.trim();
  }

  it("each is on only for its own key set to on", async () => {
    expect(await wanted("monitoring_wanted", "MONITORING=on\n")).toBe("on");
    expect(await wanted("monitoring_wanted", "MONITORING=on   # metrics only\r\n")).toBe("on");
    expect(await wanted("media_wanted", "MEDIA=on\n")).toBe("on");
    expect(await wanted("monitoring_wanted", "MEDIA=on\n")).toBe("off");
    expect(await wanted("media_wanted", "MONITORING=on\n")).toBe("off");
  });

  it("stay off when absent, off, empty, or a comment Compose would keep", async () => {
    for (const [fn, key] of [
      ["monitoring_wanted", "MONITORING"],
      ["media_wanted", "MEDIA"],
    ] as const) {
      for (const content of ["OTHER=1\n", `${key}=off\n`, `${key}=\n`, `${key}=     # on|off\n`, `${key}=ON\n`]) {
        expect(await wanted(fn, content)).toBe("off");
      }
    }
  });

  it("staging.env keeps its own OPS_WEBHOOK; the monitoring's keys are production's alone", async () => {
    const composeFiles = "infra/docker-compose.yml infra/compose.prod.yml";
    const own = await withFiles(
      "OTHER=1\n",
      "OPS_WEBHOOK=https://hooks.example.com/staging\nAPI_MEMORY_STAGING=512m\n",
      `guard_staging "$S" ${composeFiles}`,
    );
    expect(own.code, own.err).toBe(0);
    const grafana = await withFiles(
      "OTHER=1\n",
      "GRAFANA_ADMIN_PASSWORD=x\nGRAFANA_ALERTS_WEBHOOK=https://hooks.example.com/x\nVM_PASSWORD=x\n",
      `guard_staging "$S" ${composeFiles}`,
    );
    expect(grafana.code).not.toBe(0);
    expect(grafana.err).toContain(
      "sets GRAFANA_ADMIN_PASSWORD GRAFANA_ALERTS_WEBHOOK VM_PASSWORD: production's services read",
    );
  });

  it("the example this repository ships keeps both off: MinIO waits for R1b, the monitoring for its owner", async () => {
    const example = readFileSync(join(root, "infra/env/production.env.example"), "utf8");
    expect(await wanted("monitoring_wanted", example)).toBe("off");
    expect(await wanted("media_wanted", example)).toBe("off");
  });
});

describe("Grafana's database role and Postgres's settings (ADR-IMPL-077)", () => {
  /** A compose command that says what it was asked and what it read on stdin, on stderr. */
  const recordingCompose = `dc() { echo "ARGV $*" >&2; cat >&2; }`;

  it("set_monitor_password: the password through stdin only, after the session stops logging and recording", async () => {
    const result = await withEnv(
      `GRAFANA_PG_PASSWORD="it's-a-pw"\n`,
      `${recordingCompose}\nset_monitor_password "$F" dc compose -f x.yml; echo "rc=$?"`,
    );
    expect(result.out.trim()).toBe("rc=0");
    const [argv, ...stdin] = result.err.trim().split("\n");
    expect(argv).toBe("ARGV compose -f x.yml exec -T postgres psql -q -v ON_ERROR_STOP=1 -U bbc -d bbc");
    expect(stdin).toEqual([
      "SET log_statement = 'none';",
      "SET log_min_error_statement = panic;",
      "SET log_min_duration_statement = -1;",
      "SET pg_stat_statements.track_utility = off;",
      "ALTER ROLE bbc_monitor LOGIN PASSWORD 'it''s-a-pw';",
    ]);
  });

  it("set_monitor_password sends nothing without a real password", async () => {
    for (const content of ["OTHER=1\n", "GRAFANA_PG_PASSWORD=\n", "GRAFANA_PG_PASSWORD=   # openssl rand\n"]) {
      const result = await withEnv(content, `${recordingCompose}\nset_monitor_password "$F" dc; echo "rc=$?"`);
      expect(result.out.trim()).toBe("rc=1");
      expect(result.err).toBe("");
    }
  });

  /** A compose command and a docker whose Postgres services run `running`, keyed by service; compose asks for jit=off. */
  const composeRunning = (running: Record<string, string>) => `
    dc() {
      case "$*" in
        "config --format json") echo '{"services":{"postgres":{"command":["postgres","-c","jit=off"]},"postgres-staging":{"command":["postgres","-c","jit=off"]},"api":{"command":null}}}' ;;
        ${Object.keys(running)
          .map((svc) => `"ps -q ${svc}") echo ct-${svc} ;;`)
          .join("\n        ")}
        *) return 0 ;;
      esac
    }
    docker() {
      case "$*" in
        ${Object.entries(running)
          .map(([svc, args]) => `"inspect -f {{json .Args}} ct-${svc}") echo '${args}' ;;`)
          .join("\n        ")}
        *) return 1 ;;
      esac
    }`;

  it("stale_postgres names each running Postgres whose command line is not compose's, and only those", async () => {
    const stale = async (running: Record<string, string>) =>
      (await withEnv("", `${composeRunning(running)}\nstale_postgres dc`)).out.trim();
    expect(
      await stale({ postgres: '["postgres","-c","jit=on"]', "postgres-staging": '["postgres", "-c", "jit=off"]' }),
    ).toBe("postgres");
    expect(await stale({ "postgres-staging": '["postgres","-c","jit=off","-c","x=1"]' })).toBe("postgres-staging");
    expect(await stale({ postgres: '["postgres","-c","jit=off"]' })).toBe(""); // staging not running: left out
  });

  /** A copy of deploy.sh in a throwaway infra/ with these env files and the docker given, as far as it gets. */
  async function deploy(mode: string, prod: string, docker: string) {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    mkdirSync(join(dir, "infra", "env"), { recursive: true });
    for (const name of ["deploy.sh", "env-value.sh", "docker-compose.yml", "compose.prod.yml", "compose.staging.yml"]) {
      copyFileSync(join(root, "infra", name), join(dir, "infra", name));
    }
    writeFileSync(
      join(dir, "infra", "env", "production.env"),
      `POSTGRES_PASSWORD=a1\nPOSTGRES_PASSWORD_STAGING=b2\n${prod}`,
    );
    writeFileSync(join(dir, "infra", "env", "staging.env"), "OTHER=1\n");
    const result = await bash(
      `${docker}\nexport -f docker\nbash ${shPath(join(dir, "infra", "deploy.sh"))} ${mode} ghcr.io/x/bbc-api:abcdef1`,
    );
    rmSync(dir, { recursive: true, force: true });
    return result;
  }
  const monitored =
    "MONITORING=on\nGRAFANA_ADMIN_PASSWORD=x\nGRAFANA_ALERTS_WEBHOOK=https://hooks.example.com/x\nVM_PASSWORD=x\nGRAFANA_SECRET_KEY=x\n";
  const noDaemon = `docker() { return 1; }`;

  it("only a production deploy asks for the database role's password, the one that gives it", async () => {
    const production = await deploy("production", monitored, noDaemon);
    expect(production.out).toContain("❌ MONITORING=on needs GRAFANA_PG_PASSWORD");
    const staging = await deploy("staging", monitored, noDaemon);
    expect(staging.out).not.toContain("GRAFANA_PG_PASSWORD");
    expect(staging.out).toContain("1/8 pre-deploy dump (staging)");
  });

  it("a deploy says when Postgres runs older settings than compose, and goes on", async () => {
    const docker = `docker() {
      case "$*" in
        *" config --format json") echo '{"services":{"postgres":{"command":["postgres","-c","jit=off"]}}}' ;;
        *" ps -q postgres") echo ct-pg ;;
        "inspect -f {{json .Args}} ct-pg") echo '["postgres","-c","jit=on"]' ;;
        *) return 1 ;;
      esac
    }`;
    const result = await deploy("staging", "OTHER=1\n", docker);
    expect(result.out).toContain(
      "⚠ deploy staging: Postgres (postgres) runs older settings than compose: recreate it in a quiet minute: docker compose",
    );
    expect(result.out).toContain("up -d --no-deps postgres");
    expect(result.out).toContain("1/8 pre-deploy dump (staging)");
  });
});

const opensslReason =
  spawnSync("openssl", ["version"], { encoding: "utf8" }).status === 0 ? null : "openssl unavailable";
// Git Bash on Windows has no real file modes (chmod 600 reads back as 644), so the certificate cases run on Linux and macOS.
const certReason = process.platform === "win32" ? "file modes" : opensslReason;

describe("origin certificate", () => {
  async function check(prod: string, staging: string | null = null) {
    return withFiles(prod, staging, `origin_tls_check "$P" "$S"`);
  }

  it("passes with ORIGIN_TLS absent or off, and no certificate anywhere", async () => {
    for (const content of ["OTHER=1\n", "ORIGIN_TLS=off\n", "ORIGIN_TLS=\n", "ORIGIN_TLS=off   # on after R1b\n"]) {
      const result = await check(content);
      expect(result.code, `${content}: ${result.err}`).toBe(0);
    }
  });

  it("refuses a value Caddy would read as something else", async () => {
    for (const content of ["ORIGIN_TLS=     # on|off\n", "ORIGIN_TLS=yes\n", "ORIGIN_TLS=${MODE}\n"]) {
      const result = await check(content);
      expect(result.code).not.toBe(0);
      expect(result.err).toContain("ORIGIN_TLS must be on or off");
    }
  });

  it("reads ORIGIN_TLS as Compose hands it to Caddy: an exported value wins over the files", async () => {
    const result = await withFiles(
      "ORIGIN_TLS=off\n",
      null,
      `export ORIGIN_TLS=on ORIGIN_CERT_DIR=/no/such/origin\norigin_tls_check "$P" "$S"`,
    );
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("ORIGIN_TLS=on, but /no/such/origin/cert.pem or /no/such/origin/key.pem is missing");
  });

  it("refuses a relative ORIGIN_CERT_DIR, from either file", async () => {
    expect((await check("ORIGIN_CERT_DIR=certs\n")).err).toContain("ORIGIN_CERT_DIR must be an absolute path");
    expect((await check("OTHER=1\n", "ORIGIN_CERT_DIR=certs\n")).err).toContain("must be an absolute path");
  });

  it("names the missing files", async () => {
    const result = await check("ORIGIN_TLS=on\nORIGIN_CERT_DIR=/no/such/origin\n");
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("/no/such/origin/cert.pem or /no/such/origin/key.pem is missing");
  });

  describe("with a certificate", () => {
    if (certReason) {
      it("needs openssl and file modes", () => {
        console.log(`origin certificate cases skipped: ${certReason}`);
        if (process.env.CI) expect(certReason).toBeNull();
      });
      return;
    }

    const domains = "API_DOMAIN=api.example.com\nAPI_DOMAIN_STAGING=api-staging.example.com\n";
    /** Makes cert.pem and key.pem in a fresh directory: `days` valid, naming `names`, then runs `after` there. */
    async function withCert(days: number, names: string, after: string, extraEnv = "") {
      const dir = mkdtempSync(join(tmpdir(), "bbc-origin-"));
      const make = spawnSync(
        "bash",
        [
          "-c",
          `cd "$1" && openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days ${days} ` +
            `-subj "/CN=origin" -addext "subjectAltName=${names}" -keyout key.pem -out cert.pem 2>/dev/null && ` +
            `chmod 600 key.pem && ${after}`,
          "bash",
          dir,
        ],
        { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
      );
      expect(make.status, make.stderr).toBe(0);
      const result = await check(`ORIGIN_TLS=on\nORIGIN_CERT_DIR=${dir}\n${domains}${extraEnv}`);
      rmSync(dir, { recursive: true, force: true });
      return result;
    }
    const both = "DNS:api.example.com,DNS:api-staging.example.com";

    it("passes a certificate that matches its key, lasts, and names both domains", async () => {
      const result = await withCert(400, both, "true");
      expect(result.code, result.err).toBe(0);
      expect((await withCert(400, "DNS:*.example.com", "true")).code).toBe(0);
    });

    it("refuses a key others can read", async () => {
      const result = await withCert(400, both, "chmod 640 key.pem");
      expect(result.err).toContain("key.pem must be readable by its owner only");
    });

    it("refuses a key that is not the certificate's", async () => {
      const other =
        "openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out key.pem 2>/dev/null && chmod 600 key.pem";
      expect((await withCert(400, both, other)).err).toContain("key.pem is not the key of");
    });

    // A warning, not a stop: "Roll back right now" must still run while a renewal is on its way.
    it("passes a certificate that ends within 30 days, and says so", async () => {
      const result = await withCert(10, both, "true");
      expect(result.code, result.err).toBe(0);
      expect(result.err).toContain("expires within 30 days");
    });

    it("refuses a certificate that has expired, or is not one", async () => {
      expect((await withCert(400, both, "echo junk > cert.pem")).err).toContain(
        "has expired, or does not read as a certificate",
      );
    });

    it("refuses a certificate that does not name the staging domain", async () => {
      expect((await withCert(400, "DNS:api.example.com", "true")).err).toContain(
        "does not cover api-staging.example.com",
      );
    });
  });
});

describe("Postgres's planning settings (ADR-IMPL-077)", () => {
  /** The `-c key=value` pairs of a compose service's command. */
  const settingsOf = async (file: string, service: string) => {
    const doc = Bun.YAML.parse(await Bun.file(join(root, file)).text()) as {
      services: Record<string, { command: string[] }>;
    };
    const command = doc.services[service]!.command;
    const out: Record<string, string> = {};
    command.forEach((arg, i) => {
      if (command[i - 1] !== "-c") return;
      const [k, ...v] = arg.split("=");
      out[k!] = v.join("=");
    });
    return out;
  };
  const PLANNING = [
    "effective_cache_size",
    "work_mem",
    "jit",
    "random_page_cost",
    "shared_preload_libraries",
    "auto_explain.log_parameter_max_length",
    "pg_stat_statements.track_planning",
    "log_min_duration_statement",
    "log_parameter_max_length",
    "log_error_verbosity",
    "track_io_timing",
  ];

  it("staging plans as production does; both log the slow statements, staging their plans too", async () => {
    const prod = await settingsOf("infra/docker-compose.yml", "postgres");
    const staging = await settingsOf("infra/compose.staging.yml", "postgres-staging");
    for (const key of PLANNING) expect(staging[key], key).toBe(prod[key]);
    expect(prod.jit).toBe("off");
    expect(prod.shared_preload_libraries).toBe("pg_stat_statements,auto_explain");
    // auto_explain.log_min_duration is the one planning setting the two do not share: production keeps auto_explain
    // loaded but off, since a custom plan can carry a statement's bound values as text (an email, a token), and a
    // tuning reads generic plans instead (RUNBOOK § Tuning a statement); staging, with test data, logs the plans over
    // 500 ms.
    expect(prod["auto_explain.log_min_duration"]).toBeUndefined();
    expect(staging["auto_explain.log_min_duration"]).toBe("500ms");
    expect(prod["auto_explain.log_parameter_max_length"]).toBe("0");
    expect(prod.log_min_duration_statement).toBe("250");
    expect(prod.log_parameter_max_length).toBe("0");
    // An error's DETAIL names the row it met (`Key (email)=(…) already exists`): left out.
    expect(prod.log_error_verbosity).toBe("terse");
  });
});

describe("PgBouncer after a Postgres restart (X6)", () => {
  it("both poolers try the server again after a second and keep a client waiting ten seconds at most", async () => {
    for (const [file, service] of [
      ["infra/docker-compose.yml", "pgbouncer"],
      ["infra/compose.staging.yml", "pgbouncer-staging"],
    ] as const) {
      const doc = Bun.YAML.parse(await Bun.file(join(root, file)).text()) as {
        services: Record<string, { environment: Record<string, string> }>;
      };
      const env = doc.services[service]!.environment;
      // edoburu/pgbouncer's entrypoint writes each into pgbouncer.ini as server_login_retry / query_wait_timeout.
      expect([env.SERVER_LOGIN_RETRY, env.QUERY_WAIT_TIMEOUT], service).toEqual(["1", "10"]);
    }
  });
});

describe("who the kernel kills first (A-R1)", () => {
  it("the monitoring goes after staging and before production", async () => {
    const doc = Bun.YAML.parse(await Bun.file(join(root, "infra/docker-compose.yml")).text()) as {
      services: Record<string, { oom_score_adj?: number }>;
    };
    for (const svc of ["victoriametrics", "grafana", "node-exporter", "cadvisor"])
      expect(doc.services[svc]!.oom_score_adj, svc).toBe(300);
    expect(doc.services.postgres!.oom_score_adj).toBe(-500);
  });
});

describe("Grafana's first start (A-R4)", () => {
  it("has two minutes before a failed probe counts, and the deploy waits past them", async () => {
    const doc = Bun.YAML.parse(await Bun.file(join(root, "infra/docker-compose.yml")).text()) as {
      services: Record<string, { healthcheck: { start_period?: string; interval: string; retries: number } }>;
    };
    const hc = doc.services.grafana!.healthcheck;
    expect(hc.start_period).toBe("120s");
    const deploy = await Bun.file(join(root, "infra/deploy.sh")).text();
    const wait = Number(/--wait-timeout (\d+) victoriametrics grafana/.exec(deploy)?.[1]);
    // start period, then every retry 10 s apart, must fit in the deploy's wait.
    expect(wait).toBeGreaterThanOrEqual(120 + hc.retries * Number.parseInt(hc.interval));
  });
});

describe("Grafana's provisioning after a deploy (A-D1)", () => {
  it("a file changed after the container started counts; one from before, an empty start time, nothing", async () => {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    try {
      mkdirSync(join(dir, "alerting"));
      const file = join(dir, "alerting", "alerts.yml");
      writeFileSync(file, "x\n");
      const at = (iso: string) => {
        const d = new Date(iso);
        spawnSync("touch", ["-d", d.toISOString(), file]);
      };
      const changed = async (started: string) =>
        (
          await bash(`source ${lib}\nchanged_since ${shPath(dir)} ${JSON.stringify(started)} && echo yes || echo no`)
        ).out.trim();
      at("2026-10-28T20:00:05Z");
      // docker inspect's .State.StartedAt, nanoseconds and all.
      expect(await changed("2026-10-28T20:00:00.123456789Z")).toBe("yes");
      at("2026-10-28T19:59:55Z");
      expect(await changed("2026-10-28T20:00:00.123456789Z")).toBe("no");
      expect(await changed("")).toBe("no");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a provisioning directory that cannot be read is a failure the deploy reports, not 'nothing changed'", async () => {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    try {
      const missing = join(dir, "provisioning");
      const scan = await bash(`source ${lib}\nchanged_since ${shPath(missing)} 2026-10-28T20:00:00Z; echo "rc=$?"`);
      expect(scan.out.trim()).toBe("rc=2");
      expect(scan.err).toContain("provisioning");
      const log = join(dir, "calls.log");
      const refreshed = await bash(
        `source ${lib}\ndc() { echo "$*" >> ${shPath(log)}; }\n` +
          `refresh_grafana ${shPath(missing)} 2026-10-28T20:00:00Z dc; echo "rc=$?"`,
      );
      expect(refreshed.out.trim()).toBe("rc=1");
      expect(spawnSync("test", ["-e", log]).status).not.toBe(0); // nothing restarted
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** refresh_grafana with a compose command that records its calls and fails the ones named in `fail`. */
  async function refresh(changedAfterStart: boolean, fail: string) {
    const dir = mkdtempSync(join(root, ".tmp-env-profile-"));
    try {
      const file = join(dir, "alerts.yml");
      writeFileSync(file, "x\n");
      spawnSync("touch", ["-d", changedAfterStart ? "2026-10-28T20:00:05Z" : "2026-10-28T19:59:55Z", file]);
      const log = join(dir, "calls.log");
      const result = await bash(
        `source ${lib}\n` +
          `dc() { echo "$*" >> ${shPath(log)}; case "$*" in ${fail ? `*"${fail}"*) return 1 ;;` : ""} *) return 0 ;; esac; }\n` +
          `refresh_grafana ${shPath(dir)} 2026-10-28T20:00:00.123456789Z dc; echo "rc=$?"`,
      );
      let calls: string[] = [];
      try {
        calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
      } catch {
        calls = [];
      }
      return { rc: result.out.trim(), calls };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("a changed provisioning restarts Grafana and waits for its healthcheck; unchanged, nothing is done", async () => {
    expect(await refresh(true, "")).toEqual({
      rc: "rc=0",
      calls: ["restart grafana", "up -d --no-deps --wait --wait-timeout 240 grafana"],
    });
    expect(await refresh(false, "")).toEqual({ rc: "rc=0", calls: [] });
  });

  it("a Grafana that does not come back healthy, or does not restart, is a failure the deploy reports", async () => {
    expect((await refresh(true, "--wait")).rc).toBe("rc=1");
    const noRestart = await refresh(true, "restart");
    expect(noRestart).toEqual({ rc: "rc=1", calls: ["restart grafana"] });
    // deploy.sh sets MONITORING_FAILED when refresh_grafana fails, as for a monitoring that did not start.
    const deploy = await Bun.file(join(root, "infra/deploy.sh")).text();
    expect(deploy).toMatch(/! refresh_grafana [^\n]*\n[^\n]*notify[^\n]*\n\s*MONITORING_FAILED=1/);
  });
});

describe("PgBouncer's RECONNECT after the migration (H2)", () => {
  it("a worker without PGBOUNCER_ADMIN_URL fails the step, so the deploy prints that RECONNECT was not sent", async () => {
    const deploy = await Bun.file(join(root, "infra/deploy.sh")).text();
    const program = deploy.match(/"\$WORKER" bun -e '([^']+)' \\\n\s*\|\| echo "⚠ PgBouncer RECONNECT failed/)?.[1];
    expect(program).toBeDefined();
    const env = { ...process.env };
    delete env.PGBOUNCER_ADMIN_URL;
    const run = spawnSync(process.execPath, ["-e", program as string], { cwd: join(root, "packages/db"), env });
    expect(run.status).not.toBe(0);
    expect(run.stderr.toString()).toContain("PGBOUNCER_ADMIN_URL is not set");
  });

  it("a PgBouncer that lets the worker in and never answers RECONNECT fails the step within 10 s", async () => {
    const deploy = await Bun.file(join(root, "infra/deploy.sh")).text();
    const program = deploy.match(/"\$WORKER" bun -e '([^']+)' \\\n\s*\|\| echo "⚠ PgBouncer RECONNECT failed/)?.[1];
    expect(program).toBeDefined();
    // Answers the startup (AuthenticationOk, ReadyForQuery), then never answers the query: connect_timeout is past.
    let greeted = false;
    const ready = new Uint8Array([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]);
    const silent = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data(socket) {
          if (!greeted) socket.write(ready);
          greeted = true;
        },
      },
    });
    try {
      const started = performance.now();
      const run = Bun.spawn([process.execPath, "-e", program as string], {
        cwd: join(root, "packages/db"),
        env: { ...process.env, PGBOUNCER_ADMIN_URL: `postgres://pgbouncer:x@127.0.0.1:${silent.port}/pgbouncer` },
        stderr: "pipe",
      });
      const code = await run.exited;
      expect(code).not.toBe(0);
      expect(await new Response(run.stderr).text()).toContain("did not answer RECONNECT");
      expect(performance.now() - started).toBeLessThan(12_000);
    } finally {
      silent.stop(true);
    }
  }, 20_000);
});

describe("VictoriaMetrics' basic auth (A-S1)", () => {
  it("takes its password from the environment, never the command line, and Grafana's datasource sends it", async () => {
    const doc = Bun.YAML.parse(await Bun.file(join(root, "infra/docker-compose.yml")).text()) as {
      services: Record<string, { command?: string[]; environment?: Record<string, string> }>;
    };
    const vm = doc.services.victoriametrics!;
    expect(vm.command).toContain("-envflag.enable");
    expect(vm.command!.some((a) => a.includes("httpAuth") || a.includes("VM_PASSWORD"))).toBe(false);
    expect(vm.environment).toEqual({ httpAuth_username: "bbc", httpAuth_password: "${VM_PASSWORD:-}" });
    expect(doc.services.grafana!.environment!.VM_PASSWORD).toBe("${VM_PASSWORD:-}");
    const ds = Bun.YAML.parse(
      await Bun.file(join(root, "infra/monitoring/grafana/provisioning/datasources/victoriametrics.yml")).text(),
    ) as { datasources: { basicAuth?: boolean; basicAuthUser?: string; secureJsonData?: Record<string, string> }[] };
    expect(ds.datasources[0]).toMatchObject({
      basicAuth: true,
      basicAuthUser: "bbc",
      secureJsonData: { basicAuthPassword: "${VM_PASSWORD}" },
    });
  });

  it("a deploy and a bootstrap with MONITORING=on ask for it", async () => {
    for (const file of ["infra/deploy.sh", "infra/bootstrap.sh"]) {
      const text = await Bun.file(join(root, file)).text();
      expect(/for k in GRAFANA_ADMIN_PASSWORD [^;]*VM_PASSWORD/.test(text), file).toBe(true);
    }
  });
});

describe("Grafana's secret key (A-S2)", () => {
  it("comes from production.env, and a deploy and a bootstrap with MONITORING=on ask for it", async () => {
    const doc = Bun.YAML.parse(await Bun.file(join(root, "infra/docker-compose.yml")).text()) as {
      services: Record<string, { environment?: Record<string, string> }>;
    };
    expect(doc.services.grafana!.environment!.GF_SECURITY_SECRET_KEY).toBe("${GRAFANA_SECRET_KEY:-}");
    for (const file of ["infra/deploy.sh", "infra/bootstrap.sh"]) {
      const text = await Bun.file(join(root, file)).text();
      expect(/for k in GRAFANA_ADMIN_PASSWORD [^;]*GRAFANA_SECRET_KEY/.test(text), file).toBe(true);
    }
  });
});

describe("Grafana's alerts (A-R2, H1)", () => {
  it("seven rules, the CI check counts seven, and the kill and pause rules read what cAdvisor and the worker publish", async () => {
    const doc = Bun.YAML.parse(
      await Bun.file(join(root, "infra/monitoring/grafana/provisioning/alerting/alerts.yml")).text(),
    ) as { groups: { rules: { uid: string; data: { model: { expr?: string } }[] }[] }[] };
    const rules = doc.groups[0]!.rules;
    expect(rules).toHaveLength(7);
    const expr = (uid: string) => rules.find((r) => r.uid === uid)!.data[0]!.model.expr!;
    expect(expr("bbc-container-oom")).toContain("container_oom_events_total");
    expect(expr("bbc-queue-paused")).toContain('bbc_queue_paused{env="production"}');
    const validate = await Bun.file(join(root, ".github/workflows/validate.yml")).text();
    expect(validate).toContain(`wait_for /api/v1/provisioning/alert-rules length ${rules.length}`);
    // cAdvisor publishes the kills only with its oom_event metrics on.
    const compose = Bun.YAML.parse(await Bun.file(join(root, "infra/docker-compose.yml")).text()) as {
      services: Record<string, { command?: string[] }>;
    };
    expect(compose.services.cadvisor!.command!.some((a) => /--enable_metrics=.*oom_event/.test(a))).toBe(true);
  });
});

describe("the sample points CI runs the alerts on (A-Q1)", () => {
  it("hold every name an alert rule reads, each with the label keys the rule selects on", async () => {
    const doc = Bun.YAML.parse(
      await Bun.file(join(root, "infra/monitoring/grafana/provisioning/alerting/alerts.yml")).text(),
    ) as { groups: { rules: { uid: string; data: { model: { expr?: string } }[] }[] }[] };
    const sample = (await Bun.file(join(root, "infra/monitoring/ci/sample-metrics.txt")).text())
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    for (const rule of doc.groups[0]!.rules) {
      const expr = rule.data.find((d) => d.model.expr)!.model.expr!;
      for (const [, name, selector] of expr.matchAll(/([a-z_][a-z0-9_]*)\{([^}]*)\}/g)) {
        const keys = [...selector!.matchAll(/([a-z_]+)\s*(?:=~|!~|!=|=)/g)].map((m) => m[1]!);
        const points = sample.filter((l) => l.startsWith(`${name}{`));
        expect(points.length, `${rule.uid}: ${name}`).toBeGreaterThanOrEqual(2);
        for (const key of keys) expect(points[0], `${rule.uid}: ${name} ${key}`).toContain(`${key}="`);
      }
    }
  });
});

describe("migrations:destructive (ADR-IMPL-074)", () => {
  const lines = (sql: string) => findUnannounced(sql).map((p) => p.line);

  it("catches a column's type change with or without COLUMN, and with SET DATA TYPE", () => {
    expect(lines("ALTER TABLE t ALTER COLUMN c TYPE bigint;")).toEqual([1]);
    expect(lines("ALTER TABLE t ALTER c TYPE bigint;")).toEqual([1]);
    expect(lines("ALTER TABLE t ALTER COLUMN c SET DATA TYPE bigint;")).toEqual([1]);
    expect(lines("ALTER TABLE t ALTER c SET DATA TYPE bigint;")).toEqual([1]);
    expect(lines("ALTER TABLE t ALTER COLUMN type TYPE text;")).toEqual([1]);
    expect(findUnannounced("ALTER TABLE t ALTER c TYPE bigint;")[0]!.typeChange).toBe(true);
  });

  it("catches a statement split across lines, on the line its operation starts", () => {
    expect(lines("ALTER TABLE t\n  ALTER COLUMN c\n  TYPE bigint;")).toEqual([2]);
    expect(lines("ALTER TABLE t ADD COLUMN a int,\n  ALTER c SET DATA\n  TYPE bigint;")).toEqual([2]);
    expect(lines("DROP\n  TABLE t;")).toEqual([1]);
  });

  it("passes with the reason above the operation's line or above its statement", () => {
    expect(lines("-- destructive: widen to bigint\nALTER TABLE t ALTER c TYPE bigint;")).toEqual([]);
    expect(lines("-- destructive: widen to bigint\nALTER TABLE t\n  ALTER c TYPE bigint;")).toEqual([]);
    expect(lines("ALTER TABLE t\n  -- destructive: widen to bigint\n  ALTER c TYPE bigint;")).toEqual([]);
    expect(lines("-- destructive: one\nDROP TABLE a;\nDROP TABLE b;")).toEqual([3]);
  });

  it("leaves alone what changes no column's type", () => {
    expect(lines("ALTER TYPE status ADD VALUE 'closed';")).toEqual([]);
    expect(lines("ALTER TABLE t ALTER COLUMN c SET DEFAULT 0;")).toEqual([]);
    expect(lines("ALTER TABLE t ADD COLUMN type text;")).toEqual([]);
    expect(lines("ALTER TABLE t ALTER COLUMN type SET NOT NULL;")).toEqual([]);
    expect(lines("ALTER TABLE type ADD COLUMN a int;")).toEqual([]);
    expect(lines("DROP INDEX CONCURRENTLY i;")).toEqual([]);
    expect(lines("-- ALTER TABLE t ALTER c TYPE bigint;\nSELECT 1;")).toEqual([]);
  });

  it("still catches a DELETE without WHERE across lines", () => {
    expect(lines("SELECT 1;\nDELETE\n  FROM t;")).toEqual([2]);
    expect(lines("DELETE FROM t\n  WHERE id = 1;")).toEqual([]);
  });
});

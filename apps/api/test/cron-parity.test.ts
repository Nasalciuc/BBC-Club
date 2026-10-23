import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import { fileURLToPath } from "node:url";
import { testApp } from "./helpers/test-app";
import { renderCrontab } from "../src/cron/render";

const CRONTAB = fileURLToPath(new URL("../../../infra/cron/crontab", import.meta.url));
const MODULES = fileURLToPath(new URL("../../../packages/modules/", import.meta.url));

/** A job's name as a MODULE.md writes it: lower-case words joined by hyphens (`send-requests`). A one-word name
 *  (`dispatch`, `receipts`) cannot be told from a field the line quotes (`carrier`), so it is not checked here. */
const JOB_NAME = /^[a-z]+(?:-[a-z]+)+$/;
/** Where a MODULE.md says the jobs named before it in the line do not exist yet. */
const NOT_BUILT = /not (?:built|registered)/;

/** The jobs each MODULE.md's **Jobs:** line names as existing: every name in backticks after the line's last
 *  "not built" / "not registered" (the names before it are said not to exist). */
function jobsNamedAsExisting(): { module: string; job: string }[] {
  const out: { module: string; job: string }[] = [];
  for (const f of new Glob("*/*/MODULE.md").scanSync(MODULES)) {
    const line = readFileSync(`${MODULES}${f}`, "utf8")
      .split("\n")
      .find((l) => l.startsWith("**Jobs:**"));
    if (!line) continue;
    const existing = line.split(NOT_BUILT).at(-1) ?? "";
    for (const m of existing.matchAll(/`([^`]+)`/g)) {
      if (m[1] && JOB_NAME.test(m[1])) out.push({ module: f.replace("/MODULE.md", ""), job: m[1] });
    }
  }
  return out;
}

/** Named as existing by a MODULE.md another group corrects (F094): members' `purge-deleted` is g3's half. Remove the
 *  entry once members' MODULE.md no longer names it. */
const KNOWN_GAPS = new Set(["core/members:purge-deleted"]);

describe("cron parity (ADR-IMPL-021)", () => {
  it("the committed crontab is exactly what the registered job specs generate", async () => {
    const t = await testApp({ suite: "cron-parity" });
    const schedule = t.platform.jobs.schedule();
    expect(readFileSync(CRONTAB, "utf8").replace(/\r\n/g, "\n")).toBe(renderCrontab(schedule));
    await t.close();
  });

  it("the two jobs members depend on run every minute", async () => {
    const t = await testApp({ suite: "cron-parity-2" });
    const by = Object.fromEntries(t.platform.jobs.schedule().map((s) => [s.name, s.cron]));
    expect(by["send-requests"]).toBe("* * * * *");
    expect(by["dispatch"]).toBe("* * * * *");
    await t.close();
  });

  it("every crontab line names a registered job", async () => {
    const t = await testApp({ suite: "cron-parity-3" });
    const names = readFileSync(CRONTAB, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.trim().split(/\s+/)[5] ?? "");
    for (const n of names) expect(t.platform.jobs.has(n)).toBe(true);
    await t.close();
  });

  it("every job a MODULE.md names as existing answers POST /v1/internal/run/<job> (never 404 'unknown job')", async () => {
    const t = await testApp({ suite: "cron-parity-4" });
    const named = jobsNamedAsExisting();
    expect(named.length).toBeGreaterThan(5);
    // The route answers 404 exactly when the registry has no such job (apps/api/src/index.ts): asked here without
    // running every job.
    const missing = named.filter((n) => !t.platform.jobs.has(n.job) && !KNOWN_GAPS.has(`${n.module}:${n.job}`));
    expect(missing).toEqual([]);
    // The same answer on the wire: a job MODULE.md says is not built is 404.
    const notBuilt = await t.app.request("/v1/internal/run/sync-mirror", {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret },
    });
    expect(notBuilt.status).toBe(404);
    await t.close();
  });
});

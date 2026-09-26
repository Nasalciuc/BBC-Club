import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { testApp } from "./helpers/test-app";
import { renderCrontab } from "../src/cron/render";

const CRONTAB = fileURLToPath(new URL("../../../infra/cron/crontab", import.meta.url));

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
});

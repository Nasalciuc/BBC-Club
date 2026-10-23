/** members MODULE.md says what the module runs (AGENTS rule 10): every job it names is registered, runs on demand, and
 *  on the cadence it states. It once promised `purge-deleted` and a nightly reconcile. */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { testApp } from "./helpers/test-app";

const MODULE_MD = fileURLToPath(new URL("../../../packages/modules/core/members/MODULE.md", import.meta.url));

describe("members MODULE.md jobs", () => {
  it("every job it names exists, answers POST /v1/internal/run/<job>, and runs every 15 minutes as it says", async () => {
    const jobsLine = readFileSync(MODULE_MD, "utf8")
      .split("\n")
      .find((l) => l.startsWith("**Jobs:**"));
    expect(jobsLine).toBeDefined();
    const named = [...(jobsLine ?? "").matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((m) => m[1] ?? "");
    expect(named).toEqual(["reconcile-profiles"]);

    const t = await testApp({ suite: "members-md-jobs" });
    const cron = Object.fromEntries(t.platform.jobs.schedule().map((s) => [s.name, s.cron]));
    for (const job of named) {
      expect(t.platform.jobs.has(job)).toBe(true);
      const r = await t.app.request(`/v1/internal/run/${job}`, {
        method: "POST",
        headers: { "X-Internal-Secret": t.internalSecret },
      });
      expect([job, r.status]).toEqual([job, 200]);
    }
    expect(cron["reconcile-profiles"]).toBe("*/15 * * * *");
    expect(jobsLine).toContain("every 15 minutes");
    expect(t.platform.jobs.has("purge-deleted")).toBe(false);
    await t.close();
  });
});

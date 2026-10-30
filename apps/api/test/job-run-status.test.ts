/** POST /v1/internal/run/:job answers what the run did (audit, 30 Oct 2026): infra/cron/job.sh prints "ok" for a 2xx and
 *  "FAIL" otherwise, so a failed run must not answer 200. */
import { describe, expect, it } from "bun:test";

import { testApp } from "./helpers/test-app";

describe("a job run's answer", () => {
  it("200 for a run that succeeded, 500 with the same body for one that failed", async () => {
    const t = await testApp({ suite: "job-run-status" });
    t.platform.jobs.register("audit-ok", { cron: "manual", handler: async () => ({ processed: 1 }) });
    t.platform.jobs.register("audit-fails", {
      cron: "manual",
      handler: async () => {
        throw new Error("the site did not answer");
      },
    });
    const run = (job: string) =>
      t.app.request(`/v1/internal/run/${job}`, { method: "POST", headers: { "X-Internal-Secret": t.internalSecret } });

    const ok = await run("audit-ok");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { status: string }).status).toBe("succeeded");

    const failed = await run("audit-fails");
    expect(failed.status).toBe(500);
    expect(((await failed.json()) as { status: string }).status).toBe("failed");
    await t.close();
  });
});

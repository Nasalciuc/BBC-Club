import { describe, it, expect } from "bun:test";
import { renderCrontab } from "../src/cron/render";

describe("renderCrontab", () => {
  it("keeps a space before the job name when a cron field is longer than any pad width", () => {
    const out = renderCrontab([{ name: "x", cron: "0 0 * * MON-FRI" }]);
    expect(out).toContain("0 0 * * MON-FRI x");
    expect(out).not.toContain("MON-FRIx");
  });

  it("emits one schedule line per job", () => {
    const out = renderCrontab([
      { name: "dispatch", cron: "* * * * *" },
      { name: "send-requests", cron: "* * * * *" },
    ]);
    expect(out).toContain("* * * * * dispatch");
    expect(out).toContain("* * * * * send-requests");
  });
});

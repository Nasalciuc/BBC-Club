import { describe, expect, it } from "bun:test";

import { STALE_FLOOR_MS, cronIntervalMs, staleAfterMs, staleJobs } from "../src/cron/stale";

const H = 3_600_000;

describe("staleAfterMs", () => {
  it("keeps 36 h for daily and more frequent jobs", () => {
    for (const cron of ["* * * * *", "*/15 * * * *", "15 * * * *", "0 4 * * *", "15 3 * * *"]) {
      expect(staleAfterMs(cron)).toBe(STALE_FLOOR_MS);
    }
  });

  it("gives the weekly db-report ten and a half days, so /ready stays green between Mondays", () => {
    expect(cronIntervalMs("0 9 * * 1")).toBe(7 * 24 * H);
    expect(staleAfterMs("0 9 * * 1")).toBe(1.5 * 7 * 24 * H);
  });

  it("reads hour steps, monthly and yearly expressions", () => {
    expect(cronIntervalMs("0 */6 * * *")).toBe(6 * H);
    expect(staleAfterMs("0 3 1 * *")).toBe(1.5 * 31 * 24 * H);
    expect(cronIntervalMs("0 0 1 1 *")).toBe(366 * 24 * H);
  });
});

describe("staleJobs", () => {
  const schedule = [
    { name: "db-report", cron: "0 9 * * 1" },
    { name: "retention", cron: "0 4 * * *" },
  ];
  // Wednesday 7 Oct 2026, 11:25 UTC — the moment the staging deploy failed.
  const wednesday = Date.parse("2026-10-07T11:25:00Z");

  it("keeps the weekly job fresh on Wednesday and flags a daily job missed for two days", () => {
    const runs = {
      "db-report": { at: new Date("2026-10-05T09:00:00Z") },
      retention: { at: new Date("2026-10-05T04:00:00Z") },
    };
    expect(staleJobs(runs, schedule, wednesday)).toEqual(["retention"]);
  });

  it("ignores runs of jobs that are not scheduled now — manual, renamed or removed", () => {
    const runs = { "old-name": { at: "2026-09-01T00:00:00Z" }, "db-report": { at: "2026-10-05T09:00:00Z" } };
    expect(staleJobs(runs, schedule, wednesday)).toEqual([]);
  });

  it("does not flag a scheduled job that has never run", () => {
    expect(staleJobs({}, schedule, wednesday)).toEqual([]);
  });
});

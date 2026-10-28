/** db-observe's statement counters (ADR-IMPL-073): no plan series without track_planning (A-D2). */
import { describe, expect, it } from "bun:test";
import { applyDbGauges, type DbSnapshot, type StatementTotals } from "../src/observe/db-health";
import { createMetrics } from "../src/telemetry";

const snap = (statements: StatementTotals | null): DbSnapshot => ({
  connections: [],
  oldestTx: [],
  lockWaits: 0,
  deadlocks: 0,
  poolWaiting: null,
  oldestTxSeconds: 0,
  statements,
});
const lines = async (m: ReturnType<typeof createMetrics>, name: string) =>
  (await m.render()).split("\n").filter((l) => l.startsWith(`bbc_${name}{`) || l.startsWith(`bbc_${name} `));

describe("statement counters", () => {
  it("leave the plan series out while Postgres does not count plans", async () => {
    const m = createMetrics();
    applyDbGauges(m, snap({ calls: 10, plans: null, execSeconds: 1, planSeconds: null }));
    expect(await lines(m, "db_statement_plans_total")).toEqual([]);
    expect(await lines(m, "db_statement_plan_seconds_total")).toEqual([]);
    expect(await lines(m, "db_statements_total")).toEqual(["bbc_db_statements_total 10"]);
  });

  it("an unreadable pg_stat_statements leaves no series", async () => {
    const m = createMetrics();
    applyDbGauges(m, snap({ calls: 1, plans: 1, execSeconds: 1, planSeconds: 1 }));
    applyDbGauges(m, snap(null));
    expect(await lines(m, "db_statements_total")).toEqual([]);
  });
});

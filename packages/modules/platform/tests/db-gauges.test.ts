/** db-observe's statement counters (ADR-IMPL-073): no plan series without track_planning (A-D2), and an eviction from
 *  pg_stat_statements starts new series instead of a drop a rate reads as a reset (A-R3). */
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
    applyDbGauges(m, snap({ calls: 10, plans: null, execSeconds: 1, planSeconds: null, dealloc: 0 }));
    expect(await lines(m, "db_statement_plans_total")).toEqual([]);
    expect(await lines(m, "db_statement_plan_seconds_total")).toEqual([]);
    expect(await lines(m, "db_statements_total")).toEqual(['bbc_db_statements_total{epoch="0"} 10']);
  });

  it("an eviction moves every series to a new epoch, and the old ones leave /metrics", async () => {
    const m = createMetrics();
    applyDbGauges(m, snap({ calls: 1000, plans: 50, execSeconds: 9, planSeconds: 1, dealloc: 0 }));
    // pg_stat_statements dropped its least-run entries: the sums fall.
    applyDbGauges(m, snap({ calls: 400, plans: 20, execSeconds: 4, planSeconds: 0.5, dealloc: 1 }));
    expect(await lines(m, "db_statements_total")).toEqual(['bbc_db_statements_total{epoch="1"} 400']);
    expect(await lines(m, "db_statement_plans_total")).toEqual(['bbc_db_statement_plans_total{epoch="1"} 20']);
  });

  it("an unreadable pg_stat_statements leaves no series", async () => {
    const m = createMetrics();
    applyDbGauges(m, snap({ calls: 1, plans: 1, execSeconds: 1, planSeconds: 1, dealloc: 0 }));
    applyDbGauges(m, snap(null));
    expect(await lines(m, "db_statements_total")).toEqual([]);
  });
});

/** ADR-IMPL-077: /status asks about every job a process registers in one statement, whatever their number. */
import { describe, expect, it } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { lastFinishedRunsSql, lastRunsSql } from "../src/api";

const dialect = new PgDialect();
const names = (n: number) => Array.from({ length: n }, (_, i) => `job.${i}`);

describe("the last-runs statements", () => {
  for (const [label, build] of [
    ["lastRunsSql", lastRunsSql],
    ["lastFinishedRunsSql", lastFinishedRunsSql],
  ] as const) {
    it(`${label}: 1, 7 and 100 jobs are one statement text, the list one parameter`, () => {
      const queries = [1, 7, 100].map((n) => dialect.sqlToQuery(build(names(n))));
      expect(new Set(queries.map((q) => q.sql)).size).toBe(1);
      expect(queries.map((q) => q.params.length)).toEqual([1, 1, 1]);
      expect(queries[2]!.params[0]).toEqual(names(100));
    });
  }
});

/** A failed query never brings its parameters into a log line (AGENTS.md rule 6). */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { errorForLog, errorLine } from "../src/client";
import { isolatedDb } from "../src/testing/isolated-db";

const SECRET = "not-a-real-session-value";

describe("errorForLog", () => {
  it("keeps a failed query's SQLSTATE and objects, never its parameters or message", async () => {
    const iso = await isolatedDb("errors-for-log", { max: 1 });
    const db = iso.db;
    try {
      await db.execute(sql`CREATE TABLE t (token text PRIMARY KEY)`);
      await db.execute(sql`INSERT INTO t VALUES (${SECRET})`);
      const err = await db.execute(sql`INSERT INTO t VALUES (${SECRET})`).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toContain(SECRET); // what used to reach the log

      const logged = errorForLog(err);
      expect(JSON.stringify(logged)).not.toContain(SECRET);
      expect(logged).toMatchObject({ name: "DrizzleQueryError", message: "Failed query", sqlstate: "23505" });
      expect(logged.table).toBe("t");
      expect(logged.stack).toMatch(/^\s+at /);
      expect(errorLine(err)).not.toContain(SECRET);
      expect(errorLine(err)).toMatch(/^DrizzleQueryError: Failed query \(23505 t /);
    } finally {
      await iso.drop();
    }
  });

  it("follows a query error wrapped by another error", () => {
    const query = Object.assign(new Error(`Failed query: select\nparams: ${SECRET}`), {
      name: "DrizzleQueryError",
      query: "select",
      params: [SECRET],
      cause: { code: "57014" },
    });
    const wrapped = new Error("job failed", { cause: query });
    const logged = errorForLog(wrapped);
    expect(JSON.stringify(logged)).not.toContain(SECRET);
    expect(logged.message).toBe("job failed");
    expect(logged.cause).toMatchObject({ name: "DrizzleQueryError", sqlstate: "57014" });
  });

  it("keeps an ordinary error's name and message, and drops the fields it carries", () => {
    const err = Object.assign(new Error("request timed out"), { name: "TimeoutError", body: { email: "a@b.c" } });
    const logged = errorForLog(err);
    expect(logged).toMatchObject({ name: "TimeoutError", message: "request timed out" });
    expect(JSON.stringify(logged)).not.toContain("a@b.c");
  });

  it("logs only the type of something thrown that is not an Error", () => {
    expect(errorForLog(SECRET)).toEqual({ name: "string", message: "non-Error thrown" });
    expect(errorForLog(null)).toEqual({ name: "null", message: "non-Error thrown" });
  });
});

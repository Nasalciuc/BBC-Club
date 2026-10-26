/** Connection options every createDb client gets — the production pool included. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("db-session", { max: 1 });
});
afterAll(() => iso.drop());

describe("postgres.js connection options", () => {
  it("statement_timeout is 15000ms on the session", async () => {
    const rows = (await iso.db.execute(sql`SELECT current_setting('statement_timeout') AS t`)) as unknown as {
      t: string;
    }[];
    // postgres.js may report "15s" or "15000ms" depending on version
    const t = String(rows[0]?.t);
    expect(t === "15s" || t === "15000ms" || t === "15000").toBe(true);
  });

  it("idle_in_transaction_session_timeout is a minute for the bbc role (0027), on every new session", async () => {
    const rows = (await iso.db.execute(
      sql`SELECT current_user AS who, current_setting('idle_in_transaction_session_timeout') AS t`,
    )) as unknown as { who: string; t: string }[];
    expect(rows[0]?.who).toBe("bbc");
    expect(rows[0]?.t).toBe("1min");
  });
});

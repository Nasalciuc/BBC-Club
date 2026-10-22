/** An unhandled error answers 500 with the generic message, and its log line never carries a failed query's
 *  parameters (AGENTS.md rule 6). */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { errorContract } from "../src/middleware/error-contract";

const SECRET = "not-a-real-session-value";

describe("errorContract", () => {
  it("logs a failed query by its SQLSTATE, never by its parameters", async () => {
    const lines: unknown[] = [];
    const logger = { error: (o: object) => void lines.push(o), warn: (o: object) => void lines.push(o) };
    const app = new Hono();
    app.onError(errorContract(logger));
    app.get("/boom", () => {
      throw Object.assign(new Error(`Failed query: delete from "auth"."session" where token = $1\nparams: ${SECRET}`), {
        name: "DrizzleQueryError",
        query: 'delete from "auth"."session" where token = $1',
        params: [SECRET],
        cause: { code: "40P01", table_name: "session" },
      });
    });

    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).not.toContain(SECRET);
    expect(lines[0]).toMatchObject({
      path: "/boom",
      err: { name: "DrizzleQueryError", message: "Failed query", sqlstate: "40P01", table: "session" },
    });
  });
});

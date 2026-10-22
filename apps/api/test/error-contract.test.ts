/** An unhandled error answers 500 with the generic message, and its log line never carries a failed query's
 *  parameters (AGENTS.md rule 6). */
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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

  it("keeps a client-side HTTPException's status in the API's shape and never logs it as unhandled", async () => {
    const lines: unknown[] = [];
    const logger = { error: (o: object) => void lines.push(o), warn: (o: object) => void lines.push(o) };
    const app = new Hono();
    app.onError(errorContract(logger));
    const cases: Array<[number, string]> = [
      [413, "VALIDATION"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [429, "RATE_LIMITED"],
      [400, "VALIDATION"],
    ];
    for (const [status] of cases)
      app.get(`/h${status}`, () => {
        throw new HTTPException(status as 400, { message: "raw text the client must not see" });
      });
    app.get("/h503", () => {
      throw new HTTPException(503);
    });
    for (const [status, code] of cases) {
      const res = await app.request(`/h${status}`);
      expect(res.status).toBe(status);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe(code);
      expect(body.error.message).not.toContain("raw text");
    }
    expect(lines).toHaveLength(0);

    const res = await app.request("/h503");
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");
    expect(lines).toHaveLength(1);
  });
});

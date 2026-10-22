/** A failed query's parameters never reach a platform log line or a stored error (AGENTS.md rule 6): Drizzle's
 *  DrizzleQueryError carries them in its message, so job_runs.error, a delivery's last_error and their log lines keep
 *  only its SQLSTATE and the objects it names. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { createJobs } from "../src/jobs";
import { createPlatform } from "../src/api";

const SECRET = "not-a-real-session-value";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("platform-log-params", { max: 4 });
  db = iso.db;
  await db.execute(sql`CREATE TABLE public.log_params_tokens (token text PRIMARY KEY)`);
  await db.execute(sql`INSERT INTO public.log_params_tokens VALUES (${SECRET})`);
});
afterAll(() => iso.drop());

/** The same token again: a real duplicate-key failure whose message holds the token. */
const duplicate = (exec: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }) =>
  exec.execute(sql`INSERT INTO public.log_params_tokens VALUES (${SECRET})`);

function capture() {
  const lines: Array<{ o: object; m?: string }> = [];
  const push = (o: object, m?: string) => void lines.push({ o, m });
  return { lines, logger: { info: push, warn: push, error: push } };
}

describe("jobs", () => {
  it("a job failing on a query stores and logs its SQLSTATE, never its parameters", async () => {
    const { lines, logger } = capture();
    const jobs = createJobs(db, { logger });
    jobs.register("leaky-job", { cron: "manual", handler: async (ctx) => void (await duplicate(ctx.db)) });

    const r = await jobs.run("leaky-job");
    expect(r.status).toBe("failed");
    expect(r.error).not.toContain(SECRET);
    expect(r.error).toStartWith("DrizzleQueryError: Failed query (23505 log_params_tokens");

    const [row] = (await db.execute(
      sql`SELECT error FROM platform.job_runs WHERE job = 'leaky-job' ORDER BY id DESC LIMIT 1`,
    )) as unknown as { error: string }[];
    expect(row?.error).toBe(r.error);

    const failed = lines.find((l) => l.m === "job failed");
    expect(failed?.o).toMatchObject({ job: "leaky-job", err: { message: "Failed query", sqlstate: "23505" } });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it("an ordinary failure still says what happened", async () => {
    const jobs = createJobs(db, { logger: capture().logger });
    jobs.register("plain-failure", {
      cron: "manual",
      handler: async () => {
        throw new Error("nope");
      },
    });
    expect((await jobs.run("plain-failure")).error).toBe("Error: nope");
  });
});

describe("poller", () => {
  const Payload = z.object({ type: z.literal("test.leaked"), version: z.literal(1) });

  it("a delivery failing on a query keeps its SQLSTATE in last_error and the log, never its parameters", async () => {
    const p = createPlatform(db, { level: "silent" });
    const { lines, logger } = capture();
    Object.assign(p.logger, { warn: logger.warn, error: logger.error });
    p.events.defineEvent("test.leaked", { version: 1, schema: Payload });
    p.events.registerConsumer("test.leaked", "testing.onLeaked", async (ctx: any) => void (await duplicate(ctx.tx)));
    await db.transaction((tx: any) =>
      p.events.publish(tx, {
        type: "test.leaked",
        aggregateType: "test",
        aggregateId: "leak",
        payload: { type: "test.leaked", version: 1 },
        publishedBy: "tests",
      }),
    );

    await p.poller.drainOnce();

    const [row] = (await db.execute(
      sql`SELECT last_error FROM platform.event_deliveries WHERE consumer = 'testing.onLeaked'`,
    )) as unknown as { last_error: string }[];
    expect(row?.last_error).toStartWith("DrizzleQueryError: Failed query (23505 log_params_tokens");
    expect(row?.last_error).not.toContain(SECRET);
    expect(lines.some((l) => l.m === "delivery retry")).toBe(true);
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });
});

describe("flags", () => {
  it("a flag read that fails is logged without the query's parameters", async () => {
    const { lines, logger } = capture();
    const failing = {
      select() {
        throw Object.assign(new Error(`Failed query: select\nparams: ${SECRET}`), {
          name: "DrizzleQueryError",
          query: "select",
          params: [SECRET],
          cause: { code: "57P01" },
        });
      },
    };
    const { createFlags } = await import("../src/flags");
    const flags = createFlags(failing as never, { logger });
    expect(await flags.isEnabled("x", true)).toBe(true);
    expect(await flags.isKilled("engagement")).toBe(true);
    expect(await flags.isConsumerPaused("x.onY")).toBe(true);
    expect(lines).toHaveLength(3);
    expect(JSON.stringify(lines)).not.toContain(SECRET);
    expect(lines[0]?.o).toMatchObject({ err: { sqlstate: "57P01" } });
  });
});

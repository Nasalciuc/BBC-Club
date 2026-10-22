/** Identity-module test harness. Builds createAuth against postgres-test with a capturing email sender.
 *  No host, no registry — module contracts only. Account-deletion cascades live in apps/api/test/delete.test.ts. */
import { sql } from "drizzle-orm";
import { isolatedDb } from "@bbc/db/testing/isolated-db";
import { loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { createPlatform } from "@bbc/platform";
import { createAuth } from "../../src/infrastructure/auth";
import type { EmailSender, OtpPurpose } from "../../src/ports/email";

function capturingMailbox(): EmailSender & {
  lastOtp(to: string): string;
  sent: { to: string; otp: string; purpose: OtpPurpose }[];
  /** The next `times` sends throw `error` (default: a Postmark 503), as the Postmark sender does. */
  failNext(times?: number, error?: Error): void;
  /** Every send waits this long first (Postmark's round trip). */
  delayMs: number;
} {
  const sent: { to: string; otp: string; purpose: OtpPurpose }[] = [];
  let failures = 0;
  let failure: Error | undefined;
  const mailbox = {
    sent,
    delayMs: 0,
    async sendOtp(input: { to: string; otp: string; purpose: OtpPurpose }) {
      if (mailbox.delayMs > 0) await Bun.sleep(mailbox.delayMs);
      if (failures > 0) {
        failures--;
        throw failure ?? new Error("Postmark 503: simulated outage");
      }
      sent.push({ ...input, to: input.to.toLowerCase() });
    },
    async sendOperatorRequest() {},
    lastOtp(to: string) {
      const m = [...sent].reverse().find((s) => s.to === to.toLowerCase());
      if (!m) throw new Error(`no OTP captured for ${to}`);
      return m.otp;
    },
    failNext(times = 1, error?: Error) {
      failures = times;
      failure = error;
    },
  };
  return mailbox;
}

/** Records what createAuth logs, counts and posts to the ops channel. */
function recorders() {
  const logs: { level: "info" | "warn" | "error"; fields: Record<string, unknown>; message?: string }[] = [];
  const counted: { name: string; labels?: Record<string, string> }[] = [];
  const posted: string[] = [];
  const line = (level: "info" | "warn" | "error") => (fields: object, message?: string) => {
    logs.push({ level, fields: fields as Record<string, unknown>, message });
  };
  return {
    logs,
    counted,
    posted,
    logger: { info: line("info"), warn: line("warn"), error: line("error") },
    metrics: {
      inc(name: string, labels?: Record<string, string>) {
        counted.push({ name, labels });
      },
    },
    notifyOps: async (text: string) => {
      posted.push(text);
    },
  };
}

export type IdentityTestOpts = {
  /** When set, replaces the real HIBP plugin with this predicate. */
  hibp?: (password: string) => boolean | Promise<boolean>;
};

export async function testAuth(opts: IdentityTestOpts = {}) {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://bbc:bbc@localhost:55432/bbc_test";
  process.env.APP_ORIGIN ??= "http://localhost:8000";
  process.env.MOBILE_SCHEME ??= "bbcclub";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
  process.env.INTERNAL_API_SECRET ??= "internal-secret-internal-secret-0000";
  process.env.POSTMARK_FROM ??= "club@buybusinessclass.com";

  const iso = await isolatedDb("identity", { max: 4 });
  const env = loadEnv({ ...process.env, DATABASE_URL: iso.url });
  const db = iso.db;
  const platform = createPlatform(db, { level: "silent" });
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def as any);

  const mailbox = capturingMailbox();
  const seen = recorders();
  const auth = createAuth({
    env,
    db,
    email: mailbox,
    logger: seen.logger,
    metrics: seen.metrics,
    notifyOps: seen.notifyOps,
    breachedPassword: opts.hibp,
    events: {
      publish: async (e) => {
        await db.transaction((tx: unknown) =>
          platform.events.publish(tx, { ...e, payload: e.payload as Record<string, unknown>, publishedBy: "identity" }),
        );
      },
    },
  });

  return {
    auth,
    db,
    mailbox,
    /** What createAuth logged, counted and posted to the ops channel. */
    seen,
    journal: {
      byType: async (type: string) =>
        (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE type = ${type}`)) as {
          payload: any;
        }[],
    },
    close: async () => {
      await iso.drop();
    },
  };
}

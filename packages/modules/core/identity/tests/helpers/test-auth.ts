/** Identity-module test harness. Builds createAuth against postgres-test with a capturing email sender.
 *  No host, no registry — module contracts only. Account-deletion cascades live in apps/api/test/delete.test.ts. */
import { sql } from "drizzle-orm";
import { createDb } from "@bbc/db";
import { loadEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import { createPlatform } from "@bbc/platform";
import { createAuth } from "../../src/infrastructure/auth";
import type { EmailSender, OtpPurpose } from "../../src/ports/email";

function capturingMailbox(): EmailSender & {
  lastOtp(to: string): string;
  sent: { to: string; otp: string; purpose: OtpPurpose }[];
} {
  const sent: { to: string; otp: string; purpose: OtpPurpose }[] = [];
  return {
    sent,
    async sendOtp(input) {
      sent.push({ ...input, to: input.to.toLowerCase() });
    },
    lastOtp(to) {
      const m = [...sent].reverse().find((s) => s.to === to.toLowerCase());
      if (!m) throw new Error(`no OTP captured for ${to}`);
      return m.otp;
    },
  };
}

export type IdentityTestOpts = {
  /** When set, replaces the real HIBP plugin with this predicate. */
  hibp?: (password: string) => boolean;
};

export async function testAuth(opts: IdentityTestOpts = {}) {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://bbc:bbc@localhost:55432/bbc_test";
  process.env.APP_ORIGIN ??= "http://localhost:8000";
  process.env.MOBILE_SCHEME ??= "bbcclub";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
  process.env.INTERNAL_API_SECRET ??= "internal-secret-internal-secret-0000";
  process.env.POSTMARK_FROM ??= "club@buybusinessclass.com";

  const env = loadEnv(process.env);
  const db = createDb(env.DATABASE_URL, { max: 4, applicationName: "bbc-identity-test" });
  const platform = createPlatform(db, { level: "silent" });
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def as any);

  const mailbox = capturingMailbox();
  const auth = createAuth({
    env,
    db,
    email: mailbox,
    logger: platform.logger,
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
    journal: {
      byType: async (type: string) =>
        (await db.execute(sql`SELECT payload FROM platform.domain_events WHERE type = ${type}`)) as {
          payload: any;
        }[],
    },
    close: async () => {
      await db.close();
    },
  };
}

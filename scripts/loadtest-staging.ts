/**
 * Accounts for a k6 run against staging (docs/perf/LOADTEST.md), made and removed the way real ones are.
 *
 * - `start COUNT OUT` makes COUNT members `load<i>@load.test`: Better Auth's own insert, so `member.registered` is
 *   journaled as for a sign-up from the app; verified; a profile with home JFK; signed in. OUT gets the cookies as k6
 *   reads them (`loadtest/k6/mixed.js`), readable by its owner only. Accounts an earlier run left go first.
 * - `stop` deletes them as account deletion does: `member.deleted`, then the user.
 *
 * The script builds the whole app without serving or polling, so each event it writes gets a delivery for every
 * consumer, and staging's worker runs them as for a real sign-up or deletion (G11's tables included). Staging only:
 * assertStagingTarget refuses any other database. The password is random, one for the run, never written anywhere;
 * the cookies are the only way in, and `stop` ends them.
 *
 *   docker compose … run --rm --no-deps --user 0:0 -v /root/loadtest:/out api-staging \
 *     bun scripts/loadtest-staging.ts start 200 /out/sessions.json
 *   docker compose … run --rm --no-deps api-staging bun scripts/loadtest-staging.ts stop
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Db } from "@bbc/db";
import { profile } from "@bbc/db/schema/members";
import type { Auth, IdentityFacade } from "@bbc/identity";
import { loadEnv, type ServerEnv } from "@bbc/shared/env";
import { event, type PublishInput } from "@bbc/shared/events";
import { buildApp } from "../apps/api/src/index";
import { reason } from "./seed-review-account";
import { assertStagingTarget } from "./seed-staging-demo";

/** `.test` is never delivered (RFC 2606), and no real member is called `load<n>`. */
export const loadEmail = (i: number) => `load${i}@load.test`;
const LOAD_EMAIL = "^load[0-9]+@load\\.test$";
export const MAX_ACCOUNTS = 2_000;

export type Session = { cookie: string; ip: string; requestBody: object };
type Deps = {
  auth: Auth;
  db: Db;
  /** Writes an event in the caller's transaction, as the platform's publisher does. */
  publish: (tx: unknown, input: PublishInput) => Promise<unknown>;
};

export type Command = { kind: "start"; count: number; out: string } | { kind: "stop" };

export function parseArgs(args: readonly string[]): Command {
  const [kind, count, out] = args;
  if (kind === "stop" && args.length === 1) return { kind: "stop" };
  if (kind === "start" && args.length === 3 && out) {
    const n = Number(count);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_ACCOUNTS) return { kind: "start", count: n, out };
  }
  throw new Error(`usage: loadtest-staging.ts start <1–${MAX_ACCOUNTS}> <out.json> | stop`);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Removes every load account: member.deleted, then the user (its sessions and password go with it). */
export async function stopLoad(deps: Omit<Deps, "auth">): Promise<number> {
  const rows = (await deps.db.execute(sql`SELECT id FROM auth."user" WHERE email ~ ${LOAD_EMAIL}`)) as unknown as {
    id: string;
  }[];
  for (const { id } of rows) {
    await deps.db.transaction(async (tx) => {
      await deps.publish(tx, {
        type: "member.deleted",
        aggregateType: "member",
        aggregateId: id,
        memberId: id,
        payload: event("member.deleted", { memberId: id, deletedAt: new Date().toISOString() }),
        publishedBy: "identity",
      });
      await tx.execute(sql`DELETE FROM auth."user" WHERE id = ${id}`);
    });
  }
  return rows.length;
}

/** Makes `count` load accounts and signs each in. A run left behind by an earlier start is removed first. */
export async function startLoad(deps: Deps, count: number, now = new Date()): Promise<Session[]> {
  await stopLoad(deps);
  const password = randomBytes(24).toString("base64url");
  const ctx = await deps.auth.$context;
  // Better Auth's own hasher, directly: its breach-check wrapper needs a request around it (scripts/seed-review-account).
  const hash = await hashPassword(password);
  const depart = ymd(new Date(now.getTime() + 30 * 86_400_000));
  const back = ymd(new Date(now.getTime() + 37 * 86_400_000));
  const sessions: Session[] = [];
  for (let i = 0; i < count; i++) {
    const email = loadEmail(i);
    // Better Auth's own insert, so its hook journals member.registered as a sign-up does; verified, as after the code.
    const user = await ctx.internalAdapter.createUser({ email, name: `Load test ${i}`, emailVerified: true });
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    // A home airport, so Home has its routes. The member.registered handler inserts with ON CONFLICT DO NOTHING:
    // whichever of the two runs first, the row ends as written here.
    const values = { displayName: `Load test ${i}`, homeAirport: "JFK", timezone: "America/New_York" };
    await deps.db
      .insert(profile)
      .values({ memberId: user.id, ...values })
      .onConflictDoUpdate({ target: profile.memberId, set: { ...values, updatedAt: new Date() } });
    const res = await deps.auth.api.signInEmail({ body: { email, password }, asResponse: true });
    if (!res.ok) throw new Error(`load account ${i}: sign-in answered ${res.status}`);
    // Each cookie's name=value, without its attributes (an Expires date has a comma of its own).
    const cookie = res.headers
      .getSetCookie()
      .map((c) => (c.split(";")[0] ?? "").trim())
      .join("; ");
    if (!cookie) throw new Error(`load account ${i}: sign-in set no cookie`);
    sessions.push({
      cookie,
      ip: `10.66.${Math.floor(i / 250)}.${(i % 250) + 1}`,
      requestBody: {
        tripType: "round",
        cabin: "business",
        legs: [
          { from: "JFK", to: "LHR", date: depart },
          { from: "LHR", to: "JFK", date: back },
        ],
        passengers: { adult: 1, child: 0, infant: 0 },
        contact: { name: "Load Test", phone: "+12125550148", email },
      },
    });
  }
  return sessions;
}

if (import.meta.main) {
  let env: ServerEnv;
  let command: Command;
  try {
    command = parseArgs(process.argv.slice(2));
    env = loadEnv();
    assertStagingTarget(env);
  } catch (e) {
    console.error("loadtest:", reason(e));
    process.exit(1);
  }
  const built = await buildApp({ env, startPoller: false });
  const deps: Deps = {
    db: built.db,
    auth: built.registry.facade<IdentityFacade>("identity").auth,
    publish: (tx, input) => built.platform.events.publish(tx, input),
  };
  try {
    if (command.kind === "stop") {
      console.log(`load accounts removed: ${await stopLoad(deps)} (staging's worker clears their rows)`);
    } else {
      const sessions = await startLoad(deps, command.count);
      writeFileSync(command.out, JSON.stringify(sessions), { mode: 0o600 });
      chmodSync(command.out, 0o600);
      console.log(`load accounts ready: ${sessions.length}; cookies in ${command.out} — run "stop" when the test ends`);
    }
  } catch (e) {
    console.error("loadtest failed:", reason(e));
    process.exitCode = 1;
  } finally {
    await built.shutdown();
  }
  process.exit(process.exitCode ?? 0); // nothing of Better Auth's may keep the container alive
}

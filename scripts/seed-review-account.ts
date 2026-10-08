/**
 * The review account (docs/store/review-notes.md): a real, verified, active member whose password is the environment's.
 * Idempotent — run it as often as you like: it creates the account once, verifies its e-mail, puts the password back to
 * REVIEW_ACCOUNT_PASSWORD if someone changed it in the app, and makes the profile active. It never touches an account
 * that belongs to a linked member or an operator: the review account is ours alone.
 *   bun run scripts/seed-review-account.ts
 * On staging, scripts/seed-staging-demo.ts calls it first and gives the account Figma's situations (ADR-IMPL-040).
 * Prints neither the e-mail nor the password: deploy output ends up in CI logs.
 */
import { eq, sql } from "drizzle-orm";
import { createDb, type Executor } from "@bbc/db";
import { profile } from "@bbc/db/schema/members";
import { consoleSender } from "@bbc/email";
import { createAuth, type Auth } from "@bbc/identity";
import { createPlatform } from "@bbc/platform";
import { loadEnv, type ServerEnv } from "@bbc/shared/env";
import { EVENT_CATALOGUE } from "@bbc/shared/events";

/** What the profile shows. Staging gives the account Figma's member; production leaves it to the reviewer. */
export type ReviewPersona = { displayName: string; phone: string; homeAirport: string; timezone: string };

/** Better Auth on a script's own connection, publishing `member.registered` to the journal as the API does. Mail is
 *  dropped: the account is verified directly, and a printed address would end up in CI logs. */
export function scriptAuth(env: ServerEnv, applicationName: string) {
  const db = createDb(env.DATABASE_URL, { max: 1, applicationName });
  const platform = createPlatform(db, { level: "warn" });
  for (const [type, def] of Object.entries(EVENT_CATALOGUE)) platform.events.defineEvent(type, def);
  const auth = createAuth({
    env,
    db,
    email: consoleSender(() => {}),
    events: {
      publish: async (e) => {
        await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "identity" }));
      },
    },
    logger: platform.logger,
  });
  return { db, auth, close: () => db.close() };
}

type UserRow = { id: string; role: string | null };

export async function ensureReviewAccount(deps: {
  auth: Auth;
  db: Executor;
  email: string;
  password: string;
  persona?: ReviewPersona;
}): Promise<{ memberId: string; created: boolean; passwordRestored: boolean }> {
  const email = deps.email.trim().toLowerCase();
  const find = async (): Promise<UserRow | null> => {
    const rows = (await deps.db.execute(
      sql`SELECT id, role FROM auth."user" WHERE email = ${email}`,
    )) as unknown as UserRow[];
    return rows[0] ?? null;
  };

  let user = await find();
  const created = user === null;
  if (user === null) {
    await deps.auth.api.signUpEmail({ body: { email, password: deps.password, name: "App Review" } });
    user = await find();
    if (user === null) throw new Error("review account: no user after sign-up");
  } else {
    // An e-mail that names a real member or an operator is a mistake in the environment, not an account to take over.
    const [existing] = await deps.db
      .select({ crmClientId: profile.crmClientId })
      .from(profile)
      .where(eq(profile.memberId, user.id));
    if (user.role === "operator" || existing?.crmClientId) {
      throw new Error("review account refused: REVIEW_ACCOUNT_EMAIL belongs to an operator or a linked member");
    }
  }
  const memberId = user.id;
  await deps.db.execute(sql`UPDATE auth."user" SET email_verified = true WHERE id = ${memberId}`);

  // The environment's password is the account's: a password changed in the app (Profile → Password) is put back.
  const ctx = await deps.auth.$context;
  const credential = (await ctx.internalAdapter.findAccounts(memberId)).find((a) => a.providerId === "credential");
  let passwordRestored = false;
  if (!credential) {
    await ctx.internalAdapter.linkAccount({
      userId: memberId,
      providerId: "credential",
      accountId: memberId,
      password: await ctx.password.hash(deps.password),
    });
    passwordRestored = !created;
  } else if (
    !credential.password ||
    !(await ctx.password.verify({ hash: credential.password, password: deps.password }))
  ) {
    await ctx.internalAdapter.updatePassword(memberId, await ctx.password.hash(deps.password));
    passwordRestored = true;
  }

  // Active: our own account, never a CRM client. The member.registered handler inserts with ON CONFLICT DO NOTHING, so
  // whichever runs first, the row ends active. With a persona, the profile is put back to it whole — travel
  // preferences a demo saved included.
  const p = deps.persona;
  const persona = p
    ? { displayName: p.displayName, phone: p.phone, homeAirport: p.homeAirport, timezone: p.timezone, preferences: {} }
    : {};
  await deps.db
    .insert(profile)
    .values({ memberId, status: "active", ...persona })
    .onConflictDoUpdate({
      target: profile.memberId,
      set: { status: "active", deletedAt: null, ...persona, updatedAt: new Date() },
    });

  return { memberId, created, passwordRestored };
}

/** The innermost error's words, never a query's parameters: drizzle quotes them (an e-mail, a password hash) in its
 *  message, and script output ends up in CI logs. The driver's error underneath has none. */
export function reason(e: unknown): string {
  let inner = e;
  while (inner instanceof Error && inner.cause instanceof Error) inner = inner.cause;
  return inner instanceof Error ? inner.message : String(inner);
}

if (import.meta.main) {
  let env: ServerEnv;
  try {
    env = loadEnv();
  } catch (e) {
    console.error("review account:", reason(e));
    process.exit(1);
  }
  if (!env.REVIEW_ACCOUNT_EMAIL || !env.REVIEW_ACCOUNT_PASSWORD) {
    console.error("review account: set REVIEW_ACCOUNT_EMAIL and REVIEW_ACCOUNT_PASSWORD (12+ characters)");
    process.exit(1);
  }
  const { db, auth, close } = scriptAuth(env, "bbc-seed-review-account");
  try {
    const r = await ensureReviewAccount({
      auth,
      db,
      email: env.REVIEW_ACCOUNT_EMAIL,
      password: env.REVIEW_ACCOUNT_PASSWORD,
    });
    console.log(
      `review account ${r.created ? "created" : "ready"}: verified, active${r.passwordRestored ? ", password put back from the environment" : ""}`,
    );
  } catch (e) {
    console.error("review account failed:", reason(e));
    process.exitCode = 1;
  } finally {
    await close();
  }
  process.exit(process.exitCode ?? 0); // nothing of Better Auth's may keep the deploy step alive
}

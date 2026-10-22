import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError, type ApiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import type { Executor } from "@bbc/db";
import { createAuth } from "./api";
import { createIdentityFacade } from "./application/facade";
import type { IdentityFacade } from "./api";
import type { EmailFacade } from "@bbc/email";
import { PasswordBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";
import { rateLimit, subjectOf } from "@bbc/platform/ratelimit";
import { account } from "./infrastructure/schema";
import { BREACH_CHECK_UNAVAILABLE_MESSAGE, BREACHED_PASSWORD_MESSAGE, breachCheck } from "./infrastructure/breach";

/** better-auth's own rule (setPassword, changePassword, deleteUser): a credential account *with* a stored password.
 *  A credential row can exist with a null password — that is not a password. */
async function hasStoredPassword(exec: Executor, userId: string): Promise<boolean> {
  const rows = await exec
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
    .limit(1);
  return rows.length > 0;
}

const WRONG_PASSWORD = "That password isn't right.";

/** A 400 from Better Auth's changePassword / setPassword, in the club's words, on the field at fault — decided by its
 *  error code, never by whether the member has a password: a breached new password (PASSWORD_COMPROMISED) is not a
 *  wrong current one, and telling the member so sends them to reset a password they typed right. */
function passwordRefusal(err: unknown): ApiError {
  const body =
    err && typeof err === "object" ? (err as { body?: { code?: unknown; message?: unknown } }).body : undefined;
  const code = typeof body?.code === "string" ? body.code : undefined;
  const own = typeof body?.message === "string" && body.message.length > 0 ? body.message : undefined;
  const on = (path: "currentPassword" | "newPassword", message: string) =>
    apiError("VALIDATION", { message, details: [{ path, message }] });
  switch (code) {
    case "INVALID_PASSWORD":
      return on("currentPassword", WRONG_PASSWORD);
    case "PASSWORD_COMPROMISED":
      return on("newPassword", BREACHED_PASSWORD_MESSAGE);
    // PasswordBody's min 8 / max 128 answers these first; kept so a changed limit still lands on the right field.
    case "PASSWORD_TOO_SHORT":
      return on("newPassword", "Your password needs at least 8 characters.");
    case "PASSWORD_TOO_LONG":
      return on("newPassword", "Your password can be at most 128 characters.");
    default:
      return apiError("VALIDATION", { message: own ?? "Please check your password." });
  }
}

/** The change stands, the other sessions did not end: what happened, and the way that ends them all (ADR-IMPL-047). */
const OTHERS_STILL_SIGNED_IN =
  "Your new password is set, but your other devices are still signed in. Sign out, then use Forgot password? to sign them all out.";

type Ports = { email: EmailFacade };

/** Test seams only; production passes nothing. */
export type IdentityModuleOptions = {
  /** Replaces the breach list (HIBP) with a predicate; it may throw to stand for an unreachable list. */
  breachedPassword?: (password: string) => boolean | Promise<boolean>;
  /** The floor under a reset or verification code's answer (default: Postmark's timeout, 4 s). */
  otpAnswerFloorMs?: number;
};

/** Wiring only. Better Auth's hooks have no transaction of their own, so the EventPublisher port takes a
 *  single argument; we open a transaction here and drop platform's return value to satisfy Promise<void>. */
export const identityModule = (opts: IdentityModuleOptions = {}): ModuleDescriptor<Ports, IdentityFacade> => ({
  name: "identity",
  layer: "core",
  needs: ["email"],
  init: ({ env, db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const isBreached = breachCheck({ env, breachedPassword: opts.breachedPassword });
    const auth = createAuth({
      env,
      db: conn,
      email: ports.email,
      breachedPassword: opts.breachedPassword,
      logger: platform.logger,
      metrics: platform.metrics,
      events: {
        publish: async (e) => {
          await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "identity" }));
        },
      },
    });

    const routes = new Hono<AppEnv>();

    registerRoute("GET", "/v1/account/password", "profile:read-self", "read");
    routes.get(
      "/account/password",
      rateLimit(platform.rateLimit, "read"),
      authorize("profile:read-self", {
        module: "identity",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        // The app asks after a join code: a member who already has a password goes straight in.
        return c.json({ hasPassword: await hasStoredPassword(conn, actor) });
      },
    );

    // Limited as the profile's other writes are, per member: the current password cannot be guessed here without end
    // (ADR-IMPL-047). Better Auth's own limits never see this call — it reaches auth.api from inside the server. The
    // member is known first, so an anonymous call is refused before it counts against anyone.
    registerRoute("POST", "/v1/account/password", "profile:update-self", "profile.write");
    routes.post(
      "/account/password",
      authorize("profile:update-self", {
        module: "identity",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
      // profile.write's numbers in a bucket of its own: wrong guesses of the current password do not use up the member's
      // profile edits, nor do the edits the guesses (ADR-IMPL-047).
      rateLimit(platform.rateLimit, "profile.write", (c) => `pw:${subjectOf(c)}`),
      async (c) => {
        const actor = actorMemberId(c.get("principal"));
        if (!actor) return c.json(apiError("FORBIDDEN"), 403);
        const parsed = PasswordBody.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success) {
          return c.json(
            apiError("VALIDATION", {
              details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
            }),
            400,
          );
        }
        const hasPassword = await hasStoredPassword(conn, actor);
        const currentPassword = parsed.data.currentPassword;
        if (hasPassword && !currentPassword) {
          // A member who joins again by email code already has a password: nothing to set. 409, so the app moves on.
          return c.json(apiError("CONFLICT", { message: "This account already has a password." }), 409);
        }
        if (!hasPassword) {
          // The first password after a code Join (path A) goes through auth.api.setPassword, a server-only endpoint with no
          // path: Better Auth's haveIBeenPwned never sees it. ADR-PROD-001 asks for the same refusal as everywhere else,
          // so the club checks here, before anything is stored. An unreachable list refuses too (fails closed).
          let breached: boolean;
          try {
            breached = await isBreached(parsed.data.newPassword);
          } catch {
            return c.json(apiError("SERVICE_DISABLED", { message: BREACH_CHECK_UNAVAILABLE_MESSAGE }), 503);
          }
          if (breached) {
            return c.json(
              apiError("VALIDATION", {
                message: BREACHED_PASSWORD_MESSAGE,
                details: [{ path: "newPassword", message: BREACHED_PASSWORD_MESSAGE }],
              }),
              400,
            );
          }
        }

        let othersEnded = true;
        try {
          if (hasPassword && currentPassword) {
            await auth.api.changePassword({
              headers: c.req.raw.headers,
              body: {
                newPassword: parsed.data.newPassword,
                currentPassword,
              },
            });
            // Every other session ends; this one stays. changePassword's own revokeOtherSessions deletes this session too
            // and puts its replacement in a cookie this route does not forward: the phone that changed the password was
            // signed out once its cookie cache ran out (ADR-IMPL-047). The password has changed by now: a failure here
            // still publishes the change, and the answer says the other devices are signed in and how to end them.
            try {
              await auth.api.revokeOtherSessions({ headers: c.req.raw.headers });
            } catch (err: unknown) {
              othersEnded = false;
              // Never the error itself: a failed query carries its parameters, the other sessions' tokens among them.
              const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined) : undefined;
              platform.logger.error(
                {
                  memberId: actor,
                  error: err instanceof Error ? err.name : typeof err,
                  sqlstate: typeof cause?.code === "string" ? cause.code : undefined,
                },
                "password changed, but the member's other sessions could not be ended",
              );
            }
          } else {
            await auth.api.setPassword({
              headers: c.req.raw.headers,
              body: { newPassword: parsed.data.newPassword },
            });
          }
        } catch (err: unknown) {
          const status =
            err && typeof err === "object"
              ? ((err as { statusCode?: number; status?: number | string }).statusCode ??
                ((err as { status?: string }).status === "BAD_REQUEST" ? 400 : (err as { status?: number }).status) ??
                500)
              : 500;
          if (status === 400) return c.json(passwordRefusal(err), 400);
          if (
            status === 401 ||
            (err && typeof err === "object" && (err as { status?: string }).status === "UNAUTHORIZED")
          )
            return c.json(apiError("UNAUTHORIZED"), 401);
          throw err;
        }
        await db.transaction((tx: unknown) =>
          platform.events.publish(tx, {
            type: "member.password_changed",
            aggregateType: "member",
            aggregateId: actor,
            memberId: actor,
            payload: event("member.password_changed", {
              memberId: actor,
              changedAt: new Date().toISOString(),
              reason: "change",
            }),
            publishedBy: "identity",
          }),
        );
        if (!othersEnded) {
          // `passwordChanged`: the app shows the change as made, with these words, not the form again — the old current
          // password would now be refused as wrong.
          return c.json(
            apiError("INTERNAL", { message: OTHERS_STILL_SIGNED_IN, context: { passwordChanged: true } }),
            500,
          );
        }
        return c.json({ ok: true });
      },
    );

    return {
      exposes: { ...createIdentityFacade(auth, conn, { otpAnswerFloorMs: opts.otpAnswerFloorMs }), auth },
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [],
    };
  },
});

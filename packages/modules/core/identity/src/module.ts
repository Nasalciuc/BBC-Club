import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import type { AppEnv } from "@bbc/shared/http/app-env";
import type { Executor } from "@bbc/db";
import { createAuth } from "./api";
import { createIdentityFacade } from "./application/facade";
import type { IdentityFacade } from "./api";
import type { EmailFacade } from "@bbc/email";
import { PasswordBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";
import { account } from "./infrastructure/schema";

const WRONG_PASSWORD = "That password isn't right.";

type Ports = { email: EmailFacade };

/** Wiring only. Better Auth's hooks have no transaction of their own, so the EventPublisher port takes a
 *  single argument; we open a transaction here and drop platform's return value to satisfy Promise<void>. */
export const identityModule = (): ModuleDescriptor<Ports, IdentityFacade> => ({
  name: "identity",
  layer: "core",
  needs: ["email"],
  init: ({ env, db, platform, ports }) => {
    const conn = db as unknown as Executor;
    const auth = createAuth({
      env,
      db: conn,
      email: ports.email,
      logger: platform.logger,
      events: {
        publish: async (e) => {
          await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "identity" }));
        },
      },
    });

    const routes = new Hono<AppEnv>();

    registerRoute("POST", "/v1/account/password", "profile:update-self");
    routes.post(
      "/account/password",
      authorize("profile:update-self", {
        module: "identity",
        flags: platform.flags,
        log: platform.logger.warn.bind(platform.logger),
      }),
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
        const existing = await conn
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, actor), eq(account.providerId, "credential")))
          .limit(1);
        const hasCredential = existing.length > 0;
        const currentPassword = parsed.data.currentPassword;
        if (hasCredential && !currentPassword) {
          return c.json(apiError("VALIDATION", { message: "Current password is required." }), 400);
        }

        try {
          if (hasCredential && currentPassword) {
            await auth.api.changePassword({
              headers: c.req.raw.headers,
              body: {
                newPassword: parsed.data.newPassword,
                currentPassword,
                revokeOtherSessions: true,
              },
            });
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
          if (status === 400)
            return c.json(
              apiError("VALIDATION", {
                message: hasCredential
                  ? WRONG_PASSWORD
                  : err && typeof err === "object"
                    ? ((err as { body?: { message?: string } }).body?.message ?? "Invalid password")
                    : "Invalid password",
              }),
              400,
            );
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
        return c.json({ ok: true });
      },
    );

    return {
      exposes: { ...createIdentityFacade(auth, conn), auth },
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [],
    };
  },
});

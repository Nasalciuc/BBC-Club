import { Hono } from "hono";
import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { authorize, registerRoute } from "@bbc/shared/authz/authorize";
import { apiError } from "@bbc/shared/errors";
import { actorMemberId } from "@bbc/shared/authz/principal";
import { createAuth, createIdentityFacade, type Auth } from "./api";
import type { EmailSender } from "./ports/email";
import { PasswordBody } from "@bbc/shared/api/v1/proposals";
import { event } from "@bbc/shared/events";

type Ports = { email: EmailSender };
type Exposes = ReturnType<typeof createIdentityFacade> & { auth: Auth };

/** Wiring only. Better Auth's hooks have no transaction of their own, so the EventPublisher port takes a
 *  single argument; we open a transaction here and drop platform's return value to satisfy Promise<void>. */
export const identityModule = (): ModuleDescriptor<Ports, Exposes> => ({
  name: "identity",
  layer: "core",
  needs: ["email"],
  init: ({ env, db, platform, ports }) => {
    const auth = createAuth({
      env,
      db,
      email: ports.email,
      logger: platform.logger,
      events: {
        publish: async (e) => {
          await db.transaction((tx: unknown) => platform.events.publish(tx, { ...e, publishedBy: "identity" }));
        },
      },
    });

    const routes = new Hono<any>();

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
        try {
          await auth.api.setPassword({
            headers: c.req.raw.headers,
            body: { newPassword: parsed.data.newPassword },
          });
        } catch (err: any) {
          const status = err?.statusCode ?? (err?.status === "BAD_REQUEST" ? 400 : err?.status) ?? 500;
          if (status === 400)
            return c.json(apiError("VALIDATION", { message: err?.body?.message ?? "Invalid password" }), 400);
          if (status === 401 || err?.status === "UNAUTHORIZED") return c.json(apiError("UNAUTHORIZED"), 401);
          throw err;
        }
        await db.transaction((tx: unknown) =>
          platform.events.publish(tx, {
            type: "member.password_changed",
            version: 1,
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
      exposes: { ...createIdentityFacade(auth, db), auth },
      routes: [{ basePath: "/v1", app: routes }],
      consumers: [],
      jobs: [],
    };
  },
});

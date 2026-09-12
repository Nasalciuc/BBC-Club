import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { createAuth, createIdentityFacade, type Auth } from "./api";
import type { EmailSender } from "./ports/email";

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
        publish: async (event) => {
          await db.transaction((tx: unknown) =>
            platform.events.publish(tx, { ...event, publishedBy: "identity" }),
          );
        },
      },
    });
    return { exposes: { ...createIdentityFacade(auth), auth }, routes: [], consumers: [], jobs: [] };
  },
});

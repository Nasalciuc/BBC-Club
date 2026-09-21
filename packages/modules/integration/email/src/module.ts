import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import type { EmailFacade } from "./api";
import { postmarkSender, consoleSender } from "./postmark";

/** Adapter module: exposes the EmailFacade port. Postmark when a token exists, console otherwise
 *  (env.ts refuses to boot in production without a token, so console can never reach a member). */
export const emailModule = (override?: EmailFacade): ModuleDescriptor<Record<string, never>, EmailFacade> => ({
  name: "email",
  layer: "integration",
  init: ({ env, platform }) => ({
    exposes:
      override ??
      (env.POSTMARK_SERVER_TOKEN
        ? postmarkSender({ token: env.POSTMARK_SERVER_TOKEN, from: env.POSTMARK_FROM })
        : consoleSender((m: string) => platform.logger.info({}, m))),
  }),
});

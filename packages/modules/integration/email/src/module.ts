import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import type { EmailSender } from "@bbc/identity/ports/email";
import { postmarkSender, consoleSender } from "./postmark";

/** Adapter module: exposes the EmailSender port. Postmark when a token exists, console otherwise
 *  (env.ts refuses to boot in production without a token, so console can never reach a member). */
export const emailModule = (override?: EmailSender): ModuleDescriptor<Record<string, never>, EmailSender> => ({
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

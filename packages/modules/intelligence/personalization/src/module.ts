import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import type { Executor } from "@bbc/db";
import { createPersonalizationFacade } from "./application/facade";
import type { PersonalizationFacade } from "./api";
import { onMemberDeleted } from "./handlers/on-member-deleted";

export const personalizationModule = (): ModuleDescriptor<Record<string, never>, PersonalizationFacade> => ({
  name: "personalization",
  layer: "intelligence",
  needs: [],
  init: ({ db, platform }) => {
    const conn = db as unknown as Executor;
    const facade = createPersonalizationFacade(conn);
    return {
      exposes: facade,
      routes: [],
      consumers: [
        {
          type: "member.deleted",
          name: "personalization.onMemberDeleted",
          handler: (ctx: HandlerContext, payload: unknown) =>
            onMemberDeleted(
              {
                tx: ctx.tx as unknown as Executor,
                memberId: ctx.event.memberId,
                tombstone: (tx, memberId) => platform.events.tombstoneMember(tx, memberId),
              },
              payload,
            ),
        },
      ],
      jobs: [],
    };
  },
});

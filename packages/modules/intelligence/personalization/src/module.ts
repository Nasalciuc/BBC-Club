import type { ModuleDescriptor, HandlerContext } from "@bbc/shared/module-contract";
import { createPersonalizationFacade } from "./application/facade";
import type { PersonalizationFacade } from "./api";
import { onMemberDeleted } from "./handlers/on-member-deleted";

export const personalizationModule = (): ModuleDescriptor<Record<string, never>, PersonalizationFacade> => ({
  name: "personalization",
  layer: "intelligence",
  needs: [],
  init: ({ db, platform }) => {
    const facade = createPersonalizationFacade(db);
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
                tx: ctx.tx,
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

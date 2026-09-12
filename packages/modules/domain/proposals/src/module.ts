import type { ModuleDescriptor } from "@bbc/shared/module-contract";
import { offersRepo } from "./infrastructure/offers.repo";

type Exposes = {
  getVisible(exec: unknown, actorMemberId: string, offerId: string): Promise<unknown | null>;
  feed(exec: unknown, actorMemberId: string, cursor: { ts: Date; id: string } | null, limit?: number): Promise<unknown[]>;
  // stage 2: ingest (S2S, idempotent), withdraw, getAny
};

export const proposalsModule = (): ModuleDescriptor<Record<string, never>, Exposes> => ({
  name: "proposals",
  layer: "domain",
  init: ({ db }) => ({
    exposes: {
      getVisible: (exec, actor, id) => offersRepo.getVisible((exec ?? db) as any, actor, id),
      feed: (exec, actor, cursor, limit) => offersRepo.feed((exec ?? db) as any, actor, cursor, limit),
    },
    routes: [],      // stage 2: POST /v1/internal/offers (proposals:ingest)
    consumers: [],
    jobs: [],        // stage 2: expire-offers
  }),
});

import { withTx, type Executor } from "@bbc/db";
import { faresRepo } from "../infrastructure/fares.repo";

export async function expireFares(deps: { db: Executor }): Promise<{ expired: number }> {
  return withTx(deps.db, async (tx) => {
    const expired = await faresRepo.expirePast(tx);
    return { expired };
  });
}

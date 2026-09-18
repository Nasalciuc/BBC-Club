import { withTx, type Db } from "@bbc/db";
import { faresRepo } from "../infrastructure/fares.repo";

export async function expireFares(deps: { db: Db }): Promise<{ expired: number }> {
  return withTx(deps.db, async (tx) => {
    const expired = await faresRepo.expirePast(tx);
    return { expired };
  });
}

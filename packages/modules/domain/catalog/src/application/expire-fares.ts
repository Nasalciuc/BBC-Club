import { withTx, type Executor } from "@bbc/db";
import { faresRepo } from "../infrastructure/fares.repo";

export async function expireFares(deps: { db: Executor }): Promise<{ expired: number }> {
  return withTx(deps.db, async (tx) => {
    const now = new Date();
    // Nothing past its time: no UPDATE, so catalog.fares' generation stays (X11, ADR-IMPL-075).
    if (!(await faresRepo.anyToExpire(tx, now))) return { expired: 0 };
    const expired = await faresRepo.expirePast(tx, now);
    return { expired };
  });
}

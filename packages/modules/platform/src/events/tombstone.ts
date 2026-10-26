import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";

/** GDPR/CCPA: the journal keeps what happened, not who. Called by the member.deleted handler. */
export async function tombstoneMember(exec: unknown, memberId: string): Promise<number> {
  // `unknown` per the shared ModulePlatform contract; it is always the delivery transaction.
  const res: any = await (exec as Executor).execute(sql`
    UPDATE platform.domain_events
    SET payload = jsonb_build_object('tombstoned', true, 'at', to_jsonb(now()))
    WHERE member_id = ${memberId} AND NOT (payload ? 'tombstoned')`);
  return res.count ?? res.rowCount ?? 0;
}

import { sql } from "drizzle-orm";

/** GDPR/CCPA: the journal keeps what happened, not who. Called by the member.deleted handler. */
export async function tombstoneMember(tx: any, memberId: string): Promise<number> {
  const res: any = await tx.execute(sql`
    UPDATE platform.domain_events
    SET payload = jsonb_build_object('tombstoned', true, 'at', to_jsonb(now()))
    WHERE member_id = ${memberId} AND NOT (payload ? 'tombstoned')`);
  return res.count ?? res.rowCount ?? 0;
}

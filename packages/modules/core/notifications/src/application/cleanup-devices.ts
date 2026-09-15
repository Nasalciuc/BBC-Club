import { sql } from "drizzle-orm";

/** Hard-delete device tokens inactive for 180 days. */
export async function cleanupDevices(db: any): Promise<Record<string, number>> {
  const rows: any[] = await db.execute(sql`
    DELETE FROM notifications.device_tokens
    WHERE active = false
      AND last_seen_at < now() - interval '180 days'
    RETURNING id`);
  return { deleted: rows.length };
}

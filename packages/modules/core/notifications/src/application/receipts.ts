import { sql } from "drizzle-orm";

/** `sent` without `delivered` for > 24h → stamp last_error='receipt_unknown' (provider never confirmed). */
export async function reconcileReceipts(db: any): Promise<Record<string, number>> {
  const rows: any[] = await db.execute(sql`
    UPDATE notifications.notifications
    SET last_error = 'receipt_unknown'
    WHERE status = 'sent'
      AND delivered_at IS NULL
      AND sent_at < now() - interval '24 hours'
      AND (last_error IS NULL OR last_error <> 'receipt_unknown')
    RETURNING id`);
  return { marked: rows.length };
}

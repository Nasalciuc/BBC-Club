import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { withTx, type Executor, type Tx } from "@bbc/db";
import { campaigns, notificationsTable } from "@bbc/db/schema/notifications";
import type { MembersFacade } from "@bbc/members";
import { scheduleAfterQuietHours } from "./quiet-hours";

const PAGE = 1_000;
const OFFER_CATEGORIES = ["offers_personal", "offers_broadcast"] as const;

type Campaign = typeof campaigns.$inferSelect;

export type CampaignFanoutDeps = {
  db: Executor;
  members: Pick<MembersFacade, "audiencePage">;
  now?: () => Date;
  signal?: AbortSignal;
  /** Members per transaction. Tests pass a small page to cross page boundaries cheaply. */
  pageSize?: number;
};

type Metrics = { campaigns: number; pages: number; inserted: number; capped: number };

/** Oldest open campaign, locked for the claim. A second runner skips it (the job is also a singleton). */
async function claimCampaign(tx: Tx): Promise<Campaign | null> {
  const [c] = await tx
    .select()
    .from(campaigns)
    .where(inArray(campaigns.status, ["pending", "running"]))
    .orderBy(asc(campaigns.createdAt))
    .limit(1)
    .for("update", { skipLocked: true });
  if (!c) return null;
  if (c.status === "pending") await tx.update(campaigns).set({ status: "running" }).where(eq(campaigns.id, c.id));
  return c;
}

/** One page: the daily cap as ONE query for the whole page, then one insert. The cursor advances in the same
 *  transaction, so a crash resumes after the last committed page and never writes a page twice.
 *  Null when the campaign is no longer running — the offer was withdrawn or expired since the claim. */
async function fanOutPage(
  tx: Tx,
  c: Campaign,
  page: { memberId: string; timezone: string }[],
  now: Date,
): Promise<{ inserted: number; capped: number } | null> {
  // Lock and re-read the campaign first: on-offer-lifecycle closes it under the same row lock, so a page either
  // commits before the close (and the close suppresses its rows) or sees the close and writes nothing.
  const [open] = await tx
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(eq(campaigns.id, c.id))
    .for("update");
  if (open?.status !== "running") return null;
  // Cap: at most one offer push per member per server day — date_trunc('day', now()) in the database
  // session's time zone (UTC on the host), not the member's local day. Same rule the personal path applies.
  const cappedRows = await tx
    .select({ memberId: notificationsTable.memberId })
    .from(notificationsTable)
    .where(
      and(
        inArray(
          notificationsTable.memberId,
          page.map((p) => p.memberId),
        ),
        inArray(notificationsTable.category, [...OFFER_CATEGORIES]),
        gte(notificationsTable.createdAt, sql`date_trunc('day', now())`),
      ),
    );
  const capped = new Set(cappedRows.map((r) => r.memberId));
  // Once per time zone, not per member: the walk through quiet hours costs ~2 ms at night, and a page shares `now`.
  const sendAt = new Map<string, Date>();
  const scheduledFor = (timeZone: string) => {
    let at = sendAt.get(timeZone);
    if (!at) sendAt.set(timeZone, (at = scheduleAfterQuietHours(now, timeZone)));
    return at;
  };
  const rows = page
    .filter((p) => !capped.has(p.memberId))
    .map((p) => ({
      memberId: p.memberId,
      category: c.category,
      title: c.title,
      body: c.body,
      deepLink: c.deepLink,
      offerId: c.offerId,
      sourceEventId: c.sourceEventId,
      status: "pending" as const,
      scheduledFor: scheduledFor(p.timezone),
    }));
  let inserted = 0;
  if (rows.length) {
    // Any unique conflict — notif_member_offer_cat above all — means the member already has this offer.
    const done = await tx
      .insert(notificationsTable)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: notificationsTable.id });
    inserted = done.length;
  }
  const last = page.at(-1);
  if (last) await tx.update(campaigns).set({ lastMemberId: last.memberId }).where(eq(campaigns.id, c.id));
  return { inserted, capped: capped.size };
}

/** The `campaign-fanout` job: pages through each open campaign's audience, one transaction per page, and marks it
 *  done. Never a query per member, never every member id in memory. An aborted run leaves the campaign `running`
 *  with its cursor; the next run resumes there. A campaign closed mid-run by its offer stops at the next page. */
export async function campaignFanout(deps: CampaignFanoutDeps): Promise<Metrics> {
  const size = deps.pageSize ?? PAGE;
  const m: Metrics = { campaigns: 0, pages: 0, inserted: 0, capped: 0 };
  while (!deps.signal?.aborted) {
    const c = await withTx(deps.db, (tx) => claimCampaign(tx));
    if (!c) break;
    let after = c.lastMemberId ?? null;
    let finished = false;
    let closed = false;
    while (!deps.signal?.aborted) {
      const page = await deps.members.audiencePage(undefined, {
        category: c.category === "offers_personal" ? "offers_personal" : "offers_broadcast",
        after,
        limit: size,
      });
      const last = page.at(-1);
      if (!last) {
        finished = true;
        break;
      }
      const now = deps.now?.() ?? new Date();
      const r = await withTx(deps.db, (tx) => fanOutPage(tx, c, page, now));
      if (!r) {
        closed = true; // by its offer's withdrawal or expiry: nothing more to write, nothing to mark
        break;
      }
      m.pages += 1;
      m.inserted += r.inserted;
      m.capped += r.capped;
      after = last.memberId;
    }
    if (closed) continue;
    if (!finished) break;
    await deps.db
      .update(campaigns)
      .set({ status: "done", finishedAt: sql`now()` })
      .where(and(eq(campaigns.id, c.id), eq(campaigns.status, "running")));
    m.campaigns += 1;
  }
  return m;
}

/**
 * Staging only (ADR-IMPL-040): the review account carries Figma's situations — the pins with their fares, the three
 * offers, a request in each state the server keeps, the inbox — with every date counted from today, so a demo never
 * shows a departure in the past, an expired offer or "Your October in London" in December.
 *   bun run scripts/seed-staging-demo.ts        (infra/deploy.sh runs it after every staging deploy)
 * Refuses any database that is not staging's or a local one. Idempotent: fixed ids and keys, rewritten in place, and
 * everything a demo did to the account is undone — a read or new inbox item, an offer tapped, a request made, a
 * preference or home airport changed, a password changed. The account's phones keep their sign-in.
 * The data is the fixture's (packages/shared/src/fixture.ts); only its dates move.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@bbc/db";
import { fares } from "@bbc/db/schema/catalog";
import { offerResponses } from "@bbc/db/schema/engagement";
import { notificationPreferences } from "@bbc/db/schema/members";
import { notificationsTable } from "@bbc/db/schema/notifications";
import { offers } from "@bbc/db/schema/proposals";
import { requestEvents, requests } from "@bbc/db/schema/requests";
import { loadEnv, type ServerEnv } from "@bbc/shared/env";
import { fixture } from "@bbc/shared/fixture";
import { ensureReviewAccount, reason, scriptAuth, type ReviewPersona } from "./seed-review-account";

/** Staging's database hosts (infra/compose.staging.yml). Production's are `postgres` and `pgbouncer`. */
const STAGING_DB_HOSTS = new Set(["postgres-staging", "pgbouncer-staging"]);
/** A laptop or CI: allowed only outside production mode, and never with production's origin. */
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRODUCTION_ORIGIN_HOST = "api.buybusinessclass.com";

/** Throws unless the database is staging's, or a local one outside production mode. */
export function assertStagingTarget(env: { NODE_ENV: string; DATABASE_URL: string; APP_ORIGIN: string }): void {
  const host = new URL(env.DATABASE_URL).hostname;
  if (STAGING_DB_HOSTS.has(host)) return;
  const local =
    LOCAL_DB_HOSTS.has(host) &&
    env.NODE_ENV !== "production" &&
    new URL(env.APP_ORIGIN).hostname !== PRODUCTION_ORIGIN_HOST;
  if (!local) throw new Error(`refused: the database at "${host}" is not staging's`);
}

/** Figma's member, worn by the review account on staging only. */
const NEW_YORK = "America/New_York";

export const DEMO_PERSONA: ReviewPersona = {
  displayName: fixture.member.name,
  phone: fixture.member.phone,
  homeAirport: fixture.member.homeAirport,
  timezone: NEW_YORK,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** UTC midnight, `n` days after `now`'s day. */
const dayStart = (now: Date, n: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** What `tz`'s wall clock reads at `at`. */
function wallClock(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** The instant `tz`'s wall clock reads `hhmm` on `day` (a UTC midnight) — the same clock across daylight saving. */
export function atLocal(day: Date, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const asUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h ?? 0, m ?? 0);
  let at = asUtc;
  for (let i = 0; i < 2; i++) {
    const c = wallClock(new Date(at), tz);
    const shown = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
    at += asUtc - shown;
  }
  return new Date(at);
}

const FARE = {
  ba: "00000000-0000-4000-8000-00000000fa01",
  vs: "00000000-0000-4000-8000-00000000fa02",
  af: "00000000-0000-4000-8000-00000000fa03",
  jl: "00000000-0000-4000-8000-00000000fa04",
  ek: "00000000-0000-4000-8000-00000000fa05",
  sq: "00000000-0000-4000-8000-00000000fa06",
} as const;

/** When each fixture fare leaves New York, in days from today, at Figma's clock. Undated fares stay undated; fa07,
 *  the closed one, is not shown anywhere in the demo. */
const DEPARTS: Record<string, { inDays: number; at: string } | null> = {
  [FARE.ba]: { inDays: 21, at: "18:55" },
  [FARE.vs]: { inDays: 21, at: "20:10" },
  [FARE.af]: null,
  [FARE.jl]: { inDays: 35, at: "12:30" },
  [FARE.ek]: null,
  [FARE.sq]: { inDays: 45, at: "21:00" },
};

/** Days since publication and days of validity left, per fixture offer — newest first, as the feed sorts. */
const OFFERS: Record<string, { publishedDaysAgo: number; validDays: number }> = {
  london: { publishedDaysAgo: 1, validDays: 19 },
  paris: { publishedDaysAgo: 4, validDays: 30 },
  tokyo: { publishedDaysAgo: 6, validDays: 33 },
};

/** Per fixture request: when it was made (days ago) and its trip (days from today), the fixture's lengths of stay. The
 *  fixture's fourth, "not sent", lives in the app's offline queue — the server never holds it. */
const REQUESTS: Record<string, { createdDaysAgo: number; out: number; back: number; fareId?: string }> = {
  "R-B001": { createdDaysAgo: 1, out: 21, back: 28, fareId: FARE.ba },
  "R-B002": { createdDaysAgo: 3, out: 26, back: 33 },
  "R-B003": { createdDaysAgo: 20, out: 54, back: 65 },
};

export const DEMO = { offerKey: (key: string) => `staging-demo:${key}` } as const;

/** `SET col = excluded.col` for every column of `row` but the conflict key — one multi-row upsert per table. */
function excluded<T extends PgTable>(table: T, row: Record<string, unknown>, conflictKey: string) {
  const set: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (key === conflictKey) continue;
    const column = (table as unknown as Record<string, { name: string }>)[key];
    if (!column) throw new Error(`staging demo: ${key} is not a column`);
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

/** Every row, computed from `now` — no I/O. */
export function demoPlan(member: { id: string; email: string }, now: Date) {
  const fareRows = fixture.fares
    .filter((f) => f.id in DEPARTS)
    .map((f) => {
      const plan = DEPARTS[f.id] ?? null;
      const departAt = plan ? atLocal(dayStart(now, plan.inDays), plan.at, NEW_YORK) : null;
      const arriveAt = departAt ? new Date(departAt.getTime() + f.durationMinutes * 60_000) : null;
      return {
        id: f.id,
        routeFrom: f.from.code,
        routeTo: f.to.code,
        cabin: f.cabin,
        carrier: f.carrier.code,
        carrierName: f.carrier.name,
        product: f.product,
        nonstop: f.nonstop,
        durationMinutes: f.durationMinutes,
        departAt,
        arriveAt,
        price: String(f.price.offer),
        publishedPrice: "published" in f.price ? String(f.price.published) : null,
        publishedSource: "publishedSource" in f.price ? f.price.publishedSource : null,
        currency: f.price.currency,
        source: "manual" as const,
        validFrom: new Date("2026-09-01T00:00:00.000Z"),
        // A dated fare closes the day before it leaves; an undated one stays two months.
        validUntil: departAt ? new Date(departAt.getTime() - DAY) : dayStart(now, 60),
        published: true,
      };
    });

  const londonDeparts = fareRows.find((f) => f.id === FARE.ba)?.departAt ?? dayStart(now, 21);
  const londonMonth = MONTHS[wallClock(londonDeparts, NEW_YORK).month - 1] ?? "";
  const offerRows = fixture.offers.map((o) => {
    const plan = OFFERS[o.key] ?? { publishedDaysAgo: 1, validDays: 30 };
    return {
      key: o.key,
      row: {
        idempotencyKey: DEMO.offerKey(o.key),
        source: o.targeting === "user" ? ("crm_agent" as const) : ("marketing_campaign" as const),
        targeting: o.targeting,
        targetMemberId: o.targeting === "user" ? member.id : null,
        routeFrom: o.from,
        routeTo: o.to,
        cabin: "business" as const,
        price: String(o.price),
        publishedPrice: String(o.published),
        currency: "USD",
        // "Your October in London" names the trip's month: it follows the flight.
        title: o.key === "london" ? o.title.replace(/^Your \S+ in /, `Your ${londonMonth} in `) : o.title,
        contextLine: "contextLine" in o ? o.contextLine : null,
        flightFacts: o.facts,
        publishAt: new Date(now.getTime() - plan.publishedDaysAgo * DAY),
        validUntil: dayStart(now, plan.validDays),
        status: "active" as const,
      },
    };
  });

  const requestRows = fixture.requests
    .filter((r) => r.reference in REQUESTS)
    .map((r) => {
      const plan = REQUESTS[r.reference]!;
      const [from = "", to = ""] = r.route.split(" → ");
      const createdAt = new Date(now.getTime() - plan.createdDaysAgo * DAY);
      const shift = createdAt.getTime() - new Date(r.createdAt).getTime();
      return {
        row: {
          id: r.id,
          reference: r.reference,
          memberId: member.id,
          idempotencyKey: `staging-demo:${r.reference}`,
          fareId: plan.fareId ?? null,
          offerId: null,
          intent: null,
          tripType: "round" as const,
          cabin: r.cabin,
          legs: [
            { from, to, date: ymd(dayStart(now, plan.out)) },
            { from: to, to: from, date: ymd(dayStart(now, plan.back)) },
          ],
          passengers: { ...r.passengers },
          priceAtRequest: String(r.priceAtRequest),
          contactName: fixture.member.name,
          contactPhone: fixture.member.phone,
          contactEmail: member.email,
          phoneE164: fixture.member.phone,
          phoneValid: false, // 555-01xx is a number reserved for fiction
          note: null,
          status: r.status as "received" | "quoted" | "booked",
          source: "ios" as const,
          sentToCrm: true, // already "sent": send-requests never picks a demo request up
          crmRequestId: `staging-demo-${r.reference}`,
          sentAt: new Date(createdAt.getTime() + 60_000),
          lastError: null,
          sendAttempts: 1,
          createdAt,
        },
        // The fixture's timeline, moved by the same amount: the gaps between its steps stay Figma's.
        events: r.timeline.map((e) => ({
          requestId: r.id,
          status: e.status as "received" | "quoted" | "booked",
          note: e.note,
          actor: "staging-demo",
          createdAt: new Date(new Date(e.at).getTime() + shift),
        })),
      };
    });

  return { fares: fareRows, offers: offerRows, requests: requestRows };
}

/** Writes the plan in one transaction and returns what the member now sees. Four upserts, one per table, then the
 *  account's own traces removed and the inbox written whole. */
export async function seedStagingDemo(db: Db, member: { id: string; email: string }, now = new Date()) {
  const plan = demoPlan(member, now);
  const fareRows = plan.fares;
  const offerRows = plan.offers.map((o) => o.row);
  const requestRows = plan.requests.map((r) => r.row);
  const requestIds = requestRows.map((r) => r.id);
  const eventRows = plan.requests.flatMap((r) => r.events);
  return db.transaction(async (tx) => {
    await tx
      .insert(fares)
      .values(fareRows)
      .onConflictDoUpdate({ target: fares.id, set: { ...excluded(fares, fareRows[0]!, "id"), updatedAt: now } });

    const saved = await tx
      .insert(offers)
      .values(offerRows)
      .onConflictDoUpdate({
        target: offers.idempotencyKey,
        set: { ...excluded(offers, offerRows[0]!, "idempotencyKey"), updatedAt: now },
      })
      .returning({ id: offers.id, idempotencyKey: offers.idempotencyKey });
    const offerIdByKey = new Map(
      plan.offers.map((o) => [o.key, saved.find((r) => r.idempotencyKey === o.row.idempotencyKey)?.id]),
    );

    await tx
      .insert(requests)
      .values(requestRows)
      .onConflictDoUpdate({
        target: requests.id,
        set: { ...excluded(requests, requestRows[0]!, "id"), updatedAt: now },
      });

    // What a demo did to the account, undone: requests it made, offers it tapped, preferences it saved, every inbox
    // row. Requests cascade to their events; the demo requests' events are rewritten below.
    await tx.delete(requests).where(and(eq(requests.memberId, member.id), notInArray(requests.id, requestIds)));
    await tx.delete(requestEvents).where(inArray(requestEvents.requestId, requestIds));
    await tx.insert(requestEvents).values(eventRows);
    await tx.delete(offerResponses).where(eq(offerResponses.memberId, member.id));
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.memberId, member.id));
    await tx.delete(notificationsTable).where(eq(notificationsTable.memberId, member.id));

    // The inbox as the handlers would have written it (titles, bodies, links), already delivered: the quote and the
    // personal offer unread, the two broadcasts read.
    const inbox: (typeof notificationsTable.$inferInsert)[] = [];
    const quoted = plan.requests.find((r) => r.row.status === "quoted");
    if (quoted) {
      const at = quoted.events.find((e) => e.status === "quoted")?.createdAt ?? quoted.row.createdAt;
      const leg = quoted.row.legs[0];
      inbox.push({
        memberId: member.id,
        category: "transactional",
        title: "Your quote is ready",
        body: `${leg?.from} → ${leg?.to} — tap to call your specialist`,
        deepLink: `bbcclub://requests/${quoted.row.id}`,
        requestId: quoted.row.id,
        sourceEventId: "staging-demo:quote",
        status: "sent",
        scheduledFor: at,
        sentAt: at,
        readAt: null,
        createdAt: at,
      });
    }
    for (const { key, row } of plan.offers) {
      const id = offerIdByKey.get(key);
      if (!id) throw new Error(`staging demo: offer ${key} not saved`);
      const at = row.publishAt;
      inbox.push({
        memberId: member.id,
        category: row.targeting === "user" ? "offers_personal" : "offers_broadcast",
        title: row.title,
        body: `${row.routeFrom} → ${row.routeTo}`,
        deepLink: `bbcclub://proposal/${id}`,
        offerId: id,
        sourceEventId: `staging-demo:${key}`,
        status: "sent",
        scheduledFor: at,
        sentAt: at,
        readAt: row.targeting === "user" ? null : new Date(at.getTime() + HOUR),
        createdAt: at,
      });
    }
    await tx.insert(notificationsTable).values(inbox);

    return {
      fares: fareRows.length,
      pins: new Set(fareRows.map((f) => f.routeTo)).size,
      offers: offerRows.length,
      requests: requestRows.length,
      inbox: inbox.length,
    };
  });
}

if (import.meta.main) {
  let env: ServerEnv;
  try {
    env = loadEnv();
    assertStagingTarget(env);
  } catch (e) {
    console.error("staging demo:", reason(e));
    process.exit(1);
  }
  if (!env.REVIEW_ACCOUNT_EMAIL || !env.REVIEW_ACCOUNT_PASSWORD) {
    console.error("staging demo: set REVIEW_ACCOUNT_EMAIL and REVIEW_ACCOUNT_PASSWORD (12+ characters) in staging.env");
    process.exit(1);
  }
  const email = env.REVIEW_ACCOUNT_EMAIL;
  const { db, auth, close } = scriptAuth(env, "bbc-staging-demo");
  try {
    const account = await ensureReviewAccount({
      auth,
      db,
      email,
      password: env.REVIEW_ACCOUNT_PASSWORD,
      persona: DEMO_PERSONA,
    });
    const now = new Date();
    const n = await seedStagingDemo(db, { id: account.memberId, email }, now);
    console.log(
      `staging demo ready — the review account ${account.created ? "created" : "refreshed"}; ${n.fares} fares (${n.pins} pins), ` +
        `${n.offers} offers, ${n.requests} requests, ${n.inbox} inbox items; dates from ${ymd(now)}`,
    );
  } catch (e) {
    console.error("staging demo failed:", reason(e));
    process.exitCode = 1;
  } finally {
    await close();
  }
  process.exit(process.exitCode ?? 0); // nothing of Better Auth's may keep the deploy step alive
}

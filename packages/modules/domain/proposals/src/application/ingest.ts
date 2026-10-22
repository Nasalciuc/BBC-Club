import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { offers, type FlightFacts } from "@bbc/db/schema/proposals";
import { event } from "@bbc/shared/events";
import type { IngestResult } from "../api";

const FlightFactsInput = z.object({
  nonstop: z.boolean(),
  durationMinutes: z.number().int().positive(),
  product: z.string().optional(),
  carrier: z.string().optional(),
  flightNumber: z.string().optional(),
  departLocal: z.string().optional(),
  arriveLocal: z.string().optional(),
}) satisfies z.ZodType<FlightFacts>;

/** An amount offers.price (numeric(10,2)) holds: at most eight digits before the point, two after, above zero. */
const Amount = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "an amount with at most 8 digits and 2 decimals")
  .refine((v) => Number(v) > 0, "must be above 0");
/** An IATA code, upper-cased: what the cards, the pins and the CHECK read. */
const Iata = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "three letters")
  .transform((v) => v.toUpperCase());

export const IngestInput = z
  .object({
    source: z.enum(["crm_agent", "marketing_campaign"]),
    targeting: z.enum(["user", "segment", "broadcast"]),
    /** A member's id is the auth user's id, a UUID (crypto.randomUUID): anything else is no member's. */
    targetMemberId: z.string().uuid().optional(),
    routeFrom: Iata,
    routeTo: Iata,
    cabin: z.enum(["business", "first"]),
    price: Amount,
    publishedPrice: Amount.optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/, "an ISO 4217 code")
      .transform((v) => v.toUpperCase())
      .optional(),
    title: z.string().min(1),
    body: z.string().optional(),
    validUntil: z.string().datetime(),
    publishAt: z.string().datetime().optional(),
    flightFacts: FlightFactsInput.optional(),
    /** The app loads it over the network: https only, as a place's photo (catalog.place_photos). */
    mediaUrl: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"), "an https address")
      .optional(),
    /** The rating the offer's cards print (02, 16: `★ 4.8`; ADR-IMPL-056): one to five, to one decimal place — given by
     *  the sender, never computed here. Absent: the offer has none, and no star is shown. */
    rating: z.number().min(1).max(5).multipleOf(0.1).optional(),
    createdBy: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.targeting === "user" && !v.targetMemberId) {
      ctx.addIssue({
        code: "custom",
        message: "targetMemberId required when targeting=user",
        path: ["targetMemberId"],
      });
    }
    if (v.targeting !== "user" && v.targetMemberId) {
      ctx.addIssue({ code: "custom", message: "targetMemberId only when targeting=user", path: ["targetMemberId"] });
    }
    // The offers CHECKs, so a payload they refuse is a 400 here and never a 500 the CRM retries for ever.
    if (v.routeFrom === v.routeTo) {
      ctx.addIssue({ code: "custom", message: "routeTo must differ from routeFrom", path: ["routeTo"] });
    }
    if (v.publishedPrice != null && Number(v.publishedPrice) < Number(v.price)) {
      ctx.addIssue({ code: "custom", message: "publishedPrice must be at least price", path: ["publishedPrice"] });
    }
    if (v.publishAt != null && Date.parse(v.validUntil) <= Date.parse(v.publishAt)) {
      ctx.addIssue({ code: "custom", message: "validUntil must be after publishAt", path: ["validUntil"] });
    }
  });

/** What the insert stores is checked against the clock there, not in the schema: a retry of a stored offer replays it
 *  (or is a 409) whatever the time, and only a new offer must still be valid when it goes out. */
export const VALID_UNTIL_PAST = "validUntil must be in the future";

export type IngestDeps = {
  db: Executor;
  events: {
    publish(
      tx: Executor,
      e: {
        type: string;
        version: number;
        aggregateType: string;
        aggregateId: string;
        memberId?: string | null;
        payload: unknown;
      },
    ): Promise<unknown>;
  };
};

/** Idempotent S2S ingest: same key → same offer id; same key + different payload → 409. */
export async function ingest(
  deps: IngestDeps,
  input: z.infer<typeof IngestInput>,
  idempotencyKey: string,
): Promise<IngestResult> {
  if (!idempotencyKey) return { ok: false, code: "BAD_KEY" };
  const existing = await deps.db.select().from(offers).where(eq(offers.idempotencyKey, idempotencyKey)).limit(1);
  if (existing[0]) return replay(existing[0], input);

  const publishAt = input.publishAt ? new Date(input.publishAt) : new Date();
  const validUntil = new Date(input.validUntil);
  // A new offer must still be valid when it goes out: after its publishAt, and after now.
  if (validUntil.getTime() <= Math.max(Date.now(), publishAt.getTime())) {
    return { ok: false, code: "VALIDATION", message: VALID_UNTIL_PAST };
  }

  return withTx(deps.db, async (tx): Promise<{ ok: true; offerId: string } | { ok: false; code: "CONFLICT" }> => {
    const [row] = await tx
      .insert(offers)
      .values({
        idempotencyKey,
        source: input.source,
        targeting: input.targeting,
        targetMemberId: input.targetMemberId ?? null,
        routeFrom: input.routeFrom.toUpperCase(),
        routeTo: input.routeTo.toUpperCase(),
        cabin: input.cabin,
        price: input.price,
        publishedPrice: input.publishedPrice ?? null,
        currency: input.currency ?? "USD",
        title: input.title,
        body: input.body ?? null,
        flightFacts: input.flightFacts ?? null,
        mediaUrl: input.mediaUrl ?? null,
        rating: input.rating != null ? input.rating.toFixed(1) : null,
        publishAt,
        validUntil,
        status: "active",
        createdBy: input.createdBy ?? null,
      })
      .onConflictDoNothing({ target: offers.idempotencyKey })
      .returning({ id: offers.id });
    if (!row) {
      // The same key twice at once (a CRM retry racing the first call) and the other committed first: ON CONFLICT
      // waited for it, and this statement sees its row. Replay it — or 409 if the payload differs — as a retry would.
      const [first] = await tx.select().from(offers).where(eq(offers.idempotencyKey, idempotencyKey)).limit(1);
      if (!first) throw new Error("ingest: insert returned no row");
      return replay(first, input);
    }

    await deps.events.publish(tx, {
      type: "offer.published",
      version: 1,
      aggregateType: "offer",
      aggregateId: row.id,
      memberId: input.targetMemberId ?? null,
      payload: event("offer.published", {
        offerId: row.id,
        targeting: input.targeting,
        targetMemberId: input.targetMemberId ?? null,
        routeFrom: input.routeFrom.toUpperCase(),
        routeTo: input.routeTo.toUpperCase(),
        cabin: input.cabin,
        title: input.title,
        validUntil: validUntil.toISOString(),
        publishedAt: publishAt.toISOString(),
      }),
    });
    return { ok: true as const, offerId: row.id };
  });
}

/** Same key: the same offer if the payload matches, 409 if it does not. Every field the insert stores from the input
 *  is compared, normalised the way Postgres gives it back: numerics by value, timestamps by instant, jsonb without
 *  key order, absent optionals as null, the currency default. An omitted publishAt matches only when the stored
 *  publish_at is the insert's now() (within 2s of created_at). A scheduled time the retry drops is a conflict. */
function replay(
  row: typeof offers.$inferSelect,
  input: z.infer<typeof IngestInput>,
): { ok: true; offerId: string } | { ok: false; code: "CONFLICT" } {
  const num = (v: string | null | undefined) => (v == null ? null : Number(v));
  const instant = (v: Date | string | null | undefined) => (v == null ? null : new Date(v).getTime());
  const publishedMs = instant(row.publishAt);
  const createdMs = instant(row.createdAt);
  const publishAtSame =
    input.publishAt === undefined
      ? publishedMs != null && createdMs != null && Math.abs(publishedMs - createdMs) <= 2_000
      : publishedMs === instant(input.publishAt);
  const same =
    row.source === input.source &&
    row.targeting === input.targeting &&
    (row.targetMemberId ?? null) === (input.targetMemberId ?? null) &&
    row.routeFrom === input.routeFrom.toUpperCase() &&
    row.routeTo === input.routeTo.toUpperCase() &&
    row.cabin === input.cabin &&
    num(row.price) === num(input.price) &&
    num(row.publishedPrice) === num(input.publishedPrice) &&
    row.currency === (input.currency ?? "USD") &&
    row.title === input.title &&
    (row.body ?? null) === (input.body ?? null) &&
    instant(row.validUntil) === instant(input.validUntil) &&
    publishAtSame &&
    canonical(row.flightFacts ?? null) === canonical(input.flightFacts ?? null) &&
    (row.mediaUrl ?? null) === (input.mediaUrl ?? null) &&
    num(row.rating) === (input.rating ?? null) &&
    (row.createdBy ?? null) === (input.createdBy ?? null);
  return same ? { ok: true, offerId: row.id } : { ok: false, code: "CONFLICT" };
}

/** jsonb does not keep key order: compare objects by sorted keys. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, sort(x)]),
        )
      : v;
  return JSON.stringify(sort(value));
}

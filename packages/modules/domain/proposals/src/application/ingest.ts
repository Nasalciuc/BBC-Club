import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { offers, type FlightFacts } from "@bbc/db/schema/proposals";
import { event } from "@bbc/shared/events";

const FlightFactsInput = z.object({
  nonstop: z.boolean(),
  durationMinutes: z.number().int().positive(),
  product: z.string().optional(),
  carrier: z.string().optional(),
  flightNumber: z.string().optional(),
  departLocal: z.string().optional(),
  arriveLocal: z.string().optional(),
}) satisfies z.ZodType<FlightFacts>;

export const IngestInput = z
  .object({
    source: z.enum(["crm_agent", "marketing_campaign"]),
    targeting: z.enum(["user", "segment", "broadcast"]),
    targetMemberId: z.string().min(1).optional(),
    routeFrom: z.string().length(3),
    routeTo: z.string().length(3),
    cabin: z.enum(["business", "first"]),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    publishedPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
    currency: z.string().length(3).optional(),
    title: z.string().min(1),
    body: z.string().optional(),
    validUntil: z.string().datetime(),
    publishAt: z.string().datetime().optional(),
    flightFacts: FlightFactsInput.optional(),
    mediaUrl: z.string().url().optional(),
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
  });

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
): Promise<{ ok: true; offerId: string } | { ok: false; code: "CONFLICT" | "BAD_KEY" }> {
  if (!idempotencyKey) return { ok: false, code: "BAD_KEY" };
  const existing = await deps.db.select().from(offers).where(eq(offers.idempotencyKey, idempotencyKey)).limit(1);
  if (existing[0]) return replay(existing[0], input);

  return withTx(deps.db, async (tx): Promise<{ ok: true; offerId: string } | { ok: false; code: "CONFLICT" }> => {
    const publishAt = input.publishAt ? new Date(input.publishAt) : new Date();
    const validUntil = new Date(input.validUntil);
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

/** Same key: the same offer if the payload matches, 409 if it does not. */
function replay(
  row: typeof offers.$inferSelect,
  input: z.infer<typeof IngestInput>,
): { ok: true; offerId: string } | { ok: false; code: "CONFLICT" } {
  const same =
    row.source === input.source &&
    row.targeting === input.targeting &&
    (row.targetMemberId ?? null) === (input.targetMemberId ?? null) &&
    row.routeFrom === input.routeFrom.toUpperCase() &&
    row.routeTo === input.routeTo.toUpperCase() &&
    row.cabin === input.cabin &&
    row.price === input.price &&
    row.title === input.title;
  return same ? { ok: true, offerId: row.id } : { ok: false, code: "CONFLICT" };
}

import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { offers } from "@bbc/db/schema/proposals";
import { event } from "@bbc/shared/events";

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
    flightFacts: z.record(z.unknown()).optional(),
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
  if (existing[0]) {
    const row = existing[0];
    const same =
      row.source === input.source &&
      row.targeting === input.targeting &&
      (row.targetMemberId ?? null) === (input.targetMemberId ?? null) &&
      row.routeFrom === input.routeFrom.toUpperCase() &&
      row.routeTo === input.routeTo.toUpperCase() &&
      row.cabin === input.cabin &&
      row.price === input.price &&
      row.title === input.title;
    if (!same) return { ok: false, code: "CONFLICT" };
    return { ok: true, offerId: row.id };
  }

  return withTx(deps.db, async (tx) => {
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
        flightFacts: (input.flightFacts as any) ?? null,
        mediaUrl: input.mediaUrl ?? null,
        publishAt,
        validUntil,
        status: "active",
        createdBy: input.createdBy ?? null,
      })
      .returning({ id: offers.id });
    if (!row) throw new Error("ingest: insert returned no row");

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

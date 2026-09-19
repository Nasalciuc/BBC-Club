import { z } from "zod";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { event } from "@bbc/shared/events";
import type { RequestsRepo } from "../infrastructure/requests.repo";

export const RequestStatusPayload = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["received", "assigned", "quoted", "booked", "closed"]),
  note: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
});

type Publish = (
  tx: Executor,
  e: {
    type: string;
    version: number;
    aggregateType: string;
    aggregateId: string;
    memberId: string | null;
    payload: unknown;
  },
) => Promise<void>;

/** CRM webhook. Idempotent by (requestId, status): same status twice writes one event. */
export async function setStatus(exec: Executor, raw: unknown, deps: { repo: RequestsRepo; publish: Publish }) {
  const evt = RequestStatusPayload.parse(raw);
  return withTx(exec, async (tx) => {
    const current = await deps.repo.getById(tx, evt.requestId);
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
    if (current.status === evt.status) return { ok: true as const, unchanged: true as const };

    const from = current.status;
    const row = await deps.repo.setStatus(tx, evt.requestId, evt.status, evt.note ?? null, evt.agentId ?? "crm");
    if (!row) return { ok: false as const, code: "NOT_FOUND" as const };

    const legs = current.legs as { from: string; to: string }[];
    const firstLeg = legs?.[0];
    const lastLeg = legs?.[legs.length - 1];
    const route = firstLeg && lastLeg ? `${firstLeg.from} → ${lastLeg.to}` : undefined;

    await deps.publish(tx, {
      type: "request.status_changed",
      version: 1,
      aggregateType: "request",
      aggregateId: evt.requestId,
      memberId: current.memberId,
      payload: event("request.status_changed", {
        requestId: evt.requestId,
        memberId: current.memberId,
        from,
        to: evt.status,
        route,
        changedAt: new Date().toISOString(),
      }),
    });

    return { ok: true as const, unchanged: false as const };
  });
}

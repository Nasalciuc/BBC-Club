import { z } from "zod";
import type { Executor } from "@bbc/db";
import { withTx } from "@bbc/db";
import { event } from "@bbc/shared/events";
import type { RequestsRepo } from "../infrastructure/requests.repo";
import { requestRoute } from "./route";

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

export type RequestStatus = z.infer<typeof RequestStatusPayload>["status"];

/** A request only moves forward: an old e-mail's link or a late webhook never takes it back (a booked trip back to
 *  quoted brings the Requests dot back), and nothing reopens a closed one — Delete account closes and redacts it. */
const NEXT: Record<RequestStatus, readonly RequestStatus[]> = {
  received: ["assigned", "quoted", "booked", "closed"],
  assigned: ["quoted", "booked", "closed"],
  quoted: ["booked", "closed"],
  booked: ["closed"],
  closed: [],
};

export function canMove(from: RequestStatus, to: RequestStatus): boolean {
  return NEXT[from].includes(to);
}

/** CRM webhook and operator links. The row is locked while its status is read, so racing calls with one status write
 *  and publish it once: the others wait and find it done (`unchanged`). A step back is refused (`CONFLICT`) and writes
 *  nothing. */
export async function setStatus(exec: Executor, raw: unknown, deps: { repo: RequestsRepo; publish: Publish }) {
  const evt = RequestStatusPayload.parse(raw);
  return withTx(exec, async (tx) => {
    const current = await deps.repo.lockById(tx, evt.requestId);
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
    if (current.status === evt.status) return { ok: true as const, unchanged: true as const };

    const from = current.status;
    if (!canMove(from, evt.status)) {
      return { ok: false as const, code: "CONFLICT" as const, from, to: evt.status };
    }
    const row = await deps.repo.setStatus(tx, evt.requestId, from, evt.status, evt.note ?? null, evt.agentId ?? "crm");
    if (!row) return { ok: false as const, code: "NOT_FOUND" as const };

    // The quote-ready push reads this: `JFK → LHR — a specialist will call you shortly`, never the way home.
    const route = requestRoute(current.legs, current.tripType) || undefined;

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

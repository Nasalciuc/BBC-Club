import { z } from "zod";
import { RequestBody } from "@bbc/shared/api/v1/requests";

export const MAX_QUEUE_ATTEMPTS = 6;

/** Local queue ids are `q_` + UUID so they never collide with server request ids. */
export const QueuedRequestSchema = z.object({
  id: z.string().regex(/^q_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  body: RequestBody,
  idempotencyKey: z.string().min(1),
  enqueuedAt: z.string().datetime(),
  attempts: z.number().int().nonnegative().default(0),
});
export const QueuedRequestList = z.array(QueuedRequestSchema);
export type QueuedRequest = z.infer<typeof QueuedRequestSchema>;

export type SubmitResult = { ok: boolean; status?: number };

export type ItemOutcome = "sent" | "dropped" | "failed";

/** Parse the MMKV blob. `JSON.parse` sits next to `safeParse` on purpose (check-modules). */
export function parseQueue(raw: string): { ok: true; items: QueuedRequest[] } | { ok: false } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const parsed = QueuedRequestList.safeParse(json);
  if (!parsed.success) return { ok: false };
  return { ok: true, items: parsed.data };
}

export function classifySubmit(result: SubmitResult | "throw"): "sent" | "drop" | "session" | "bump" {
  if (result === "throw") return "bump";
  if (result.ok) return "sent";
  if (result.status === 400 || result.status === 409) return "drop";
  if (result.status === 401 || result.status === 403) return "session";
  return "bump";
}

export function afterAttempt(
  item: QueuedRequest,
  result: SubmitResult | "throw",
): { outcome: ItemOutcome; keep: QueuedRequest | null } {
  const kind = classifySubmit(result);
  if (kind === "sent") return { outcome: "sent", keep: null };
  if (kind === "drop") return { outcome: "dropped", keep: null };
  const attempts = item.attempts + 1;
  if (kind === "bump" && attempts >= MAX_QUEUE_ATTEMPTS) {
    return { outcome: "dropped", keep: null };
  }
  return { outcome: "failed", keep: { ...item, attempts } };
}

export async function flushItems(
  pending: QueuedRequest[],
  submit: (body: QueuedRequest["body"], key: string) => Promise<SubmitResult>,
): Promise<{ sent: number; failed: number; dropped: number; remaining: QueuedRequest[] }> {
  let sent = 0;
  let failed = 0;
  let dropped = 0;
  const remaining: QueuedRequest[] = [];
  for (const item of pending) {
    let result: SubmitResult | "throw";
    try {
      result = await submit(item.body, item.idempotencyKey);
    } catch {
      result = "throw";
    }
    const { outcome, keep } = afterAttempt(item, result);
    if (outcome === "sent") sent += 1;
    else if (outcome === "dropped") dropped += 1;
    else failed += 1;
    if (keep) remaining.push(keep);
  }
  return { sent, failed, dropped, remaining };
}

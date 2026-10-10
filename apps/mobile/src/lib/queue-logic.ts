import { z } from "zod";
import { RequestBody } from "@bbc/shared/api/v1/requests";

/**
 * The offline queue's rules — pure, so they are tested without React Native. Figma 325:8384 (Send now): "Attempt
 * delivery of the queued request when connectivity is available. While offline, keep the request saved locally. Never
 * discard it." So a request leaves the phone only once the server has it: being offline costs no attempt, a server
 * failure waits longer each time and is retried for as long as it takes, and a request the server refuses for good
 * stays on the phone, saying so, until the member has had time to call (`REJECTED_KEPT_MS`).
 */

/** Minutes before the next try after a server failure: 1, 2, 4, 8, 16, then every 30. */
export const BACKOFF_MINUTES = [1, 2, 4, 8, 16, 30] as const;

/** A request the server refused for good stays on the phone this long, asking the member to call, then goes. */
export const REJECTED_KEPT_MS = 7 * 24 * 60 * 60_000;

/** Local queue ids are `q_` + UUID so they never collide with server request ids. */
export const QueuedRequestSchema = z.object({
  id: z.string().regex(/^q_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  body: RequestBody,
  idempotencyKey: z.string().min(1),
  enqueuedAt: z.string().datetime(),
  /** Server failures so far; being offline is not one. Drives the wait before the next try, never a removal. */
  attempts: z.number().int().nonnegative().default(0),
  notBefore: z.string().datetime().optional(),
  /** The destination's city, for the card's title while the request waits (Figma 240:5199). Older items have none. */
  city: z.string().nullable().optional(),
  /** When the server refused it for good (400: the details no longer pass; 409: the key belongs to someone else). It is
   *  never tried again; the member is asked to call. */
  rejectedAt: z.string().datetime().optional(),
});
export const QueuedRequestList = z.array(QueuedRequestSchema);
export type QueuedRequest = z.infer<typeof QueuedRequestSchema>;

/** What `submitRequest` answers: `status` 0 is no network (offline or a timeout). */
export type SubmitResult = { ok: boolean; status?: number; retryAfterS?: number };

/** What happened to one request in a flush. `skipped`: not tried (it waits, or the server refused it before). */
export type ItemOutcome = "sent" | "offline" | "failed" | "rejected" | "skipped";

/**
 * Parse the MMKV blob item by item: one item that no longer reads (an older app's shape, a hand edit) is set aside on
 * its own instead of taking the whole queue with it. Not JSON, or not a list: nothing reads. `JSON.parse` sits next to
 * `safeParse` on purpose (check-modules).
 */
export function parseQueue(raw: string): { ok: true; items: QueuedRequest[]; bad: unknown[] } | { ok: false } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(json)) return { ok: false };
  const items: QueuedRequest[] = [];
  const bad: unknown[] = [];
  for (const entry of json) {
    const parsed = QueuedRequestSchema.safeParse(entry);
    if (parsed.success) items.push(parsed.data);
    else bad.push(entry);
  }
  return { ok: true, items, bad };
}

export function classifySubmit(
  result: SubmitResult | "throw",
): "sent" | "offline" | "wait" | "rejected" | "session" | "retry" {
  if (result === "throw") return "retry";
  if (result.ok) return "sent";
  if (result.status === 0) return "offline";
  if (result.status === 429) return "wait";
  if (result.status === 400 || result.status === 409) return "rejected";
  if (result.status === 401 || result.status === 403) return "session";
  return "retry";
}

/** The wait after the n-th server failure (n ≥ 1). */
export function backoffMs(attempts: number): number {
  const step = BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1] ?? 30;
  return step * 60_000;
}

/** One try's result for one request: what happened, and the request as it stays on the phone (null once sent). */
export function afterAttempt(
  item: QueuedRequest,
  result: SubmitResult | "throw",
  now = Date.now(),
): { outcome: ItemOutcome; keep: QueuedRequest | null } {
  const kind = classifySubmit(result);
  if (kind === "sent") return { outcome: "sent", keep: null };
  // No network, or a session to renew (a 401 signs the member out, which clears the queue): no attempt is counted.
  if (kind === "offline") return { outcome: "offline", keep: item };
  if (kind === "session") return { outcome: "failed", keep: item };
  if (kind === "wait") {
    const waitS = result !== "throw" && result.retryAfterS && result.retryAfterS > 0 ? result.retryAfterS : 60;
    return { outcome: "failed", keep: { ...item, notBefore: new Date(now + waitS * 1000).toISOString() } };
  }
  if (kind === "rejected") return { outcome: "rejected", keep: { ...item, rejectedAt: new Date(now).toISOString() } };
  const attempts = item.attempts + 1;
  return {
    outcome: "failed",
    keep: { ...item, attempts, notBefore: new Date(now + backoffMs(attempts)).toISOString() },
  };
}

/**
 * Try each request in turn; one request's failure never stops the others. A request that waits (`notBefore`) is left
 * for later unless the member asked (`manual`, Send now); one the server refused before is never tried again.
 * `stillOurs` is asked before each try: once the queue was cleared (a sign-out), nothing more is sent from it.
 */
export async function flushItems(
  pending: QueuedRequest[],
  submit: (body: QueuedRequest["body"], key: string) => Promise<SubmitResult>,
  now = Date.now(),
  opts: { manual?: boolean; stillOurs?: () => boolean } = {},
): Promise<{
  sent: number;
  failed: number;
  outcomes: Record<string, ItemOutcome>;
  /** Each request tried, as it now stands: null once sent. */
  results: Map<string, QueuedRequest | null>;
}> {
  let sent = 0;
  let failed = 0;
  const outcomes: Record<string, ItemOutcome> = {};
  const results = new Map<string, QueuedRequest | null>();
  for (const item of pending) {
    if (
      item.rejectedAt ||
      (!opts.manual && item.notBefore && Date.parse(item.notBefore) > now) ||
      (opts.stillOurs && !opts.stillOurs())
    ) {
      outcomes[item.id] = "skipped";
      continue;
    }
    let result: SubmitResult | "throw";
    try {
      result = await submit(item.body, item.idempotencyKey);
    } catch {
      result = "throw";
    }
    const { outcome, keep } = afterAttempt(item, result, now);
    outcomes[item.id] = outcome;
    results.set(item.id, keep);
    if (outcome === "sent") sent += 1;
    else failed += 1;
  }
  return { sent, failed, outcomes, results };
}

/**
 * The queue after a flush, applied by id onto the queue as it is NOW: a request saved while the flush was sending
 * stays; one removed meanwhile stays removed; a sent one goes; a tried one is replaced by what the try left.
 */
export function applyResults(current: QueuedRequest[], results: Map<string, QueuedRequest | null>): QueuedRequest[] {
  return current.flatMap((q) => {
    if (!results.has(q.id)) return [q];
    const kept = results.get(q.id);
    return kept ? [kept] : [];
  });
}

/** A refused request leaves the phone `REJECTED_KEPT_MS` after the refusal; every other one stays until it is sent. */
export function pruneExpired(items: QueuedRequest[], now = Date.now()): QueuedRequest[] {
  return items.filter((q) => !q.rejectedAt || now - Date.parse(q.rejectedAt) < REJECTED_KEPT_MS);
}

/** How soon to try again a request waiting on the phone — with nothing else bringing it out (the app stays in the
 *  foreground, online, and nobody opens Requests) — and the longest that wait grows to. */
export const RETRY_SOON_MS = 30_000;
export const RETRY_SOON_MAX_MS = 5 * 60_000;

/**
 * When the next flush is due, in ms from `now`, or null when nothing waits: soon for a request due now (one saved after
 * a timeout, one the last try could not reach), at its `notBefore` for one that waits after a server failure. A
 * refused request is never due. `quietTries`: tries in a row, by this timer, that sent nothing — each doubles "soon"
 * (30 s, 1, 2, 4, then every 5 minutes), so a server that does not answer is not asked every 30 seconds.
 */
export function nextFlushDelay(items: readonly QueuedRequest[], now = Date.now(), quietTries = 0): number | null {
  let earliest: number | null = null;
  for (const q of items) {
    if (q.rejectedAt) continue;
    const at = q.notBefore ? Date.parse(q.notBefore) : now;
    if (earliest === null || at < earliest) earliest = at;
  }
  if (earliest === null) return null;
  const soon = Math.min(RETRY_SOON_MS * 2 ** Math.min(Math.max(quietTries, 0), 4), RETRY_SOON_MAX_MS);
  return earliest <= now ? soon : Math.max(earliest - now, 1_000);
}

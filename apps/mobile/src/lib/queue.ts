import { createMMKV } from "react-native-mmkv";
import { RequestBody } from "@bbc/shared/api/v1/requests";
import { newId } from "./id";
import {
  applyResults,
  flushItems,
  parseQueue,
  pruneExpired,
  type ItemOutcome,
  type QueuedRequest,
  type SubmitResult,
} from "./queue-logic";

const storage = createMMKV({ id: "bbc-request-queue" });
const KEY = "pending";
/** The member whose requests `pending` holds (`adoptQueue`). */
const OWNER = `${KEY}.owner`;
/** Another member's requests, set aside until they sign in again. */
const setAside = (member: string) => `${KEY}.of.${member}`;

export type { ItemOutcome, QueuedRequest };

export type FlushResult = { sent: number; failed: number; outcomes: Record<string, ItemOutcome> };

type Submit = (body: RequestBody, key: string) => Promise<SubmitResult>;

const listeners = new Set<() => void>();

/** Requests saved so far in this process: a flush that began before the latest one did not see it. */
let saved = 0;
/** Bumped by `clearQueue` (sign-out): a flush begun before it sends nothing more and writes nothing back. */
let generation = 0;

/** Called after every change to the queue — the Requests screen re-reads it (a flush may run from anywhere). */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeAll(items: QueuedRequest[]): void {
  storage.set(KEY, JSON.stringify(items));
  for (const listener of listeners) listener();
}

/**
 * The queue as stored. A blob that does not read at all is set aside once (`pending.corrupt.<time>`) and the queue
 * starts empty — never a new copy on every read. Items that no longer read are set aside on their own; the rest stay.
 */
function readAll(now = Date.now()): QueuedRequest[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  const parsed = parseQueue(raw);
  if (!parsed.ok) {
    storage.set(`${KEY}.corrupt.${now}`, raw);
    storage.remove(KEY);
    return [];
  }
  const kept = pruneExpired(parsed.items, now);
  if (parsed.bad.length > 0) storage.set(`${KEY}.corrupt.${now}`, JSON.stringify(parsed.bad));
  if (parsed.bad.length > 0 || kept.length !== parsed.items.length) writeAll(kept);
  return kept;
}

/**
 * Save a request on the phone. Null when its details do not pass `RequestBody` — it could never be sent, so it is not
 * saved (the sheet shows why). The same Idempotency-Key twice (a double tap) saves it once.
 */
export function enqueueRequest(body: RequestBody, idempotencyKey: string, city?: string | null): QueuedRequest | null {
  const valid = RequestBody.safeParse(body);
  if (!valid.success) return null;
  const pending = readAll();
  const existing = pending.find((q) => q.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const item: QueuedRequest = {
    id: `q_${newId()}`,
    body: valid.data,
    idempotencyKey,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    ...(city ? { city } : {}),
  };
  saved += 1;
  writeAll([item, ...pending]);
  return item;
}

export function listQueued(): QueuedRequest[] {
  return readAll();
}

export function getQueued(id: string): QueuedRequest | null {
  return readAll().find((q) => q.id === id) ?? null;
}

export function removeQueued(id: string): void {
  writeAll(readAll().filter((q) => q.id !== id));
}

/** Drop only the live `pending` blob — leave `.corrupt.*` backups for forensics. A flush under way stops sending:
 *  the previous member's requests never go out under the next member's session. */
export function clearQueue(): void {
  generation += 1;
  storage.remove(KEY);
  storage.remove(OWNER);
  for (const listener of listeners) listener();
}

/** Two stored queues as one, each request once (by its Idempotency-Key); one that does not read is set aside. */
function joined(current: string, restored: string, now = Date.now()): string {
  const a = parseQueue(current);
  const b = parseQueue(restored);
  if (!b.ok) {
    storage.set(`${KEY}.corrupt.${now}`, restored);
    return current;
  }
  if (!a.ok) {
    storage.set(`${KEY}.corrupt.${now}`, current);
    return restored;
  }
  const keys = new Set(a.items.map((q) => q.idempotencyKey));
  return JSON.stringify([...a.items, ...b.items.filter((q) => !keys.has(q.idempotencyKey)), ...a.bad, ...b.bad]);
}

/**
 * The requests on the phone are the signed-in member's. Called whenever a member is signed in (each sign-in, each start
 * of the app). When they were saved by another member — whose session ended without a sign-out (it expired), so
 * nothing cleared them — they are set aside for that member: never sent under this account, never shown to it, and
 * back when that member signs in again. This member's own, set aside before, come back now. Requests saved by an older
 * app, with no owner, are this member's. The owner is written before any of this member's requests come back, so an
 * app stopped half-way never leaves one member's requests under another's name: the next call finishes the move.
 */
export function adoptQueue(member: string): void {
  const owner = storage.getString(OWNER);
  const mine = storage.getString(setAside(member));
  if (owner === member && !mine) return;
  if (owner !== member) {
    // A flush under way sends from the queue as it was: it sends nothing more and writes nothing back.
    generation += 1;
    if (owner) {
      const theirs = storage.getString(KEY);
      const before = storage.getString(setAside(owner));
      if (theirs) storage.set(setAside(owner), before ? joined(before, theirs) : theirs);
      storage.remove(KEY);
    }
    storage.set(OWNER, member);
  }
  if (mine) {
    // Each request once (by its Idempotency-Key), even if a move cut short left a copy on both sides.
    const current = storage.getString(KEY);
    storage.set(KEY, current ? joined(current, mine) : mine);
    storage.remove(setAside(member));
  }
  for (const listener of listeners) listener();
}

export type FlushOpts = { only?: string };

/** The flush in progress: whether it covers the whole queue, and how many requests had been saved when it began. */
let inFlight: { full: boolean; saved: number; run: Promise<FlushResult> } | null = null;

/** Whether a flush that has just finished already answered this caller. */
function answered(flight: { full: boolean; saved: number }, result: FlushResult, opts: FlushOpts): boolean {
  if (opts.only) {
    // Sent by it, or refused for good: final either way. Skipped (it was waiting), or a try that did not get through —
    // one that may have begun before the member pressed Send now — answers nothing: Send now makes its own try next.
    const outcome = result.outcomes[opts.only];
    return outcome === "sent" || outcome === "rejected";
  }
  // The whole queue, as it is now: nothing saved since that flush read it.
  return flight.full && flight.saved === saved;
}

/**
 * Send what waits on the phone; one request's failure never stops the others. One flush at a time: a caller that
 * finds one running waits for it, and is answered by it when it covered that caller's request (the whole queue as it is
 * now, or the one request asked for, sent or refused); otherwise its own flush runs next. Caller must await.
 */
export async function flushQueue(submit: Submit, opts: FlushOpts = {}): Promise<FlushResult> {
  for (;;) {
    const flight = inFlight;
    if (!flight) break;
    const result = await flight.run.catch(() => null);
    if (result && answered(flight, result, opts)) return result;
  }
  const run = runFlush(submit, opts);
  const flight = { full: !opts.only, saved, run };
  inFlight = flight;
  try {
    return await run;
  } finally {
    if (inFlight === flight) inFlight = null;
  }
}

async function runFlush(submit: Submit, opts: FlushOpts): Promise<FlushResult> {
  const ours = generation;
  const stillOurs = () => generation === ours;
  const pending = readAll();
  const targets = opts.only ? pending.filter((q) => q.id === opts.only) : pending;
  if (targets.length === 0) return { sent: 0, failed: 0, outcomes: {} };
  const { sent, failed, outcomes, results } = await flushItems(targets, submit, Date.now(), {
    manual: Boolean(opts.only),
    stillOurs,
  });
  // Cleared meanwhile (a sign-out): nothing of it is written back.
  if (!stillOurs()) return { sent, failed, outcomes };
  // Re-read: a request saved while this flush was sending must not be overwritten by the snapshot taken before it.
  writeAll(applyResults(readAll(), results));
  return { sent, failed, outcomes };
}

/** Send one queued request now (Send now): it goes even if it was waiting; its own outcome is in `outcomes[id]`. */
export async function sendOne(id: string, submit: Submit): Promise<FlushResult> {
  return flushQueue(submit, { only: id });
}

import { createMMKV } from "react-native-mmkv";
import type { RequestBody } from "@bbc/shared/api/v1/requests";
import { flushItems, parseQueue, type QueuedRequest, type SubmitResult } from "./queue-logic";

const storage = createMMKV({ id: "bbc-request-queue" });
const KEY = "pending";

export type { QueuedRequest };

function readAll(): QueuedRequest[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  const parsed = parseQueue(raw);
  if (parsed.ok) return parsed.items;
  storage.set(`${KEY}.corrupt.${Date.now()}`, raw);
  return [];
}

function writeAll(items: QueuedRequest[]): void {
  storage.set(KEY, JSON.stringify(items));
}

export function enqueueRequest(body: RequestBody, idempotencyKey: string): QueuedRequest {
  const item: QueuedRequest = {
    id: `q_${crypto.randomUUID()}`,
    body,
    idempotencyKey,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };
  writeAll([item, ...readAll()]);
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

export type FlushOpts = { only?: string };

/** Flush the queue. One item's failure must not stop the others. Caller must await. */
export async function flushQueue(
  submit: (body: RequestBody, key: string) => Promise<SubmitResult>,
  opts?: FlushOpts,
): Promise<{ sent: number; failed: number; dropped: number }> {
  const pending = readAll();
  const targets = opts?.only ? pending.filter((q) => q.id === opts.only) : pending;
  if (targets.length === 0) return { sent: 0, failed: 0, dropped: 0 };

  const { sent, failed, dropped, remaining } = await flushItems(targets, submit);
  const next = pending.flatMap((q) => {
    if (opts?.only && q.id !== opts.only) return [q];
    const kept = remaining.find((r) => r.id === q.id);
    return kept ? [kept] : [];
  });
  writeAll(next);
  return { sent, failed, dropped };
}

/** Send a single queued item (same path as flush with `{ only }`). */
export async function sendOne(
  id: string,
  submit: (body: RequestBody, key: string) => Promise<SubmitResult>,
): Promise<{ sent: number; failed: number; dropped: number }> {
  return flushQueue(submit, { only: id });
}

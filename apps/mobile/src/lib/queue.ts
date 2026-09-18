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
    id: crypto.randomUUID(),
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

export function removeQueued(id: string): void {
  writeAll(readAll().filter((q) => q.id !== id));
}

/** Flush the queue. One item's failure must not stop the others. Caller must await. */
export async function flushQueue(
  submit: (body: RequestBody, key: string) => Promise<SubmitResult>,
): Promise<{ sent: number; failed: number; dropped: number }> {
  const pending = readAll();
  const { sent, failed, dropped, remaining } = await flushItems(pending, submit);
  writeAll(remaining);
  return { sent, failed, dropped };
}

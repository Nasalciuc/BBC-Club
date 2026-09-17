import { createMMKV } from "react-native-mmkv";
import type { RequestBody } from "@bbc/shared/api/v1/requests";

const storage = createMMKV({ id: "bbc-request-queue" });
const KEY = "pending";

export type QueuedRequest = {
  id: string;
  body: RequestBody;
  idempotencyKey: string;
  enqueuedAt: string;
};

function readAll(): QueuedRequest[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueuedRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

/** Flush the queue. Caller must await each submit — no fire-and-forget. */
export async function flushQueue(
  submit: (body: RequestBody, key: string) => Promise<{ ok: boolean }>,
): Promise<{ sent: number; failed: number }> {
  const pending = readAll();
  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await submit(item.body, item.idempotencyKey);
    if (result.ok) {
      removeQueued(item.id);
      sent += 1;
    } else {
      failed += 1;
    }
  }
  return { sent, failed };
}

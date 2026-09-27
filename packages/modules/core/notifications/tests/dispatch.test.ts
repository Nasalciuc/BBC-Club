import { expect, test, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { MembersFacade } from "@bbc/members";
import type { PushSender } from "../src/ports/push";
import { dispatch, type DispatchDeps } from "../src/application/dispatch";

let iso: IsolatedDb;
beforeAll(async () => {
  iso = await isolatedDb("notif-dispatch", { max: 4 });
});
afterAll(() => iso.drop());

const members = {
  getStatus: async () => "active",
  preferencesOf: async () => ({ offers_personal: false, offers_broadcast: false }),
} as MembersFacade;

function deps(push: PushSender, extra: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    db: iso.db,
    push,
    members,
    publish: async () => undefined,
    ...extra,
  };
}

async function insertNotification(category: "transactional" | "offers_personal", memberId: string) {
  const id = crypto.randomUUID();
  await iso.db.execute(sql`
    INSERT INTO notifications.notifications (id, member_id, category, title, body, status, scheduled_for)
    VALUES (${id}::uuid, ${memberId}, ${category}, 'Your quote is ready', 'A specialist has a quote', 'pending', now())`);
  return id;
}

async function insertToken(memberId: string, token: string) {
  await iso.db.execute(sql`
    INSERT INTO notifications.device_tokens (member_id, device_id, platform, native_token, active)
    VALUES (${memberId}, ${`dev-${token}`}, 'ios', ${token}, true)`);
}

function rowList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && "rows" in raw) {
    const rows = (raw as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

async function rowOf(id: string) {
  const rows = z
    .array(z.object({ status: z.string(), attempts: z.coerce.number(), last_error: z.string().nullable() }))
    .parse(
      rowList(
        await iso.db.execute(
          sql`SELECT status, attempts, last_error FROM notifications.notifications WHERE id = ${id}::uuid`,
        ),
      ),
    );
  return rows[0];
}

async function statusOf(id: string) {
  return (await rowOf(id))?.status;
}

async function insertSending(memberId: string, attempts: number) {
  const id = crypto.randomUUID();
  await iso.db.execute(sql`
    INSERT INTO notifications.notifications
      (id, member_id, category, title, body, status, attempts, claimed_at, scheduled_for)
    VALUES (
      ${id}::uuid, ${memberId}, 'transactional', 'Your quote is ready', 'stuck',
      'sending', ${attempts}, now() - interval '1 hour', now() + interval '1 day'
    )`);
  return id;
}

async function tokenActive(token: string) {
  const rows = z
    .array(z.object({ active: z.boolean() }))
    .parse(
      rowList(await iso.db.execute(sql`SELECT active FROM notifications.device_tokens WHERE native_token = ${token}`)),
    );
  return rows[0]?.active;
}

test("the claim transaction commits before the first send", async () => {
  const memberId = `m-${crypto.randomUUID()}`;
  const id = await insertNotification("transactional", memberId);
  await insertToken(memberId, `tok-${id}`);
  const other = postgres(iso.url, { max: 1, onnotice: () => {} });
  let seen: string | undefined;
  try {
    await dispatch(
      deps({
        send: async (input) => {
          const rows = await other<{ status: string }[]>`
            SELECT status FROM notifications.notifications WHERE id = ${id}::uuid`;
          seen = rows[0]?.status;
          expect(input.collapseId).toBe(id);
          await Bun.sleep(200);
          return { ok: true, ticketId: "ticket-1" };
        },
      }),
    );
  } finally {
    await other.end();
  }
  expect(seen).toBe("sending");
  expect(await statusOf(id)).toBe("delivered");
});

test("one thrown send does not drop the rest of the batch", async () => {
  const memberA = `m-${crypto.randomUUID()}`;
  const memberB = `m-${crypto.randomUUID()}`;
  const thrown = await insertNotification("transactional", memberA);
  const kept = await insertNotification("transactional", memberB);
  await insertToken(memberA, `tok-throw-${thrown}`);
  await insertToken(memberB, `tok-keep-${kept}`);
  await dispatch(
    deps({
      send: async (input) => {
        if (input.collapseId === thrown) throw new Error("provider down");
        return { ok: true, ticketId: "kept" };
      },
    }),
  );
  expect(await statusOf(kept)).toBe("delivered");
  const failedSend = await rowOf(thrown);
  expect(failedSend?.status).toBe("pending");
  expect(failedSend?.attempts).toBe(1);
});

test("the reaper counts a killed send and stops at six", async () => {
  const young = await insertSending(`m-${crypto.randomUUID()}`, 0);
  const old = await insertSending(`m-${crypto.randomUUID()}`, 5);
  let sends = 0;
  await dispatch(
    deps(
      {
        send: async () => {
          sends += 1;
          return { ok: true, ticketId: "nope" };
        },
      },
      { stuckAfter: sql`interval '1 millisecond'` },
    ),
  );
  const again = await rowOf(young);
  expect(again?.status).toBe("pending");
  expect(again?.attempts).toBe(1);
  const dead = await rowOf(old);
  expect(dead?.status).toBe("failed");
  expect(dead?.attempts).toBe(6);
  expect(dead?.last_error).toBe("reaped");
  expect(sends).toBe(0);
});

test("an abort after the claim returns those rows to pending", async () => {
  const memberId = `m-${crypto.randomUUID()}`;
  const id = await insertNotification("transactional", memberId);
  await insertToken(memberId, `tok-abort-${id}`);
  const signal = AbortSignal.abort();
  let sends = 0;
  await dispatch(
    deps(
      {
        send: async () => {
          sends += 1;
          return { ok: true, ticketId: "late" };
        },
      },
      { signal },
    ),
  );
  expect(sends).toBe(0);
  expect(await statusOf(id)).toBe("pending");
});

test("Unregistered deactivates the token", async () => {
  const memberId = `m-${crypto.randomUUID()}`;
  const token = `tok-dead-${crypto.randomUUID()}`;
  const id = await insertNotification("transactional", memberId);
  await insertToken(memberId, token);
  await dispatch(
    deps({
      send: async () => ({ ok: false, reason: "Unregistered" }),
    }),
  );
  expect(await tokenActive(token)).toBe(false);
  expect(await statusOf(id)).toBe("failed");
});

test("a transactional quote-ready row is not suppressed by offer preferences", async () => {
  const memberId = `m-${crypto.randomUUID()}`;
  const id = await insertNotification("transactional", memberId);
  await insertToken(memberId, `tok-quote-${id}`);
  let collapseId: string | undefined;
  await dispatch(
    deps({
      send: async (input) => {
        collapseId = input.collapseId;
        return { ok: true, ticketId: "quote" };
      },
    }),
  );
  expect(collapseId).toBe(id);
  expect(await statusOf(id)).toBe("delivered");
});

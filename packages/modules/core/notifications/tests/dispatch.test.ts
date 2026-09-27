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

async function statusOf(id: string) {
  const rows = z
    .array(z.object({ status: z.string() }))
    .parse(rowList(await iso.db.execute(sql`SELECT status FROM notifications.notifications WHERE id = ${id}::uuid`)));
  return rows[0]?.status;
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

test("a crash after the claim is reaped on the next run", async () => {
  const memberId = `m-${crypto.randomUUID()}`;
  const id = await insertNotification("transactional", memberId);
  await insertToken(memberId, `tok-crash-${id}`);
  const stuckAfter = sql`interval '1 millisecond'`;
  await expect(
    dispatch(
      deps(
        {
          send: async () => {
            throw new Error("provider down");
          },
        },
        { stuckAfter },
      ),
    ),
  ).rejects.toThrow("provider down");
  expect(await statusOf(id)).toBe("sending");
  await Bun.sleep(20);
  await dispatch(
    deps(
      {
        send: async () => ({ ok: true, ticketId: "after-reap" }),
      },
      { stuckAfter },
    ),
  );
  expect(await statusOf(id)).toBe("delivered");
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

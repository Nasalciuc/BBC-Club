/** Account deletion, failure injection: every member.deleted consumer writes only through its delivery
 *  transaction. If that transaction fails after their writes, nothing is half-deleted — the profile, the member's
 *  rows and the journal (not yet tombstoned) are exactly as before, and the redelivery starts from there. */
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import type { HandlerTx } from "@bbc/shared/module-contract";
import { testApp } from "./helpers/test-app";

describe("account deletion — transaction boundaries", () => {
  it("a failure after every member.deleted handler has written leaves the member's data as it was", async () => {
    const t = await testApp({ suite: "delete-boundaries" });
    const memberId = t.memberA.id;
    await t.seedMemberData(memberId);
    const state = async (exec: Executor) =>
      (
        (await exec.execute(sql`SELECT
          (SELECT count(*)::int FROM members.profile WHERE member_id = ${memberId}) AS profile,
          (SELECT count(*)::int FROM notifications.notifications WHERE member_id = ${memberId}) AS notifications,
          (SELECT count(*)::int FROM notifications.device_tokens WHERE member_id = ${memberId}) AS devices,
          (SELECT count(*)::int FROM platform.domain_events
             WHERE member_id = ${memberId} AND payload ? 'tombstoned') AS tombstoned`)) as unknown as Record<
          string,
          number
        >[]
      )[0];
    const before = await state(t.db as unknown as Executor);
    expect(before).toMatchObject({ profile: 1, notifications: 1, devices: 1, tombstoned: 0 });

    const consumers = t.platform.events.registry.consumersOf("member.deleted");
    expect(consumers.length).toBeGreaterThanOrEqual(6);
    const payload = { type: "member.deleted", version: 1, memberId, deletedAt: new Date().toISOString() };
    const injected = new Error("injected after the handlers' writes");
    let inside: Record<string, number> | undefined;
    await t.db
      .transaction(async (tx) => {
        for (const consumer of consumers) {
          const handler = t.platform.events.registry.handlerFor("member.deleted", consumer);
          if (!handler) throw new Error(`no handler ${consumer}`);
          await handler(
            {
              tx: tx as unknown as HandlerTx,
              event: {
                id: "0",
                type: "member.deleted",
                version: 1,
                aggregateType: "member",
                aggregateId: memberId,
                memberId,
                occurredAt: new Date(),
              },
              principal: { kind: "system", role: "system", source: "handler", actorMemberId: memberId },
              deliveryId: "0",
              logger: t.platform.logger,
              attempt: 1,
              signal: new AbortController().signal,
            },
            payload,
          );
        }
        inside = await state(tx as unknown as Executor);
        throw injected;
      })
      .catch((e: unknown) => {
        if (e !== injected) throw e;
      });

    // The handlers did write — inside the transaction …
    expect(inside).toMatchObject({ profile: 0, notifications: 0, devices: 0 });
    expect(inside?.tombstoned).toBeGreaterThan(0);
    // … and none of it survived the failure.
    expect(await state(t.db as unknown as Executor)).toEqual(before);
    await t.close();
  });
});

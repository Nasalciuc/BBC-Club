import { describe, it, expect } from "bun:test";
import { testAuth } from "./helpers/test-auth";

describe("account deletion — zero rows everywhere", () => {
  it("removes auth rows, cascades our schemas via member.deleted, tombstones the journal", async () => {
    const ctx = await testAuth();
    const email = `del+${Date.now()}@test.dev`;
    const cookie = await ctx.signedInCookie(email, "atlantic2026!");
    const memberId = (await ctx.db.execute(`SELECT id FROM auth."user" WHERE email=$1`, [email]))[0].id;
    await ctx.seedMemberData(memberId); // profile + device + notification + response
    await ctx.auth.api.deleteUser({ headers: new Headers({ Cookie: cookie }), body: {} });
    await ctx.runHandlers(); // poller: member.deleted → cascades
    for (const [schema, table] of [
      ["auth", "user"],
      ["auth", "session"],
      ["members", "profile"],
      ["notifications", "device_tokens"],
      ["notifications", "notifications"],
      ["engagement", "offer_responses"],
    ]) {
      const n = (
        await ctx.db.execute(
          `SELECT count(*)::int AS n FROM ${schema}."${table}" WHERE ${table === "user" ? "id" : "member_id"} = $1`,
          [memberId],
        )
      )[0].n;
      expect({ schema, table, n }).toEqual({ schema, table, n: 0 });
    }
    const tombstoned = await ctx.journal.forMember(memberId);
    expect(tombstoned.every((e) => !JSON.stringify(e.payload).includes(email))).toBe(true);
  });
});

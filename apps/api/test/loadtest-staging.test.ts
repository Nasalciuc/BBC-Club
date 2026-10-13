/** scripts/loadtest-staging.ts through the real routes: k6's members can read; stop leaves no row of theirs. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import type { IdentityFacade } from "@bbc/identity";
import type { PublishInput } from "@bbc/shared/events";
import { parseArgs, startLoad, stopLoad } from "../../../scripts/loadtest-staging";
import { testApp } from "./helpers/test-app";

describe("load-test accounts", () => {
  it("start signs in members k6 can read with; a second start replaces the first; stop removes them as deletion does", async () => {
    const t = await testApp({ suite: "loadtest" });
    const auth = t.registry.facade<IdentityFacade>("identity").auth;
    const deps = {
      auth,
      db: t.db,
      publish: (tx: unknown, input: PublishInput) => t.platform.events.publish(tx, input),
    };
    const loadIds = async () =>
      (
        (await t.db.execute(
          sql`SELECT id FROM auth."user" WHERE email LIKE 'load%@load.test' ORDER BY email`,
        )) as unknown as { id: string }[]
      ).map((r) => r.id);

    const first = await startLoad(deps, 3);
    expect(first).toHaveLength(3);
    await t.drainAll(); // member.registered, as after a sign-up from the app
    for (const s of first) {
      for (const path of ["/v1/home", "/v1/proposals", "/v1/requests", "/v1/profile"]) {
        expect((await t.app.request(path, { headers: { Cookie: s.cookie } })).status, path).toBe(200);
      }
    }
    const profile = (await (await t.app.request("/v1/profile", { headers: { Cookie: first[0]!.cookie } })).json()) as {
      homeAirport: string;
    };
    expect(profile.homeAirport).toBe("JFK");
    const firstIds = await loadIds();

    const second = await startLoad(deps, 2);
    expect(second).toHaveLength(2);
    const secondIds = await loadIds();
    expect(secondIds).toHaveLength(2);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false); // the first run's accounts are gone, not reused

    expect(await stopLoad(deps)).toBe(2);
    await t.drainAll(); // member.deleted, as after a deletion from the app
    const ids = [...firstIds, ...secondIds];
    const left = (await t.db.execute(sql`
      SELECT (SELECT count(*) FROM auth."user" WHERE id IN ${ids})
           + (SELECT count(*) FROM auth.session WHERE user_id IN ${ids})
           + (SELECT count(*) FROM auth.account WHERE user_id IN ${ids})
           + (SELECT count(*) FROM members.profile WHERE member_id IN ${ids}) AS n`)) as unknown as { n: string }[];
    expect(Number(left[0]?.n)).toBe(0);
    expect((await t.app.request("/v1/home", { headers: { Cookie: t.memberA.cookie } })).status).toBe(200);
    await t.close();
  });

  it("takes start COUNT OUT or stop, nothing else", () => {
    expect(parseArgs(["start", "200", "/out/sessions.json"])).toEqual({
      kind: "start",
      count: 200,
      out: "/out/sessions.json",
    });
    expect(parseArgs(["stop"])).toEqual({ kind: "stop" });
    for (const bad of [
      [],
      ["start"],
      ["start", "0", "x"],
      ["start", "2001", "x"],
      ["start", "1.5", "x"],
      ["stop", "x"],
    ]) {
      expect(() => parseArgs(bad)).toThrow(/usage/);
    }
  });
});

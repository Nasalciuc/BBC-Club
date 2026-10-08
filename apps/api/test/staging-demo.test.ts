/** The staging demo (ADR-IMPL-040) through the real routes: what the review account sees after the script runs. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";

import { HomeVM, SearchResultVM } from "@bbc/shared/api/v1/fares";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
import { FeedVM, InboxVM } from "@bbc/shared/api/v1/proposals";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { fixture } from "@bbc/shared/fixture";
import type { IdentityFacade } from "@bbc/identity";
import { ensureReviewAccount } from "../../../scripts/seed-review-account";
import { DEMO_PERSONA, seedStagingDemo } from "../../../scripts/seed-staging-demo";
import { testApp } from "./helpers/test-app";

const DAY = 86_400_000;

describe("staging demo", () => {
  it("gives the review account Figma's situations, dated from today, and does it again without a trace", async () => {
    const t = await testApp({ suite: "staging-demo" });
    const auth = t.registry.facade<IdentityFacade>("identity").auth;
    const email = "review.staging-demo@test.dev";
    const password = "review-demo-password-1";

    // The account: created once, verified, active, Figma's member; a second run finds it.
    const first = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    expect(first.created).toBe(true);
    await t.drainAll(); // member.registered → the profile the handler would write, after ours
    const again = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    expect(again).toEqual({ memberId: first.memberId, created: false, passwordRestored: false });

    // A password changed in the app is put back to the environment's.
    const ctx = await auth.$context;
    await ctx.internalAdapter.updatePassword(first.memberId, await ctx.password.hash("changed-by-a-tester-9"));
    await expect(t.auth.cookieFor(email, password)).rejects.toThrow(/sign-in failed/);
    expect((await ensureReviewAccount({ auth, db: t.db, email, password })).passwordRestored).toBe(true);
    const cookie = { headers: { Cookie: await t.auth.cookieFor(email, password) } };

    const profile = ProfileVM.parse(await (await t.app.request("/v1/profile", cookie)).json());
    expect(profile.status).toBe("active");
    expect(profile.displayName).toBe(fixture.member.name);
    expect(profile.homeAirport).toBe("JFK");
    expect(profile.crmLinked).toBe(false); // our own account, never a CRM client

    const now = new Date();
    const member = { id: first.memberId, email };
    const counts = await seedStagingDemo(t.db, member, now);
    expect(counts).toEqual({ fares: 6, pins: 5, offers: 3, requests: 3, inbox: 4 });
    const total = async () =>
      (
        (await t.db.execute(
          sql`SELECT (SELECT count(*) FROM proposals.offers) + (SELECT count(*) FROM catalog.fares)
            + (SELECT count(*) FROM requests.requests) + (SELECT count(*) FROM requests.request_events)
            + (SELECT count(*) FROM notifications.notifications) + (SELECT count(*) FROM engagement.offer_responses)
            + (SELECT count(*) FROM members.notification_preferences) AS n`,
        )) as unknown as { n: string }[]
      )[0]?.n;
    const clean = await total();

    // Explore: the pins from the fixture's fares, three cards — London personal, with the FOR YOU context line.
    const home = HomeVM.parse(await (await t.app.request("/v1/home", cookie)).json());
    expect(home.home?.code).toBe("JFK");
    expect(home.destinations.map((d) => d.code).sort()).toEqual(["CDG", "DXB", "HND", "LHR", "SIN"]);
    expect(home.destinations.find((d) => d.code === "LHR")).toMatchObject({ fromPrice: 4200, hasOffer: true });
    const feed = FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json());
    expect(feed.items.map((i) => i.title)).toEqual([
      expect.stringMatching(/^Your \w+ in London$/),
      "Autumn in Paris",
      "Tokyo before the holidays",
    ]);
    expect(feed.items[0]).toMatchObject({ targeting: "personal", contextLine: "You flew this route in March." });
    for (const card of feed.items) expect(Date.parse(card.validUntil)).toBeGreaterThan(now.getTime());

    // Search: London has its two fares, leaving in three weeks at Figma's clock; the poster route has none.
    const search = SearchResultVM.parse(
      await (await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", cookie)).json(),
    );
    expect(search.items.map((f) => f.carrier.code).sort()).toEqual(["BA", "VS"]);
    const ba = search.items.find((f) => f.carrier.code === "BA")!;
    // 07:00 in London — 06:00 in the week New York still has summer time and London no longer does: real clocks.
    expect([ba.departLocal, ba.arriveDayOffset]).toEqual(["18:55", 1]);
    expect(ba.arriveLocal).toMatch(/^0[67]:00$/);
    expect(Date.parse(ba.departAt!) - now.getTime()).toBeGreaterThan(20 * DAY);
    const zurich = SearchResultVM.parse(
      await (await t.app.request("/v1/search?from=JFK&to=ZRH&cabin=business", cookie)).json(),
    );
    expect(zurich.items).toEqual([]);

    // Requests: one in each state the server keeps, all "sent", trips ahead; the quote has its two timeline steps.
    const list = (await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] };
    const items = list.items.map((r) => RequestVM.parse(r));
    expect(items.map((r) => [r.reference, r.status])).toEqual([
      ["R-B001", "received"],
      ["R-B002", "quoted"],
      ["R-B003", "booked"],
    ]);
    expect(items.find((r) => r.reference === "R-B002")?.timeline.map((e) => e.status)).toEqual(["received", "quoted"]);
    expect(items.every((r) => r.dates.length > 0)).toBe(true);

    // Inbox: the quote and the personal offer unread, the two broadcasts read.
    const inbox = InboxVM.parse(await (await t.app.request("/v1/inbox", cookie)).json());
    expect(inbox.unreadCount).toBe(2);
    expect(inbox.items.map((i) => [i.title, i.read])).toEqual([
      [expect.stringMatching(/^Your \w+ in London$/), false],
      ["Your quote is ready", false],
      ["Autumn in Paris", true],
      ["Tokyo before the holidays", true],
    ]);
    expect(inbox.items.find((i) => i.title === "Your quote is ready")?.deepLink).toMatch(/^bbcclub:\/\/requests\//);

    // A demo moves things: reads an item, taps an offer, makes a request, saves preferences, changes the home airport.
    const unread = inbox.items.find((i) => !i.read)!;
    await t.app.request(`/v1/inbox/${unread.id}/read`, { method: "POST", ...cookie });
    await t.db.execute(sql`INSERT INTO engagement.offer_responses (offer_id, member_id, response)
      VALUES (${feed.items[1]!.id}::uuid, ${first.memberId}, 'interested')`);
    expect((await t.submitRequestAs({ cookie: cookie.headers.Cookie }, t.sampleRequestBody())).status).toBe(201);
    await t.app.request("/v1/profile/preferences", {
      method: "PUT",
      headers: { ...cookie.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ offers: false }),
    });
    await t.app.request("/v1/profile/travel", {
      method: "PUT",
      headers: { ...cookie.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ cabin: "first" }),
    });
    await t.db.execute(sql`UPDATE members.profile SET home_airport = 'LAX' WHERE member_id = ${first.memberId}`);
    expect(((await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] }).items.length).toBe(4);

    // The next run puts everything back — the row count returns to the clean state's: nothing left behind, nothing
    // of another member's touched.
    expect(await total()).not.toBe(clean);
    await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    expect(await seedStagingDemo(t.db, member, new Date(now.getTime() + 3 * DAY))).toEqual(counts);
    expect(await total()).toBe(clean);
    expect(InboxVM.parse(await (await t.app.request("/v1/inbox", cookie)).json()).unreadCount).toBe(2);
    const reset = ProfileVM.parse(await (await t.app.request("/v1/profile", cookie)).json());
    expect([reset.homeAirport, reset.preferences, reset.notifications.offers]).toEqual(["JFK", {}, true]);
    expect(FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json()).items.map((i) => i.state)).toEqual(
      ["unseen", "unseen", "unseen"],
    );
    expect(((await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] }).items.length).toBe(3);

    // The account deleted by a tester: the next run makes a new one, and the demo rows follow it.
    await t.db.execute(sql`DELETE FROM auth."user" WHERE id = ${first.memberId}`);
    const renewed = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    expect(renewed.created).toBe(true);
    expect(renewed.memberId).not.toBe(first.memberId);
    expect(await seedStagingDemo(t.db, { id: renewed.memberId, email }, now)).toEqual(counts);
    const renewedCookie = { headers: { Cookie: await t.auth.cookieFor(email, password) } };
    expect(FeedVM.parse(await (await t.app.request("/v1/proposals", renewedCookie)).json()).items.length).toBe(3);
    expect(
      ((await (await t.app.request("/v1/requests", renewedCookie)).json()) as { items: unknown[] }).items.length,
    ).toBe(3);

    // Never a real member: an e-mail that names a linked member (or an operator) is refused, and nothing changes.
    await expect(
      ensureReviewAccount({ auth, db: t.db, email: t.memberA.email, password, persona: DEMO_PERSONA }),
    ).rejects.toThrow(/refused/);
    expect(await t.auth.cookieFor(t.memberA.email)).toBeTruthy(); // the fixture password still signs in

    // Nothing of it reaches another member.
    const other = InboxVM.parse(
      await (await t.app.request("/v1/inbox", { headers: { Cookie: t.memberB.cookie } })).json(),
    );
    expect(other.items).toEqual([]);
    await t.close();
  }, 60_000);
});

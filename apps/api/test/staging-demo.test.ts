/** The staging demo (ADR-IMPL-040) through the real routes: what the review account sees after the script runs. */
import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { HomeVM, SearchResultVM } from "@bbc/shared/api/v1/fares";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
import { FeedVM, InboxVM } from "@bbc/shared/api/v1/proposals";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { fixture } from "@bbc/shared/fixture";
import type { IdentityFacade } from "@bbc/identity";
import { ensureReviewAccount } from "../../../scripts/seed-review-account";
import { DEMO_PERSONA, seedStagingDemo } from "../../../scripts/seed-staging-demo";
import { testApp } from "./helpers/test-app";

const HOUR = 3_600_000;

/** The app's publisher, as the script's own run builds it: its registry knows every consumer. */
const appEvents = (t: Awaited<ReturnType<typeof testApp>>): Parameters<typeof seedStagingDemo>[3] => ({
  publish: (tx, e) => t.platform.events.publish(tx, { ...e, publishedBy: "proposals" }),
});

describe("staging demo", () => {
  it("gives the review account its own situations, dated from today, and does it again without a trace", async () => {
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
    // Better Auth's own hasher, directly: the breach check wraps ctx.password.hash and needs a request (as in production).
    await ctx.internalAdapter.updatePassword(first.memberId, await hashPassword("changed-by-a-tester-9"));
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
    const counts = await seedStagingDemo(t.db, member, now, appEvents(t));
    expect(counts).toEqual({ offers: 1, requests: 3, inbox: 2, retired: { offers: 0, fares: 0 } });
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

    // Explore: no pin of the demo's — the catalogue is every member's, and the demo writes no fare — and one card, the
    // account's own London offer, with the FOR YOU context line.
    const home = HomeVM.parse(await (await t.app.request("/v1/home", cookie)).json());
    expect(home.home?.code).toBe("JFK");
    expect(home.destinations).toEqual([]);
    const feed = FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json());
    expect(feed.items.map((i) => i.title)).toEqual([expect.stringMatching(/^Your \w+ in London$/)]);
    expect(feed.items[0]).toMatchObject({ targeting: "personal", contextLine: "You flew this route in March." });
    for (const card of feed.items) expect(Date.parse(card.validUntil)).toBeGreaterThan(now.getTime());

    // Search: the demo put no fare on sale.
    const search = SearchResultVM.parse(
      await (await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", cookie)).json(),
    );
    expect(search.items).toEqual([]);

    // Requests: one in each state the server keeps, all "sent", trips ahead; the quote has its two timeline steps.
    const list = (await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] };
    const items = list.items.map((r) => RequestVM.parse(r));
    expect(items.map((r) => [r.reference, r.status])).toEqual([
      ["R-B001", "received"],
      ["R-B002", "quoted"],
      ["R-B003", "booked"],
    ]);
    expect(items.find((r) => r.reference === "R-B002")?.timeline.map((e) => e.status)).toEqual(["received", "quoted"]);
    // The quote ready strikes its fare's published price, as the fare request recorded it (ADR-IMPL-046).
    expect(items.find((r) => r.reference === "R-B002")?.publishedAtRequest).toEqual({
      amount: 6900,
      source: "Sabre · 16 Sep",
    });
    // Each fare request names the airline its fare had (ADR-IMPL-056); the third was made without a fare.
    expect(items.map((r) => r.carrier)).toEqual([
      { code: "BA", name: "British Airways" },
      { code: "AF", name: "Air France" },
      null,
    ]);
    expect(items.every((r) => r.dates.length > 0)).toBe(true);

    // Inbox: the quote and the personal offer, unread; no broadcast.
    const inbox = InboxVM.parse(await (await t.app.request("/v1/inbox", cookie)).json());
    expect(inbox.unreadCount).toBe(2);
    expect(inbox.items.map((i) => [i.title, i.read])).toEqual([
      [expect.stringMatching(/^Your \w+ in London$/), false],
      ["Your quote is ready", false],
    ]);
    expect(inbox.items.find((i) => i.title === "Your quote is ready")?.deepLink).toMatch(/^bbcclub:\/\/requests\//);

    // A demo moves things: reads an item, taps an offer, makes a request, saves preferences, changes the home airport.
    const unread = inbox.items.find((i) => !i.read)!;
    await t.app.request(`/v1/inbox/${unread.id}/read`, { method: "POST", ...cookie });
    await t.db.execute(sql`INSERT INTO engagement.offer_responses (offer_id, member_id, response)
      VALUES (${feed.items[0]!.id}::uuid, ${first.memberId}, 'interested')`);
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
    // A deploy later the same day: a run dated days ahead would put London's publishAt (a day before the run) after
    // the real clock, and the feed shows no offer before its publishAt.
    expect(await seedStagingDemo(t.db, member, new Date(now.getTime() + 3 * HOUR), appEvents(t))).toEqual(counts);
    expect(await total()).toBe(clean);
    expect(InboxVM.parse(await (await t.app.request("/v1/inbox", cookie)).json()).unreadCount).toBe(2);
    const reset = ProfileVM.parse(await (await t.app.request("/v1/profile", cookie)).json());
    expect([reset.homeAirport, reset.preferences, reset.notifications.offers]).toEqual(["JFK", {}, true]);
    expect(FeedVM.parse(await (await t.app.request("/v1/proposals", cookie)).json()).items.map((i) => i.state)).toEqual(
      ["unseen"],
    );
    expect(((await (await t.app.request("/v1/requests", cookie)).json()) as { items: unknown[] }).items.length).toBe(3);

    // The account deleted by a tester: the next run makes a new one, and the demo rows follow it.
    await t.db.execute(sql`DELETE FROM auth."user" WHERE id = ${first.memberId}`);
    const renewed = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    expect(renewed.created).toBe(true);
    expect(renewed.memberId).not.toBe(first.memberId);
    expect(await seedStagingDemo(t.db, { id: renewed.memberId, email }, now, appEvents(t))).toEqual(counts);
    const renewedCookie = { headers: { Cookie: await t.auth.cookieFor(email, password) } };
    expect(FeedVM.parse(await (await t.app.request("/v1/proposals", renewedCookie)).json()).items.length).toBe(1);
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

  // ADR-IMPL-040, amendment of 30 Oct 2026: runs before it wrote the fixture's fares (the pins on every member's globe)
  // and the demo's broadcast offers (Paris and Tokyo in every member's Explore). The next run retires them once —
  // offers withdrawn as the withdraw route does it, fares unpublished — and leaves the catalogue's real fares alone.
  it("retires what earlier runs wrote for every member, once, and keeps the real catalogue", async () => {
    const t = await testApp({ suite: "staging-demo-retire" });
    await t.seedCatalogBasics(); // the catalogue's own fares: JFK → LHR by BA, VS and AA
    const auth = t.registry.facade<IdentityFacade>("identity").auth;
    const email = "review.staging-retire@test.dev";
    const password = "review-demo-password-1";
    const account = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    await t.drainAll();
    const cookie = { headers: { Cookie: await t.auth.cookieFor(email, password) } };
    const member = { id: account.memberId, email };
    const events = appEvents(t);

    // What a run before the amendment left: the fixture's fares on sale, the demo's broadcasts active.
    for (const f of fixture.fares) {
      await t.db.execute(sql`
        INSERT INTO catalog.fares (id, route_from, route_to, cabin, carrier, carrier_name, nonstop, price, currency,
          source, valid_from, valid_until, published)
        VALUES (${f.id}::uuid, ${f.from.code}, ${f.to.code}, ${f.cabin}, ${f.carrier.code}, ${f.carrier.name},
          ${f.nonstop}, ${String(f.price.offer)}, 'USD', 'manual', now() - interval '1 day', now() + interval '30 days',
          true)`);
    }
    for (const key of ["paris", "tokyo"]) {
      const o = fixture.offers.find((x) => x.key === key)!;
      await t.db.execute(sql`
        INSERT INTO proposals.offers (idempotency_key, source, targeting, route_from, route_to, cabin, price,
          published_price, currency, title, valid_until, status)
        VALUES (${`staging-demo:${key}`}, 'marketing_campaign', 'broadcast', ${o.from}, ${o.to}, 'business',
          ${String(o.price)}, ${String(o.published)}, 'USD', ${o.title}, now() + interval '30 days', 'active')`);
    }
    const lhr = async () =>
      SearchResultVM.parse(
        await (await t.app.request("/v1/search?from=JFK&to=LHR&cabin=business", cookie)).json(),
      ).items.map((f) => f.price.offer);
    const published = async () =>
      Number(
        (
          (await t.db.execute(sql`
            SELECT count(*)::int AS n FROM catalog.fares
            WHERE id::text LIKE '00000000-0000-4000-8000-00000000fa%' AND published`)) as unknown as { n: number }[]
        )[0]?.n,
      );
    const withdrawnEvents = async () => (await t.journal.byType("offer.withdrawn")).length;
    expect((await lhr()).length).toBeGreaterThan(3); // the fixture's BA and VS beside the catalogue's three
    expect(await published()).toBeGreaterThan(0);

    const first = await seedStagingDemo(t.db, member, new Date(), events);
    expect(first.retired).toEqual({ offers: 2, fares: fixture.fares.length });
    expect(await withdrawnEvents()).toBe(2); // pending pushes suppressed by their consumers, as from the route
    expect(await published()).toBe(0);
    // The catalogue's own fares are untouched: London keeps exactly its three.
    expect((await lhr()).sort()).toEqual([4200, 4350, 4490]);
    const statuses = (await t.db.execute(sql`
      SELECT idempotency_key AS key, status FROM proposals.offers WHERE idempotency_key LIKE 'staging-demo:%'
      ORDER BY idempotency_key`)) as unknown as { key: string; status: string }[];
    expect(statuses).toEqual([
      { key: "staging-demo:london", status: "active" },
      { key: "staging-demo:paris", status: "withdrawn" },
      { key: "staging-demo:tokyo", status: "withdrawn" },
    ]);

    // Another member sees none of the demo: no demo pin, no demo offer, no inbox item.
    const otherHome = HomeVM.parse(
      await (await t.app.request("/v1/home", { headers: { Cookie: t.memberB.cookie } })).json(),
    );
    expect(otherHome.destinations.map((d) => d.code)).not.toContain("SIN");
    expect(otherHome.sections.find((s) => s.key === "inspire")?.items ?? []).toEqual([]);

    // A second run retires nothing and publishes nothing.
    expect((await seedStagingDemo(t.db, member, new Date(), events)).retired).toEqual({ offers: 0, fares: 0 });
    expect(await withdrawnEvents()).toBe(2);

    // The account's own offer, if an operator withdrew it, stays withdrawn — and leaves the inbox — run after run.
    const london = (
      (await t.db.execute(sql`
        SELECT id FROM proposals.offers WHERE idempotency_key = 'staging-demo:london'`)) as unknown as { id: string }[]
    )[0]!.id;
    const r = await t.app.request(`/v1/internal/offers/${london}/withdraw`, {
      method: "POST",
      headers: { "X-Internal-Secret": t.internalSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "withdrawn by an operator" }),
    });
    expect(r.status).toBe(200);
    for (let run = 0; run < 2; run++) {
      expect(await seedStagingDemo(t.db, member, new Date(), events)).toMatchObject({ offers: 0, inbox: 1 });
    }
    const inbox = InboxVM.parse(await (await t.app.request("/v1/inbox", cookie)).json());
    expect(inbox.items.map((i) => i.title)).toEqual(["Your quote is ready"]);
    await t.close();
  }, 60_000);

  // ADR-IMPL-040: the fixture seed is not meant for staging, yet staging held its offers beside the demo's — Paris and
  // Tokyo twice on Explore. The demo withdraws them, as the internal withdraw route does: status and offer.withdrawn.
  it("withdraws the fixture seed's offers, once, as the withdraw route does", async () => {
    const t = await testApp({ suite: "staging-demo-fixture" });
    await t.seedCatalogBasics();
    const auth = t.registry.facade<IdentityFacade>("identity").auth;
    const email = "review.staging-fixture@test.dev";
    const password = "review-demo-password-1";
    const account = await ensureReviewAccount({ auth, db: t.db, email, password, persona: DEMO_PERSONA });
    await t.drainAll();
    const cookie = { headers: { Cookie: await t.auth.cookieFor(email, password) } };
    const member = { id: account.memberId, email };

    // The fixture seed's offers, as packages/db/scripts/seed-fixture.ts writes them (keys `fixture:<key>`).
    for (const o of fixture.offers) {
      await t.db.execute(sql`
        INSERT INTO proposals.offers (idempotency_key, source, targeting, target_member_id, route_from, route_to, cabin,
          price, published_price, currency, title, valid_until, status)
        VALUES (${`fixture:${o.key}`}, ${o.targeting === "user" ? "crm_agent" : "marketing_campaign"}, ${o.targeting},
          ${o.targeting === "user" ? fixture.member.id : null}, ${o.from}, ${o.to}, 'business', ${String(o.price)},
          ${String(o.published)}, 'USD', ${o.title}, now() + interval '30 days', 'active')`);
    }
    const fixtureActive = async () =>
      Number(
        (
          (await t.db.execute(
            sql`SELECT count(*)::int AS n FROM proposals.offers WHERE idempotency_key LIKE 'fixture:%' AND status = 'active'`,
          )) as unknown as { n: number }[]
        )[0]?.n,
      );
    const withdrawnEvents = async () => (await t.journal.byType("offer.withdrawn")).length;
    expect(await fixtureActive()).toBe(fixture.offers.length);

    const events = appEvents(t);
    await seedStagingDemo(t.db, member, new Date(), events);
    expect(await fixtureActive()).toBe(0);
    expect(await withdrawnEvents()).toBe(fixture.offers.length);
    const deliveries = (await t.db.execute(sql`
      SELECT count(*)::int AS n FROM platform.event_deliveries d JOIN platform.domain_events e ON e.id = d.event_id
      WHERE e.type = 'offer.withdrawn' AND d.consumer = 'notifications.onOfferWithdrawn'`)) as unknown as {
      n: number;
    }[];
    expect(deliveries[0]?.n).toBe(fixture.offers.length); // pending pushes are suppressed by its consumer

    // Explore shows the account's own offer, once.
    const home = HomeVM.parse(await (await t.app.request("/v1/home", cookie)).json());
    const titles = home.sections.find((s) => s.key === "inspire")!.items.map((i) => i.title);
    expect(titles).toEqual([expect.stringMatching(/^Your \w+ in London$/)]);

    // A second run withdraws nothing more and publishes nothing.
    await seedStagingDemo(t.db, member, new Date(), events);
    expect(await withdrawnEvents()).toBe(fixture.offers.length);
    expect(await fixtureActive()).toBe(0);
    await t.close();
  }, 60_000);
});

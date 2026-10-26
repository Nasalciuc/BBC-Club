import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("POST /v1/requests", () => {
  it("creates a row, publishes request.submitted; send-requests is the CRM path", async () => {
    const t = await testApp({ suite: "requests-create" });
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(r.status).toBe(201);
    const body = (await r.json()) as { id: string; status: string; reference: string };
    // Held, not yet passed on: received to its member (ADR-IMPL-042) — "not sent" only once the job gives up.
    expect(body.status).toBe("received");
    expect(body.reference).toBe("");
    await t.drainAll();
    expect(t.crm.submitted.length).toBe(0);
    await t.platform.jobs.run("send-requests");
    expect(t.crm.submitted.length).toBe(1);
    expect((t.crm.submitted[0] as { reference?: string }).reference).toMatch(/^R-/);
    const [{ sent_to_crm, reference }]: any = await t.db.execute(
      sql`SELECT sent_to_crm, reference FROM requests.requests WHERE id = ${body.id}`,
    );
    expect(sent_to_crm).toBe(true);
    expect(reference).toMatch(/^R-/);
    const journal = await t.journal.byType("request.submitted");
    expect(journal.length).toBeGreaterThan(0);
    await t.close();
  });

  it("stores E.164 and phone_valid from libphonenumber, never a literal", async () => {
    const t = await testApp({ suite: "requests-phone" });
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const [row]: any = await t.db.execute(sql`SELECT phone_e164, phone_valid FROM requests.requests WHERE id = ${id}`);
    expect(row.phone_e164).toBe("+12125550148");
    expect(row.phone_valid).toBe(true);
    await t.platform.jobs.run("send-requests");
    expect((t.crm.submitted[0] as { phone_valid: boolean }).phone_valid).toBe(true);
    await t.close();
  });

  it("rejects an invalid phone with the field named", async () => {
    const t = await testApp({ suite: "requests-phone-bad" });
    const r = await t.submitRequestAs(
      t.memberA,
      t.sampleRequestBody({ contact: { name: "Alex Morgan", phone: "1234567", email: "alex@test.dev" } }),
    );
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { code: string; details?: { path: string }[] } };
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details?.some((d) => d.path === "contact.phone")).toBe(true);
    await t.close();
  });

  it("a slow CRM does not hold the poller transaction or starve the pool", async () => {
    const t = await testApp({ suite: "requests-pool", poolMax: 10 });
    t.crm.setSubmitDelayMs(10_000);
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const frees: number[] = [];
    frees.push(t.poolMax - (await t.poolBusy()));
    const started = Date.now();
    await t.drainAll();
    frees.push(t.poolMax - (await t.poolBusy()));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(t.crm.submitted.length).toBe(0);
    expect(Math.min(...frees)).toBeGreaterThanOrEqual(8);
    t.crm.setSubmitDelayMs(0);
    await t.platform.jobs.run("send-requests");
    expect(t.crm.submitted.length).toBe(1);
    await t.close();
  });

  it("same Idempotency-Key returns 200 and the same id", async () => {
    const t = await testApp({ suite: "requests-idem" });
    const key = crypto.randomUUID();
    const a = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    const b = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(((await a.json()) as { id: string }).id).toBe(((await b.json()) as { id: string }).id);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.requests WHERE idempotency_key = ${key}`,
    );
    expect(n).toBe(1);
    const [{ n: slots }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM platform.rate_limit_state WHERE key = ${"requests.submit:m:" + t.memberA.id}`,
    );
    expect(slots).toBe(1);
    await t.close();
  });

  it("another member reusing Idempotency-Key gets 409, not the original row", async () => {
    const t = await testApp({ suite: "requests-idor-key" });
    const key = crypto.randomUUID();
    const a = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
    expect(a.status).toBe(201);
    const b = await t.submitRequestAs(
      t.memberB,
      t.sampleRequestBody({ contact: { name: "Bob", phone: "+12125550222", email: "bob@test.dev" } }),
      { idempotencyKey: key },
    );
    expect(b.status).toBe(409);
    await t.close();
  });

  it("requires Idempotency-Key", async () => {
    const t = await testApp({ suite: "requests-key" });
    const r = await t.app.request("/v1/requests", {
      method: "POST",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(t.sampleRequestBody()),
    });
    expect(r.status).toBe(400);
    await t.close();
  });

  it("an Idempotency-Key must be 8-200 letters, digits, - or _ (a 3 000-character key is 400, never a 500)", async () => {
    const t = await testApp({ suite: "requests-key-shape" });
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const random = Array.from(crypto.getRandomValues(new Uint8Array(3000)), (b) => chars[b % chars.length]).join("");
    for (const key of [random, "k".repeat(3000), "short", "has space here", "dots.are.not.allowed"]) {
      const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key });
      expect(r.status).toBe(400);
      const body = (await r.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("VALIDATION");
      expect(body.error.message).toBe("Idempotency-Key must be 8-200 letters, digits, - or _.");
    }
    const [{ n }]: any = await t.db.execute(sql`SELECT count(*)::int n FROM requests.requests`);
    expect(n).toBe(0);
    const ok = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: crypto.randomUUID() });
    expect(ok.status).toBe(201);
    await t.close();
  });
});

describe("POST /v1/requests — only a trip that can be flown, and the fare or offer it names", () => {
  /** A UTC calendar day `n` days from today. */
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const P = (adult = 1, child = 0, infant = 0) => ({ adult, child, infant });
  type Problem = { status: number; paths: string[]; message?: string };
  async function problem(t: Awaited<ReturnType<typeof testApp>>, over: Record<string, unknown>): Promise<Problem> {
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ priceAtRequest: undefined, ...over }));
    const body = (await r.json()) as { error?: { code: string; message: string; details?: { path: string }[] } };
    if (r.status !== 400) return { status: r.status, paths: [] };
    expect(body.error?.code).toBe("VALIDATION");
    return { status: 400, paths: (body.error?.details ?? []).map((d) => d.path), message: body.error?.message };
  }

  it("refuses trips that cannot be flown, naming the field", async () => {
    const t = await testApp({ suite: "requests-impossible" });
    const oneway = (legs: unknown[], extra: Record<string, unknown> = {}) => ({ tripType: "oneway", legs, ...extra });
    const cases: [string, Record<string, unknown>, string][] = [
      ["an outbound in 2020", oneway([{ from: "JFK", to: "LHR", date: "2020-01-01" }]), "legs.0.date"],
      ["an outbound over everywhere", oneway([{ from: "JFK", to: "LHR", date: day(-2) }]), "legs.0.date"],
      [
        "a return before the outbound",
        {
          tripType: "round",
          legs: [
            { from: "JFK", to: "LHR", date: day(50) },
            { from: "LHR", to: "JFK", date: day(43) },
          ],
        },
        "legs.1.date",
      ],
      ["a round trip with one leg", { tripType: "round", legs: [{ from: "JFK", to: "LHR", date: day(40) }] }, "legs"],
      [
        "a round trip that does not come back",
        {
          tripType: "round",
          legs: [
            { from: "JFK", to: "LHR", date: day(40) },
            { from: "LHR", to: "CDG", date: day(47) },
          ],
        },
        "legs.1",
      ],
      [
        "a one-way trip with two legs",
        oneway([
          { from: "JFK", to: "LHR", date: day(40) },
          { from: "LHR", to: "JFK", date: day(47) },
        ]),
        "legs",
      ],
      [
        "a multi-city trip with one leg",
        { tripType: "multi", legs: [{ from: "JFK", to: "LHR", date: day(40) }] },
        "legs",
      ],
      ["JFK → JFK", oneway([{ from: "JFK", to: "JFK", date: day(40) }]), "legs.0.to"],
      [
        "one adult with four infants",
        oneway([{ from: "JFK", to: "LHR", date: day(40) }], { passengers: P(1, 0, 4) }),
        "passengers.infant",
      ],
      [
        "a NUL in the name",
        oneway([{ from: "JFK", to: "LHR", date: day(40) }], {
          contact: { name: "Alex\u0000Morgan", phone: "+12125550148", email: "alex@test.dev" },
        }),
        "contact.name",
      ],
      ["a NUL in the note", oneway([{ from: "JFK", to: "LHR", date: day(40) }], { note: "Window\u0000seat" }), "note"],
    ];
    for (const [label, over, path] of cases) {
      const p = await problem(t, over);
      expect([label, p.status, p.paths.includes(path)]).toEqual([label, 400, true]);
    }
    const [{ n }]: any = await t.db.execute(sql`SELECT count(*)::int n FROM requests.requests`);
    expect(n).toBe(0);

    // What can be flown goes through: today, a one-way trip, a round trip, two adults with two infants.
    expect((await problem(t, oneway([{ from: "JFK", to: "LHR", date: day(0) }]))).status).toBe(201);
    expect(
      (
        await problem(t, {
          tripType: "round",
          legs: [
            { from: "JFK", to: "LHR", date: day(30) },
            { from: "LHR", to: "JFK", date: day(30) },
          ],
          passengers: P(2, 0, 2),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await problem(t, {
          tripType: "multi",
          legs: [
            { from: "JFK", to: "LHR", date: day(30) },
            { from: "LHR", to: "CDG", date: day(33) },
            { from: "CDG", to: "JFK", date: day(40) },
          ],
        })
      ).status,
    ).toBe(201);
    await t.close();
  });

  it("a fare request is for the fare's own trip; a closed fare is taken, and a fare that no longer exists is left out", async () => {
    const t = await testApp({ suite: "requests-fare-match" });
    await t.seedCatalogBasics();
    const [ba]: any = await t.db.execute(
      sql`SELECT id FROM catalog.fares WHERE carrier = 'BA' AND route_from = 'JFK' AND route_to = 'LHR'`,
    );
    const closed = await t.seedExpiredFare();
    const oneway = (fareId: string, from: string, to: string, cabin = "business") => ({
      fareId,
      tripType: "oneway",
      cabin,
      legs: [{ from, to, date: day(30) }],
      priceAtRequest: 4200,
    });

    const elsewhere = await problem(t, oneway(ba.id, "KEF", "MAD", "first"));
    expect(elsewhere.status).toBe(400);
    expect(elsewhere.paths).toContain("legs.0");
    const otherCabin = await problem(t, oneway(ba.id, "JFK", "LHR", "first"));
    expect(otherCabin.status).toBe(400);
    expect(otherCabin.paths).toContain("cabin");
    const [{ n }]: any = await t.db.execute(sql`SELECT count(*)::int n FROM requests.requests`);
    expect(n).toBe(0);

    expect((await problem(t, oneway(ba.id, "JFK", "LHR"))).status).toBe(201);
    // A fare that closed since the member asked (an offline-queued request) is still taken.
    expect((await problem(t, { ...oneway(closed, "JFK", "LHR"), priceAtRequest: 5000 })).status).toBe(201);

    // A fare that no longer exists at all (a copy 0034 removed, under a request queued offline): the request is taken
    // for its trip, without the fare and the price that was the fare's — the specialist quotes it (4.1.6).
    const gone = crypto.randomUUID();
    const taken = await t.submitRequestAs(t.memberA, t.sampleRequestBody(oneway(gone, "JFK", "LHR")));
    expect(taken.status).toBe(201);
    const vm = (await taken.json()) as { id: string; route: string; priceAtRequest: number | null; cabin: string };
    expect(vm).toMatchObject({ route: "JFK → LHR", priceAtRequest: null, cabin: "business" });
    const [row]: any = await t.db.execute(sql`
      SELECT fare_id, price_at_request, intent, trip_type, legs FROM requests.requests WHERE id = ${vm.id}`);
    expect(row).toMatchObject({ fare_id: null, price_at_request: null, intent: null, trip_type: "oneway" });
    expect(row.legs).toEqual([{ from: "JFK", to: "LHR", date: day(30) }]);
    const [submitted] = (await t.journal.byType("request.submitted")).filter(
      (e: { payload: { requestId?: string } }) => e.payload.requestId === vm.id,
    );
    expect(submitted?.payload).toMatchObject({ fareId: null, route: "JFK → LHR" });
    expect(await (await t.app.request("/metrics")).text()).toContain("bbc_request_fare_gone");
    await t.close();
  });

  it("a refusal the app on phones can meet says why, in its message and in a reason that does not change", async () => {
    const t = await testApp({ suite: "requests-refusal-reasons" });
    const answer = async (over: Record<string, unknown>) => {
      const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ priceAtRequest: undefined, ...over }));
      return {
        status: r.status,
        ...((await r.json()) as {
          error: {
            code: string;
            message: string;
            context?: { reason?: string };
            details?: { path: string; reason?: string }[];
          };
        }),
      };
    };
    // A recent search's remembered day, over everywhere now.
    const past = await answer({ tripType: "oneway", legs: [{ from: "JFK", to: "LHR", date: day(-3) }] });
    expect(past).toMatchObject({
      status: 400,
      error: {
        code: "VALIDATION",
        message: "That day has passed. Choose a date from today on.",
        context: { reason: "day_passed" },
      },
    });
    expect(past.error.details).toContainEqual(expect.objectContaining({ path: "legs.0.date", reason: "day_passed" }));
    const same = await answer({ tripType: "oneway", legs: [{ from: "JFK", to: "JFK", date: day(30) }] });
    expect(same).toMatchObject({
      status: 400,
      error: {
        message: "Choose a destination other than where the flight leaves from.",
        context: { reason: "same_airport" },
      },
    });
    const lap = await answer({ passengers: { adult: 1, child: 0, infant: 2 } });
    expect(lap).toMatchObject({
      status: 400,
      error: {
        message: "Each infant travels on an adult's lap. Add an adult or remove an infant.",
        context: { reason: "infants_over_adults" },
      },
    });
    expect(lap.error.details).toContainEqual(expect.objectContaining({ path: "passengers.infant" }));
    // A field the app checks itself keeps the general message and no reason.
    const phone = await answer({ contact: { name: "Alex Morgan", phone: "1234567", email: "alex@test.dev" } });
    expect(phone).toMatchObject({ status: 400, error: { message: "Please check the highlighted fields." } });
    expect(phone.error.context).toBeUndefined();
    await t.close();
  });

  it("an offer request names an offer the member could see; a withdrawn one still goes", async () => {
    const t = await testApp({ suite: "requests-offer-match" });
    const trip = { tripType: "oneway", legs: [{ from: "JFK", to: "LHR", date: day(30) }] };
    const unknown = await problem(t, { ...trip, offerId: crypto.randomUUID() });
    expect(unknown).toMatchObject({ status: 400, message: "This offer is no longer available." });
    expect(unknown.paths).toContain("offerId");
    const bobs = await t.seedTargetedOffer(t.memberB.id);
    const notMine = await problem(t, { ...trip, offerId: bobs });
    expect(notMine.status).toBe(400);
    expect(notMine.paths).toContain("offerId");

    const mine = await t.seedTargetedOffer(t.memberA.id);
    expect((await problem(t, { ...trip, offerId: mine })).status).toBe(201);
    const broadcast = await t.seedBroadcastOffer();
    const withdrawn = await t.app.request(`/v1/internal/offers/${broadcast}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ reason: "sold out" }),
    });
    expect(withdrawn.status).toBe(200);
    expect((await problem(t, { ...trip, offerId: broadcast })).status).toBe(201);
    await t.close();
  });

  it("a request already taken is answered as taken after its day has passed (a retry that never got its answer)", async () => {
    const t = await testApp({ suite: "requests-replay-past-day" });
    const key = crypto.randomUUID();
    const on = (date: string) =>
      t.sampleRequestBody({ priceAtRequest: undefined, tripType: "oneway", legs: [{ from: "JFK", to: "LHR", date }] });
    const first = await t.submitRequestAs(t.memberA, on(day(0)), { idempotencyKey: key });
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    // The phone sends it again days later, the day now over everywhere: the request it made stands.
    const again = await t.submitRequestAs(t.memberA, on(day(-3)), { idempotencyKey: key });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { id: string }).id).toBe(id);
    // A new request for that day is still refused.
    const fresh = await problem(t, { tripType: "oneway", legs: [{ from: "JFK", to: "LHR", date: day(-3) }] });
    expect(fresh.status).toBe(400);
    expect(fresh.paths).toContain("legs.0.date");
    await t.close();
  });
});

describe("GET /v1/requests", () => {
  it("lists only the caller's requests", async () => {
    const t = await testApp({ suite: "requests-list" });
    await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    await t.submitRequestAs(
      t.memberB,
      t.sampleRequestBody({ contact: { name: "Bob", phone: "+12125550222", email: "bob@test.dev" } }),
    );
    const r = await t.app.request("/v1/requests", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { id: string }[] };
    expect(body.items.length).toBe(1);
    await t.close();
  });

  it("sets hasMore when the member has more than 50 requests", async () => {
    const t = await testApp({ suite: "requests-hasmore" });
    const memberId = t.memberA.id;
    await t.db.execute(sql`
      INSERT INTO requests.requests (
        reference, member_id, idempotency_key, trip_type, cabin, legs, passengers,
        contact_name, contact_phone, contact_email, phone_valid, source
      )
      SELECT
        'R-HM' || g::text,
        ${memberId},
        'idem-hm-' || g::text,
        'oneway',
        'business',
        '[{"from":"JFK","to":"LHR","date":"2026-10-01"}]'::jsonb,
        '{"adult":1,"child":0,"infant":0}'::jsonb,
        'Alex',
        '+12125550100',
        'alex@test.dev',
        true,
        'ios'
      FROM generate_series(1, 51) AS g`);
    const r = await t.app.request("/v1/requests", { headers: { Cookie: t.memberA.cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { items: { id: string }[]; hasMore: boolean };
    expect(body.items.length).toBe(50);
    expect(body.hasMore).toBe(true);
    await t.close();
  });

  it("list and detail share the closed event time, not createdAt", async () => {
    const t = await testApp({ suite: "requests-closed-at" });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    const closed = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(closed.status).toBe(200);
    const list = await t.app.request("/v1/requests", { headers: { Cookie: t.memberA.cookie } });
    const detail = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberA.cookie } });
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    type Row = { id: string; createdAt: string; timeline: { status: string; at: string }[] };
    const listItem = ((await list.json()) as { items: Row[] }).items.find((item) => item.id === id);
    const detailBody = (await detail.json()) as Row;
    const listClosed = listItem?.timeline.find((e) => e.status === "closed")?.at;
    const detailClosed = detailBody.timeline.find((e) => e.status === "closed")?.at;
    expect(listClosed).toBeTruthy();
    expect(listClosed).toBe(detailClosed);
    expect(listClosed).not.toBe(listItem?.createdAt);
    await t.close();
  });
});

describe("POST /v1/internal/requests/:id/status", () => {
  it("updates status idempotently", async () => {
    const t = await testApp({ suite: "requests-status" });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    const headers = {
      "Content-Type": "application/json",
      "X-Internal-Secret": t.internalSecret,
    };
    const a = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "quoted", note: "ready" }),
    });
    expect(a.status).toBe(200);
    const b = await t.app.request(`/v1/internal/requests/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "quoted", note: "ready again" }),
    });
    expect(b.status).toBe(200);
    expect(((await b.json()) as { unchanged: boolean }).unchanged).toBe(true);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.request_events WHERE request_id = ${id} AND status = 'quoted'`,
    );
    expect(n).toBe(1);
    await t.close();
  });
});

describe("POST /v1/internal/requests/:id/status — forward only", () => {
  it("a step back answers 409 with where the request is, and writes nothing", async () => {
    const t = await testApp({ suite: "requests-status-back" });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    const set = (status: string) =>
      t.app.request(`/v1/internal/requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret },
        body: JSON.stringify({ status }),
      });
    expect((await set("booked")).status).toBe(200);
    const back = await set("quoted");
    expect(back.status).toBe(409);
    const body = (await back.json()) as { error: { code: string; context?: Record<string, unknown> } };
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.context).toEqual({ from: "booked", to: "quoted" });
    const [{ status }]: any = await t.db.execute(sql`SELECT status FROM requests.requests WHERE id = ${id}`);
    expect(status).toBe("booked");
    const detail = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberA.cookie } });
    const vm = (await detail.json()) as { status: string; timeline: { status: string }[] };
    expect(vm.status).toBe("booked");
    expect(vm.timeline.map((e) => e.status)).toEqual(["received", "booked"]);
    await t.close();
  });
});

describe("send-requests job", () => {
  it("retries failures and stops after six attempts", async () => {
    const t = await testApp({ suite: "requests-job" });
    t.crm.setSubmitFails(100);
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();

    for (let i = 0; i < 8; i++) {
      await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
      await t.platform.jobs.run("send-requests");
    }

    const [row]: any = await t.db.execute(
      sql`SELECT sent_to_crm, send_attempts, last_error FROM requests.requests WHERE id = ${id}`,
    );
    expect(row.sent_to_crm).toBe(false);
    expect(Number(row.send_attempts)).toBeGreaterThanOrEqual(6);
    expect(row.last_error).toBeTruthy();

    const attempts = Number(row.send_attempts);
    await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await t.platform.jobs.run("send-requests");
    const [row2]: any = await t.db.execute(sql`SELECT send_attempts FROM requests.requests WHERE id = ${id}`);
    expect(Number(row2.send_attempts)).toBe(attempts);

    // Given up: now, and only now, the member reads "not sent".
    const detail = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberA.cookie } });
    expect(((await detail.json()) as { status: string }).status).toBe("not_sent");

    await t.close();
  });

  it("succeeds on retry after CRM recovers", async () => {
    const t = await testApp({ suite: "requests-job-ok" });
    t.crm.setSubmitFails(1);
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    await t.platform.jobs.run("send-requests"); // first attempt fails; row now in backoff
    // Force claim by clearing sent_at
    await t.db.execute(sql`UPDATE requests.requests SET sent_at = now() - interval '10 minutes' WHERE id = ${id}`);
    await t.platform.jobs.run("send-requests");
    const [row]: any = await t.db.execute(
      sql`SELECT sent_to_crm, crm_request_id FROM requests.requests WHERE id = ${id}`,
    );
    expect(row.sent_to_crm).toBe(true);
    expect(row.crm_request_id).toBeTruthy();
    await t.close();
  });

  it("stores only the Error message in last_error, never a dumped object with email", async () => {
    const t = await testApp({ suite: "requests-job-pii" });
    t.crm.submitRequest = async () => {
      throw new Error("boom", { cause: { email: "hidden@test.dev", client: { phone: "+12125550148" } } });
    };
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.drainAll();
    await t.platform.jobs.run("send-requests");
    const [row]: any = await t.db.execute(sql`SELECT last_error FROM requests.requests WHERE id = ${id}`);
    // errorLine: the error's name and message, nothing it carries (AGENTS.md rule 6).
    expect(row.last_error).toBe("Error: boom");
    expect(String(row.last_error)).not.toContain("hidden@");
    await t.close();
  });
});

import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { testApp } from "./helpers/test-app";

describe("POST /v1/requests rate limits", () => {
  it("ten colleagues on one IP each get 201", async () => {
    const t = await testApp({ suite: "requests-rate-colleagues" });
    const ip = "198.51.100.20";
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const email = `colleague${i}.requests-rate@test.dev`;
      const member = await t.auth.createMember(email);
      const cookie = await t.auth.cookieFor(member.email);
      const r = await t.submitRequestAs(
        { cookie },
        t.sampleRequestBody({ contact: { name: `Colleague ${i}`, phone: "+12125550148", email } }),
        { ip },
      );
      statuses.push(r.status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 201, 201, 201, 201, 201]);
    await t.close();
  }, 30_000);

  it("a member's sixth submit is 429 for about 360s; replaying the fifth is 200", async () => {
    const t = await testApp({ suite: "requests-rate-member" });
    const fifthKey = crypto.randomUUID();
    let fifthId = "";
    for (let i = 0; i < 5; i++) {
      const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), {
        idempotencyKey: i === 4 ? fifthKey : crypto.randomUUID(),
        ip: "198.51.100.21",
      });
      expect(r.status).toBe(201);
      if (i === 4) fifthId = ((await r.json()) as { id: string }).id;
    }
    const sixth = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { ip: "198.51.100.21" });
    expect(sixth.status).toBe(429);
    // The member's own limit, told apart from the address's (the app's copy differs).
    expect(((await sixth.clone().json()) as { error: { context?: unknown } }).error.context).toEqual({
      scope: "member",
    });
    const retry = Number(sixth.headers.get("Retry-After"));
    expect(retry).toBeGreaterThanOrEqual(350);
    expect(retry).toBeLessThanOrEqual(360);
    const replay = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), {
      idempotencyKey: fifthKey,
      ip: "198.51.100.21",
    });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { id: string }).id).toBe(fifthId);
    await t.close();
  });

  it("five concurrent replays of one Idempotency-Key cost one unit: the member's next request is still 201", async () => {
    const t = await testApp({ suite: "requests-rate-race", poolMax: 10 });
    const key = crypto.randomUUID();
    const ip = "198.51.100.22";
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => t.submitRequestAs(t.memberA, t.sampleRequestBody(), { idempotencyKey: key, ip })),
    );
    expect(answers.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const ids = new Set(await Promise.all(answers.map(async (r) => ((await r.json()) as { id: string }).id)));
    expect(ids.size).toBe(1);
    const [{ n }]: any = await t.db.execute(
      sql`SELECT count(*)::int n FROM requests.requests WHERE idempotency_key = ${key}`,
    );
    expect(n).toBe(1);
    // The member's burst is five: one unit spent, four left — a replay is not a new request.
    for (let i = 0; i < 4; i++) {
      const next = await t.submitRequestAs(t.memberA, t.sampleRequestBody(), { ip });
      expect(next.status).toBe(201);
    }
    await t.close();
  });

  it("the address's limit says so: a member with no requests behind a busy address reads scope 'ip'", async () => {
    const t = await testApp({ suite: "requests-rate-ip-scope" });
    const ip = "198.51.100.23";
    // requests.submit.ip: burst 20 — four colleagues send five each.
    for (let m = 0; m < 4; m++) {
      const email = `office${m}.requests-rate@test.dev`;
      const member = await t.auth.createMember(email);
      const cookie = await t.auth.cookieFor(member.email);
      for (let i = 0; i < 5; i++) {
        const r = await t.submitRequestAs(
          { cookie },
          t.sampleRequestBody({ contact: { name: `Office ${m}`, phone: "+12125550148", email } }),
          { ip },
        );
        expect(r.status).toBe(201);
      }
    }
    const first = await t.submitRequestAs(t.memberB, t.sampleRequestBody(), { ip });
    expect(first.status).toBe(429);
    expect(Number(first.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    const body = (await first.json()) as { error: { code: string; context?: unknown } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.context).toEqual({ scope: "ip" });
    await t.close();
  }, 30_000);
});

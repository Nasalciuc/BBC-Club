/** Ingest: a payload the offers CHECKs refuse is a 400 VALIDATION before any write — never a 500 the CRM retries for
 *  ever — and an unsafe value (an http or javascript: media address, a lower-case currency, a route that is not three
 *  letters, a member id that is not one) is refused the same way. Nothing of a refused payload is stored. */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import type { Executor } from "@bbc/db";
import { createPlatform } from "@bbc/platform";
import { EVENT_CATALOGUE } from "@bbc/shared/events";
import type { AppEnv } from "@bbc/shared/http/app-env";
import { ingest, type IngestDeps } from "../../src/application/ingest";
import { proposalsModule } from "../../src/module";

let iso: IsolatedDb;
let app: Hono<AppEnv>;
let deps: IngestDeps;
beforeAll(async () => {
  iso = await isolatedDb("proposals-ingest-validation", { max: 3 });
  const platform = createPlatform(iso.db, { level: "silent" });
  platform.events.defineEvent("offer.published", EVENT_CATALOGUE["offer.published"]);
  const out = await proposalsModule().init({ db: iso.db, platform, env: {} as never, ports: {} });
  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", { kind: "system", role: "system", source: "internal-secret" });
    c.set("requestId", "ingest-validation");
    c.set("clientIp", null);
    await next();
  });
  const mounted = out.routes?.[0];
  if (!mounted) throw new Error("proposals routes missing");
  app.route(mounted.basePath, mounted.app);
  deps = {
    db: iso.db as unknown as Executor,
    events: { publish: (tx, e) => platform.events.publish(tx, { ...e, publishedBy: "proposals" }) },
  };
});
afterAll(() => iso.drop());

const DAY = 86_400_000;
const good = () => ({
  source: "crm_agent",
  targeting: "user",
  targetMemberId: crypto.randomUUID(),
  routeFrom: "KEF",
  routeTo: "CDG",
  cabin: "business",
  price: "1700.00",
  publishedPrice: "3100.00",
  currency: "USD",
  title: "Your weekend in Paris",
  validUntil: new Date(Date.now() + 10 * DAY).toISOString(),
  mediaUrl: "https://cdn.example.com/paris.webp",
});

const post = (body: unknown, key = `validation:${crypto.randomUUID()}`) =>
  app.request("/v1/internal/offers", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
const stored = async (key: string) =>
  Number(
    (
      (await iso.db.execute(
        sql`SELECT count(*)::int AS n FROM proposals.offers WHERE idempotency_key = ${key}`,
      )) as unknown as { n: number }[]
    )[0]?.n,
  );

describe("ingest refuses what the offers table refuses, and unsafe values", () => {
  it("a good payload is stored", async () => {
    const key = `validation:${crypto.randomUUID()}`;
    const r = await post(good(), key);
    expect(r.status).toBe(200);
    expect(await stored(key)).toBe(1);
  });

  const later = (ms: number) => new Date(Date.now() + ms).toISOString();
  // One timestamp for both fields: two `later()` calls can straddle a clock tick and stop being equal.
  const in10Days = later(10 * DAY);
  const bad: Record<string, Record<string, unknown>> = {
    "price 0": { price: "0" },
    "price 0.00": { price: "0.00", publishedPrice: undefined },
    "published below price": { publishedPrice: "1500.00" },
    "validUntil past": { validUntil: later(-DAY) },
    "publishAt after validUntil": { publishAt: later(12 * DAY) },
    "publishAt equal to validUntil": { publishAt: in10Days, validUntil: in10Days },
    "routeFrom = routeTo": { routeTo: "KEF" },
    "routeFrom = routeTo, other case": { routeTo: "kef" },
    "price beyond numeric(10,2)": { price: "12345678901", publishedPrice: undefined },
    "published price beyond numeric(10,2)": { publishedPrice: "123456789.00" },
    "mediaUrl http": { mediaUrl: "http://cdn.example.com/paris.webp" },
    "mediaUrl javascript": { mediaUrl: "javascript:alert(1)" },
    "currency with a digit": { currency: "1SD" },
    "routeTo 1A2": { routeTo: "1A2" },
    "targetMemberId not a member id": { targetMemberId: "not-a-member-id" },
  };
  for (const [name, change] of Object.entries(bad)) {
    it(`${name} → 400 VALIDATION, nothing stored`, async () => {
      const key = `validation:${crypto.randomUUID()}`;
      const r = await post({ ...good(), ...change }, key);
      const body = (await r.json()) as { error?: { code?: string } };
      expect({ status: r.status, code: body.error?.code }).toEqual({ status: 400, code: "VALIDATION" });
      expect(await stored(key)).toBe(0);
    });
  }

  it("a lower-case currency and route are stored upper-case", async () => {
    const key = `validation:${crypto.randomUUID()}`;
    const r = await post({ ...good(), currency: "usd", routeFrom: "kef", routeTo: "cdg" }, key);
    expect(r.status).toBe(200);
    const [row] = (await iso.db.execute(
      sql`SELECT currency, route_from, route_to FROM proposals.offers WHERE idempotency_key = ${key}`,
    )) as unknown as { currency: string; route_from: string; route_to: string }[];
    expect(row).toEqual({ currency: "USD", route_from: "KEF", route_to: "CDG" });
  });

  it("a retry of an offer stored with a lower-case currency, before the ingest upper-cased it, still replays", async () => {
    const key = `validation:${crypto.randomUUID()}`;
    const payload = { ...good(), currency: "usd" };
    const first = await post(payload, key);
    expect(first.status).toBe(200);
    const { offerId } = (await first.json()) as { offerId: string };
    // As the ingest stored it before: the currency as sent.
    await iso.db.execute(sql`UPDATE proposals.offers SET currency = 'usd' WHERE idempotency_key = ${key}`);
    const retry = await post(payload, key);
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { offerId: string }).offerId).toBe(offerId);
  });

  it("a CHECK the database still refuses is a 400 VALIDATION, not a 500", async () => {
    // Past the schema (the facade's own callers, a CHECK added later): the route maps 23514 and 22003 to 400.
    const ok = await ingest(deps, { ...(good() as never), price: "1700.00" }, `validation:${crypto.randomUUID()}`);
    expect(ok.ok).toBe(true);
    await iso.db.execute(sql`ALTER TABLE proposals.offers ADD CONSTRAINT offers_test_title CHECK (title <> 'Refused')`);
    try {
      const key = `validation:${crypto.randomUUID()}`;
      const r = await post({ ...good(), title: "Refused" }, key);
      const body = (await r.json()) as { error?: { code?: string } };
      expect({ status: r.status, code: body.error?.code }).toEqual({ status: 400, code: "VALIDATION" });
      expect(await stored(key)).toBe(0);
    } finally {
      await iso.db.execute(sql`ALTER TABLE proposals.offers DROP CONSTRAINT offers_test_title`);
    }
  });

  it("a retry of a stored offer still replays it, whatever the clock says now", async () => {
    const key = `validation:${crypto.randomUUID()}`;
    const payload = good();
    expect((await post(payload, key)).status).toBe(200);
    // The offer's validity has passed since (a CRM retry after a long outage): the same payload is the same offer.
    await iso.db.execute(sql`
      UPDATE proposals.offers SET publish_at = now() - interval '3 days', valid_until = now() - interval '1 day',
        created_at = now() - interval '3 days'
      WHERE idempotency_key = ${key}`);
    const [row] = (await iso.db.execute(
      sql`SELECT id, valid_until FROM proposals.offers WHERE idempotency_key = ${key}`,
    )) as unknown as { id: string; valid_until: Date | string }[];
    const r = await post({ ...payload, validUntil: new Date(row!.valid_until).toISOString() }, key);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { offerId: string }).offerId).toBe(row!.id);
  });
});

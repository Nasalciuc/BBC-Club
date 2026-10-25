/**
 * The http adapter against a fake CRM started here (ADR-IMPL-065): each call is signed so the secret verifies it, keyed
 * on the request's reference, bounded by its ceiling, and every failure says whether sending again can help.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHmac, timingSafeEqual } from "node:crypto";
import { errorLine } from "@bbc/db";
import type { CrmRequestPayload } from "../../src/api";
import {
  CrmHttpError,
  CrmRequestInvalidError,
  CrmTimeoutError,
  CrmUnreachableError,
  withCrmTimeout,
} from "../../src/module";
import { httpCrm, signCrmCall } from "../../src/infrastructure/http-crm";

/** Made up for the tests: 40 characters. */
const SECRET = "crm-secret-made-up-for-tests-0000000000";

type Seen = { method: string; path: string; headers: Headers; body: string };
let seen: Seen[] = [];
/** What the fake CRM answers next: a status, or never (it hangs). */
let answer: { status: number; body?: string } | "hang" = { status: 201 };
let server: ReturnType<typeof Bun.serve>;
let url: string;
/** The answers a hanging CRM still owes: given once the test is over, so the server can stop. */
let owed: (() => void)[] = [];

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      seen.push({
        method: req.method,
        path: new URL(req.url).pathname,
        headers: req.headers,
        body: await req.text(),
      });
      if (answer === "hang") {
        return new Promise<Response>((resolve) => owed.push(() => resolve(new Response(null, { status: 504 }))));
      }
      const status = answer.status;
      return new Response(answer.body ?? null, {
        status,
        headers: status >= 300 && status < 400 ? { Location: "https://elsewhere.example.test/" } : {},
      });
    },
  });
  url = `http://127.0.0.1:${server.port}/requests`;
});
afterAll(async () => {
  for (const pay of owed) pay();
  await server.stop(true);
});
beforeEach(() => {
  for (const pay of owed) pay();
  owed = [];
  seen = [];
  answer = { status: 201 };
});

/** A request as send-requests builds it. The member is made up. */
function payload(over: Partial<CrmRequestPayload> = {}): CrmRequestPayload {
  return {
    reference: "R-T001",
    trip_type: "round",
    cabin_class: "Business Class",
    client: { name: "Alex Example", phone: "+12125550148", email: "alex@example.test" },
    flights: [
      { from: "JFK", to: "LHR", date: "2027-10-12" },
      { from: "LHR", to: "JFK", date: "2027-10-19" },
    ],
    passengers: { adult: 2, child: 0, infant: 0 },
    note: "Window seats, please.",
    intent: "quote",
    _attempt: 1,
    _source: "ios",
    _request_id: "11111111-1111-4111-8111-111111111111",
    _actions: {
      quoted: "https://api.example.test/ops/requests/quoted-token",
      booked: "https://api.example.test/ops/requests/booked-token",
      closed: "https://api.example.test/ops/requests/closed-token",
    },
    ...over,
  };
}

/** The CRM's side of the scheme, written from the ADR, not from the adapter: HMAC-SHA256 over `timestamp.body`. */
function verifies(secret: string, call: Seen): boolean {
  const timestamp = call.headers.get("x-bbc-timestamp") ?? "";
  const got = Buffer.from(call.headers.get("x-bbc-signature") ?? "", "hex");
  const want = createHmac("sha256", secret).update(`${timestamp}.${call.body}`).digest();
  return got.length === want.length && timingSafeEqual(got, want);
}

async function failure(work: Promise<unknown>): Promise<Error & { retryable?: boolean; status?: number }> {
  const err = await work.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof Error)) throw new Error("expected the call to fail");
  return err;
}

describe("http CRM — signed", () => {
  it("POSTs the request with a signature the secret verifies, over the timestamp and the exact body", async () => {
    const crm = httpCrm({ url, secret: SECRET });
    const before = Math.floor(Date.now() / 1000);
    const result = await crm.submitRequest(payload());
    expect(result).toEqual({ crmRequestId: "http:R-T001" });
    expect(seen).toHaveLength(1);
    const call = seen[0]!;
    expect([call.method, call.path]).toEqual(["POST", "/requests"]);
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(verifies(SECRET, call)).toBe(true);
    expect(verifies("another-secret-made-up-for-tests-000000", call)).toBe(false);
    expect(call.headers.get("x-bbc-signature")).toMatch(/^[0-9a-f]{64}$/);
    const timestamp = Number(call.headers.get("x-bbc-timestamp"));
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    // A changed body no longer verifies.
    expect(verifies(SECRET, { ...call, body: call.body.replace("R-T001", "R-T002") })).toBe(false);
    // The secret itself is sent nowhere.
    expect(JSON.stringify([...call.headers.entries()])).not.toContain(SECRET);
    expect(call.body).not.toContain(SECRET);
  });

  it("the body is the request without the e-mail's links and attempt; the request id stays for the status call", async () => {
    await httpCrm({ url, secret: SECRET }).submitRequest(payload());
    const body = JSON.parse(seen[0]!.body) as Record<string, unknown>;
    expect(body._actions).toBeUndefined();
    expect(body._attempt).toBeUndefined();
    expect(body._request_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.reference).toBe("R-T001");
    expect(body.client).toEqual({ name: "Alex Example", phone: "+12125550148", email: "alex@example.test" });
  });

  it("signCrmCall is the scheme the CRM checks: the ADR's test vectors", () => {
    // Made-up values (ADR-IMPL-065): the CRM team can check their implementation against these vectors.
    const body = '{"reference":"R-T001"}';
    expect(signCrmCall("a".repeat(32), "1700000000", body)).toBe(
      "e9cac67c8d4e9078b3988338555ba85410dce442215986480495561ecd617a37",
    );
    // The key is the secret's characters as UTF-8 bytes, never decoded: a key that is not hex signs all the same…
    expect(signCrmCall("made-up-signing-key-not-hex-0001", "1700000000", body)).toBe(
      "8906ce4ebc5577e87e8fbb382d9639bc868f39eb40c82cbdfa8ee9197aa4d5cb",
    );
    // …and a hex-looking one is not decoded: its decoded bytes give another MAC, which the CRM must not compute.
    const decoded = createHmac("sha256", Buffer.from("a".repeat(32), "hex"))
      .update(`1700000000.${body}`)
      .digest("hex");
    expect(decoded).toBe("b63f6006d4a8d069d2929ed5c894124a136ba2e4b4ede08b161f1b5972d6de7d");
    expect(signCrmCall("a".repeat(32), "1700000000", body)).not.toBe(decoded);
  });
});

describe("http CRM — idempotent on the reference", () => {
  it("Idempotency-Key is the reference; a resend sends the same key and the same body", async () => {
    let clock = 1_800_000_000;
    const crm = httpCrm({ url, secret: SECRET, now: () => clock++ });
    await crm.submitRequest(payload({ _attempt: 1 }));
    await crm.submitRequest(payload({ _attempt: 2 }));
    expect(seen.map((c) => c.headers.get("idempotency-key"))).toEqual(["R-T001", "R-T001"]);
    expect(seen[1]!.body).toBe(seen[0]!.body);
    // The key is not signed; the body is, and names the same reference: the CRM refuses a call where they differ.
    for (const c of seen) {
      expect((JSON.parse(c.body) as { reference: string }).reference).toBe(c.headers.get("idempotency-key")!);
    }
    // Each call signs its own time: a captured call cannot be replayed later as a fresh one.
    expect(seen.map((c) => c.headers.get("x-bbc-timestamp"))).toEqual(["1800000000", "1800000001"]);
    expect(seen.every((c) => verifies(SECRET, c))).toBe(true);
  });

  it("never sends a request without its reference: refused for good, nothing reaches the CRM", async () => {
    const err = await failure(httpCrm({ url, secret: SECRET }).submitRequest(payload({ reference: "  " })));
    expect(err).toBeInstanceOf(CrmRequestInvalidError);
    expect(err.retryable).toBe(false);
    expect(seen).toHaveLength(0);
  });
});

describe("http CRM — every failure says whether to try again", () => {
  it("a CRM that hangs gives a retryable timeout at the call's ceiling", async () => {
    answer = "hang";
    const started = Date.now();
    const err = await failure(httpCrm({ url, secret: SECRET, timeoutMs: 200 }).submitRequest(payload()));
    expect(err).toBeInstanceOf(CrmTimeoutError);
    expect(err.retryable).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("the module's ceiling (withCrmTimeout) ends the call as well, with the same retryable timeout", async () => {
    answer = "hang";
    const started = Date.now();
    const err = await failure(withCrmTimeout(httpCrm({ url, secret: SECRET }), 200).submitRequest(payload()));
    expect(err).toBeInstanceOf(CrmTimeoutError);
    expect(err.retryable).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("500, 503, 429 and 408 are retryable", async () => {
    for (const status of [500, 503, 429, 408]) {
      answer = { status };
      const err = await failure(httpCrm({ url, secret: SECRET }).submitRequest(payload()));
      expect(err).toBeInstanceOf(CrmHttpError);
      expect([err.status, err.retryable]).toEqual([status, true]);
    }
  });

  it("400 and every other 4xx are permanent; a redirect is refused, never followed", async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 302]) {
      seen = [];
      answer = { status };
      const err = await failure(httpCrm({ url, secret: SECRET }).submitRequest(payload()));
      expect(err).toBeInstanceOf(CrmHttpError);
      expect([err.status, err.retryable]).toEqual([status, false]);
      expect(seen).toHaveLength(1);
    }
  });

  it("a CRM that cannot be reached is a retryable network error that names no address", async () => {
    const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const port = closed.port;
    await closed.stop(true);
    const err = await failure(
      httpCrm({ url: `http://127.0.0.1:${port}/requests`, secret: SECRET }).submitRequest(payload()),
    );
    expect(err).toBeInstanceOf(CrmUnreachableError);
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain(String(port));
  });

  it("the error, as send-requests stores it, holds no body, secret or member's detail", async () => {
    answer = { status: 400, body: '{"error":"bad phone +12125550148 for alex@example.test"}' };
    const err = await failure(httpCrm({ url, secret: SECRET }).submitRequest(payload()));
    const stored = errorLine(err);
    expect(stored).toBe("CrmHttpError: CRM submitRequest answered 400 (permanent)");
    for (const secret of [SECRET, "alex@example.test", "+12125550148", "Alex Example", "Window seats"]) {
      expect(stored).not.toContain(secret);
    }
  });
});

describe("http CRM — the rest of the port", () => {
  it("findByEmail answers null and createActivity records nothing, without calling the CRM", async () => {
    const crm = httpCrm({ url, secret: SECRET });
    expect(await crm.findByEmail("alex@example.test")).toBeNull();
    expect(
      await crm.createActivity({ externalId: "o-1:m-1", memberId: "m-1", offerId: "o-1", kind: "interested" }),
    ).toEqual({ id: null });
    expect(seen).toHaveLength(0);
  });
});

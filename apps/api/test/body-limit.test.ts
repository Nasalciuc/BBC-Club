/** Body limits: 256 KB on member /v1 routes, 1 MB on /v1/internal/* (a catalogue import of a few thousand fares).
 *  A body over its limit answers 413 in the API's own shape, never 500 INTERNAL, and is never logged as unhandled. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { testApp } from "./helpers/test-app";

const KB = 1024;
/** A JSON body of about `bytes` bytes. */
const bodyOf = (bytes: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...extra, padding: "x".repeat(bytes) });

let t: Awaited<ReturnType<typeof testApp>>;
const logged: string[] = [];
beforeAll(async () => {
  t = await testApp({ suite: "body-limit" });
  const logger = t.platform.logger as unknown as Record<string, (o: object, m?: string) => void>;
  for (const level of ["error", "warn"] as const) {
    const original = logger[level]!.bind(logger);
    logger[level] = (o: object, m?: string) => {
      logged.push(m ?? "");
      original(o, m);
    };
  }
});
afterAll(() => t.close());

async function expectTooLarge(res: Response) {
  expect(res.status).toBe(413);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("VALIDATION");
  expect(body.error.message).toBe("This request is too large.");
}

describe("body limits", () => {
  it("a member body over 256 KB answers 413 VALIDATION, not 500", async () => {
    const res = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: bodyOf(300 * KB),
    });
    await expectTooLarge(res);
  });

  it("an internal body of 600 KB reaches its handler; over 1 MB answers 413", async () => {
    const headers = { "Content-Type": "application/json", "X-Internal-Secret": t.internalSecret };
    const fits = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers,
      body: bodyOf(600 * KB, { kind: "fares", csv: "x" }),
    });
    // The handler read it (the padding is not a field it knows) and answered: the limit let it through.
    expect(fits.status).toBe(200);

    const over = await t.app.request("/v1/internal/catalog/import", {
      method: "POST",
      headers,
      body: bodyOf(1200 * KB, { kind: "fares", csv: "x" }),
    });
    await expectTooLarge(over);
  });

  it("a body streamed without a length is counted and refused the same way", async () => {
    const chunk = new TextEncoder().encode("x".repeat(64 * KB));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 5) return controller.close();
        sent++;
        controller.enqueue(chunk);
      },
    });
    const res = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: t.memberA.cookie, "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    });
    await expectTooLarge(res);
  });

  it("none of them was logged as unhandled", () => {
    expect(logged).not.toContain("unhandled");
  });
});

import { describe, it, expect } from "bun:test";
import type { Executor } from "@bbc/db";
import { isOtpSendRequest, otpSendLock, otpSendTarget } from "../src/infrastructure/otp-send-lock";

const post = (path: string, body: string) =>
  new Request(`http://localhost:8000/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("which requests take the per-address send lock", () => {
  it("a code send names its type and the address as Better Auth stores it (trimmed, lower case)", async () => {
    expect(
      await otpSendTarget(post("/email-otp/send-verification-otp", '{"email":" Alex@Test.dev ","type":"sign-in"}')),
    ).toEqual({ type: "sign-in", email: "alex@test.dev" });
    expect(await otpSendTarget(post("/email-otp/request-password-reset", '{"email":"a@b.dev"}'))).toEqual({
      type: "forget-password",
      email: "a@b.dev",
    });
    expect(await otpSendTarget(post("/forget-password/email-otp", '{"email":"a@b.dev"}'))).toEqual({
      type: "forget-password",
      email: "a@b.dev",
    });
  });

  it("everything else passes straight through, and the body is still there for Better Auth", async () => {
    expect(await otpSendTarget(post("/sign-in/email-otp", '{"email":"a@b.dev","otp":"123456"}'))).toBeNull();
    expect(await otpSendTarget(post("/email-otp/send-verification-otp", "not json"))).toBeNull();
    expect(await otpSendTarget(post("/email-otp/send-verification-otp", '{"type":"sign-in"}'))).toBeNull();
    expect(
      await otpSendTarget(new Request("http://localhost:8000/api/auth/email-otp/send-verification-otp")),
    ).toBeNull();
    const req = post("/email-otp/send-verification-otp", '{"email":"a@b.dev","type":"sign-in"}');
    await otpSendTarget(req);
    expect(await req.json()).toEqual({ email: "a@b.dev", type: "sign-in" });
  });

  it("a body Better Auth reads as anything but JSON is not read by the club, though it is still a code send", async () => {
    // Better Auth accepts this content type (it contains application/json) and reads the body as a form: the JSON the
    // club could parse from it is not what Better Auth acts on.
    const formish = new Request("http://localhost:8000/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded,application/json" },
      body: '{"type":"sign-in","email":"a@b.dev","x":"&type=forget-password&email=victim%40b.dev&z="}',
    });
    expect(await otpSendTarget(formish)).toBeNull();
    expect(isOtpSendRequest(formish)).toBe(true);
    expect(
      await otpSendTarget(
        new Request("http://localhost:8000/api/auth/email-otp/send-verification-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: '{"email":"a@b.dev","type":"sign-in"}',
        }),
      ),
    ).toEqual({ type: "sign-in", email: "a@b.dev" });
    expect(isOtpSendRequest(post("/sign-in/email-otp", "{}"))).toBe(false);
    expect(isOtpSendRequest(new Request("http://localhost:8000/api/auth/email-otp/send-verification-otp"))).toBe(false);
  });

  it("a form reset stays under the per-address lock (Better Auth reads form bodies too)", async () => {
    expect(
      await otpSendTarget(
        new Request("http://localhost:8000/api/auth/email-otp/request-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "email=Alex%40Test.dev",
        }),
      ),
    ).toEqual({ type: "forget-password", email: "alex@test.dev" });
  });
});

describe("the per-address send lock", () => {
  /** Counts open transactions; the advisory lock statement itself does nothing here. */
  function fakeDb() {
    const open = { now: 0, most: 0 };
    const db = {
      async transaction<T>(fn: (tx: { execute: () => Promise<void> }) => Promise<T>): Promise<T> {
        open.now++;
        open.most = Math.max(open.most, open.now);
        try {
          return await fn({ execute: async () => {} });
        } finally {
          open.now--;
        }
      },
    } as unknown as Executor;
    return { db, open };
  }

  it("a burst for one address holds one transaction at a time, and another address is not kept waiting", async () => {
    const { db, open } = fakeDb();
    const withLock = otpSendLock(db);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const order: string[] = [];
    const burst = Array.from({ length: 5 }, (_, n) =>
      withLock({ type: "sign-in", email: "a@b.dev" }, async () => {
        order.push(`a${n}`);
        await gate;
      }),
    );
    let otherStarted = false;
    const other = withLock({ type: "sign-in", email: "c@d.dev" }, async () => {
      otherStarted = true;
    });
    await other;
    expect(otherStarted).toBe(true);
    expect(order).toEqual(["a0"]);
    release();
    await Promise.all(burst);
    expect(order).toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect(open.most).toBeLessThanOrEqual(2);
  });

  it("a send that fails does not stop the next one for that address", async () => {
    const { db } = fakeDb();
    const withLock = otpSendLock(db);
    const target = { type: "forget-password", email: "a@b.dev" };
    const failed = withLock(target, async () => {
      throw new Error("Postmark 503");
    });
    const next = withLock(target, async () => "sent");
    await expect(failed).rejects.toThrow("Postmark 503");
    expect(await next).toBe("sent");
  });
});

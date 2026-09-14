import { describe, it, expect } from "bun:test";
import { capturingEmail } from "./helpers/capturing-email";
import { mockCrm } from "./helpers/mock-crm";
import { recordingSender } from "@bbc/push";
import type { EmailSender } from "@bbc/identity/ports/email";
import type { PushSender } from "@bbc/notifications/ports/push";

describe("ports round-trip", () => {
  it("EmailSender", async () => {
    const s: EmailSender = capturingEmail();
    await s.sendOtp({ to: "a@b.c", otp: "123456", purpose: "sign-in" });
    expect((s as any).lastOtp("a@b.c")).toBe("123456");
  });

  it("PushSender", async () => {
    const s: PushSender = recordingSender();
    const r = await s.send({ platform: "ios", token: "t", title: "x" });
    expect(r.ok).toBe(true);
  });

  it("CrmConnector", async () => {
    const c = mockCrm([{ email: "k@x.com", crmClientId: "crm_k" }]);
    expect(await c.findByEmail("k@x.com")).toMatchObject({ crmClientId: "crm_k" });
    expect(await c.findByEmail("n@x.com")).toBeNull();
    const a1 = await c.createActivity({
      externalId: "e1",
      memberId: "m",
      offerId: "o",
      kind: "interested",
    });
    const a2 = await c.createActivity({
      externalId: "e1",
      memberId: "m",
      offerId: "o",
      kind: "interested",
    });
    expect(a1.id).toBe(a2.id);
  });
});

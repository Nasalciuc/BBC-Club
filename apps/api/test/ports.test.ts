import { describe, it, expect } from "bun:test";
import { capturingEmail } from "./helpers/capturing-email";
import { mockCrm } from "./helpers/mock-crm";
import { recordingSender } from "@bbc/push";
import type { EmailFacade } from "@bbc/email";
import type { PushFacade } from "@bbc/push";
import type { CrmFacade } from "@bbc/crm";

describe("ports round-trip", () => {
  it("EmailFacade", async () => {
    const s: EmailFacade = capturingEmail();
    await s.sendOtp({ to: "a@b.c", otp: "123456", purpose: "sign-in" });
    expect((s as any).lastOtp("a@b.c")).toBe("123456");
  });

  it("PushFacade", async () => {
    const s: PushFacade = recordingSender();
    const r = await s.send({ platform: "ios", token: "t", title: "x" });
    expect(r.ok).toBe(true);
  });

  it("CrmFacade", async () => {
    const c: CrmFacade = mockCrm([{ email: "k@x.com", crmClientId: "crm_k" }]);
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

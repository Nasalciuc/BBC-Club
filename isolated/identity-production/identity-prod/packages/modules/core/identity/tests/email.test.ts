import { describe, it, expect } from "bun:test";
import { postmarkSender } from "@bbc/email/postmark";

describe("Postmark sender — the tutorial's bug cannot come back", () => {
  it("sends to the member's real address and awaits acceptance", async () => {
    let captured: any = null;
    const fetchImpl = (async (_url: string, init: any) => { captured = JSON.parse(init.body); return new Response("{}", { status: 200 }); }) as any;
    const sender = postmarkSender({ token: "t", from: "club@buybusinessclass.com", fetchImpl });
    await sender.sendOtp({ to: "alex.morgan@company.com", otp: "123456", purpose: "email-verification" });
    expect(captured.To).toBe("alex.morgan@company.com");
    expect(captured.TextBody).toContain("123456");
  });
  it("throws when the provider rejects (never swallowed)", async () => {
    const fetchImpl = (async () => new Response("{\"Message\":\"Bad token\"}", { status: 401 })) as any;
    const sender = postmarkSender({ token: "bad", from: "club@buybusinessclass.com", fetchImpl });
    await expect(sender.sendOtp({ to: "a@b.com", otp: "000000", purpose: "sign-in" })).rejects.toThrow(/Postmark 401/);
  });
});

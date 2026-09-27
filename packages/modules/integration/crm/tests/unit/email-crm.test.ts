import { describe, expect, it } from "bun:test";
import { emailCrm } from "../../src/infrastructure/email-crm";
import type { EmailFacade } from "@bbc/email";

const quoted = "https://api.example/ops/requests/quoted-token";

describe("emailCrm", () => {
  it("emails the reference, the route, and the three links, never the secret", async () => {
    let sent: { to: string; subject: string; text: string; replyTo?: string } | undefined;
    const email: EmailFacade = {
      async sendOtp() {},
      async sendOperatorRequest(input) {
        sent = input;
      },
    };
    const crm = emailCrm({ email, operatorsEmail: "ops@buybusinessclass.com" });
    const result = await crm.submitRequest({
      reference: "R-ABC",
      trip_type: "round",
      cabin_class: "Business Class",
      client: { name: "Alex Morgan", phone: "+12125550148", email: "alex@test.dev" },
      flights: [
        { from: "JFK", to: "LHR", date: "2026-10-12" },
        { from: "LHR", to: "JFK", date: "2026-10-19" },
      ],
      passengers: { adult: 1, child: 0, infant: 0 },
      _actions: {
        quoted,
        booked: "https://api.example/ops/requests/booked",
        closed: "https://api.example/ops/requests/closed",
      },
    });
    expect(result.crmRequestId).toBe("email:R-ABC");
    expect(sent?.to).toBe("ops@buybusinessclass.com");
    expect(sent?.replyTo).toBe("alex@test.dev");
    expect(sent?.text).toContain("R-ABC");
    expect(sent?.text).toContain("JFK → LHR");
    expect(sent?.text).toContain("quoted-");
    expect(sent?.text).toContain("booked");
    expect(sent?.text).toContain("closed");
    expect(sent?.text).toContain(quoted);
    expect(sent?.text).not.toContain("OPS_LINK_SECRET");
    expect(await crm.findByEmail("alex@test.dev")).toBeNull();
  });
});

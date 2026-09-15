/** CRM facade contract: findByEmail null for unknown; createActivity idempotent by externalId. */
import { describe, it, expect } from "bun:test";
import { mockCrm } from "../../src/module";

describe("@bbc/crm facade", () => {
  it("findByEmail returns null for an unknown email", async () => {
    const crm = mockCrm([{ email: "known@test.dev", crmClientId: "crm_1", fullName: "Known" }]);
    expect(await crm.findByEmail("unknown@test.dev")).toBeNull();
    const hit = await crm.findByEmail("known@test.dev");
    expect(hit).not.toBeNull();
    expect(hit!.crmClientId).toBe("crm_1");
  });

  it("createActivity is idempotent by externalId", async () => {
    const crm = mockCrm();
    const input = {
      externalId: "offer-1:member-1",
      memberId: "member-1",
      offerId: "offer-1",
      kind: "interested" as const,
    };
    const a = await crm.createActivity(input);
    const b = await crm.createActivity(input);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("mock_offer-1:member-1");
  });
});

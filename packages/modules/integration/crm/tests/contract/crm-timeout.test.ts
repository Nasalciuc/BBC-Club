import { describe, it, expect } from "bun:test";
import { CrmTimeoutError, withCrmTimeout, type CrmConnector } from "../../src/module";

describe("CRM outbound timeout", () => {
  it("surfaces CrmTimeoutError when the partner does not answer", async () => {
    const hanging: CrmConnector = {
      findByEmail: () => new Promise(() => {}),
      createActivity: () => new Promise(() => {}),
      submitRequest: () => new Promise(() => {}),
    };
    const crm = withCrmTimeout(hanging, 30);
    const err = await crm.submitRequest({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrmTimeoutError);
    expect((err as CrmTimeoutError).code).toBe("CRM_TIMEOUT");
  });
});

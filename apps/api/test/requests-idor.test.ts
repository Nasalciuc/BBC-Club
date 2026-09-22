/** Dedicated IDOR coverage for GET /v1/requests/:id (registered path literal for inventory). */
import { describe, it, expect } from "bun:test";
import { testApp } from "./helpers/test-app";

describe("GET /v1/requests/:id", () => {
  it("member A gets 200 for own request; member B gets 404; anon gets 401", async () => {
    const t = await testApp({ suite: "requests-idor" });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const asOwner = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberA.cookie } });
    expect(asOwner.status).toBe(200);

    const asOther = await t.app.request(`/v1/requests/${id}`, { headers: { Cookie: t.memberB.cookie } });
    expect(asOther.status).toBe(404);

    const anon = await t.app.request(`/v1/requests/${id}`);
    expect(anon.status).toBe(401);
    await t.close();
  });
});

import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { RequestVM } from "@bbc/shared/api/v1/requests";
import { signAction } from "../../../packages/modules/domain/requests/src/application/operator-links";
import { testApp } from "./helpers/test-app";

const FARE = "11111111-1111-4111-8111-111111111111";
const OFFER = "22222222-2222-4222-8222-222222222222";
const SECRET = "ops-link-secret-at-least-32-characters";

describe("request intent", () => {
  it("leaves intent off the member view", () => {
    expect(Object.keys(RequestVM.shape)).not.toContain("intent");
    expect(Object.keys(RequestVM.shape)).not.toContain("replacesFareId");
  });

  it("stores a quote with no ids and sends that intent to the job", async () => {
    const t = await testApp({ suite: "requests-intent-quote" });
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "quote" }));
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const [row]: any = await t.db.execute(sql`SELECT intent, replaces_fare_id FROM requests.requests WHERE id = ${id}`);
    expect(row.intent).toBe("quote");
    expect(row.replaces_fare_id).toBeNull();
    const journal = await t.journal.byType("request.submitted");
    expect(journal[0]?.payload.intent).toBe("quote");
    expect(journal[0]?.payload.replacesFareId).toBeNull();
    await t.platform.jobs.run("send-requests");
    expect(t.crm.submitted[0]).toMatchObject({ intent: "quote", replaces_fare_id: null });
    await t.close();
  });

  it("rejects an alternative with no fare, and an intent that also names a fare", async () => {
    const t = await testApp({ suite: "requests-intent-400" });
    const missing = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "alternative" }));
    expect(missing.status).toBe(400);
    const both = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "quote", fareId: FARE }));
    expect(both.status).toBe(400);
    await t.close();
  });

  it("names the replaced fare on the job payload and the operator page", async () => {
    const t = await testApp({ suite: "requests-intent-alt", env: { OPS_LINK_SECRET: SECRET } });
    const r = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ intent: "alternative", replacesFareId: FARE }));
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    await t.platform.jobs.run("send-requests");
    expect(t.crm.submitted[0]).toMatchObject({ intent: "alternative", replaces_fare_id: FARE });
    const html = await (await t.app.request(`/ops/requests/${signAction(SECRET, id, "quoted")}`)).text();
    expect(html).toContain(`Type: Alternative to an expired fare (fare ${FARE})`);
    await t.close();
  });

  it("derives fare and offer when no intent was stored", async () => {
    const t = await testApp({ suite: "requests-intent-source" });
    const fare = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ fareId: FARE }));
    const offer = await t.submitRequestAs(t.memberA, t.sampleRequestBody({ offerId: OFFER }));
    expect(fare.status).toBe(201);
    expect(offer.status).toBe(201);
    await t.platform.jobs.run("send-requests");
    const intents = (t.crm.submitted as { intent: string }[]).map((p) => p.intent).sort();
    expect(intents).toEqual(["fare", "offer"]);
    await t.close();
  });
});

import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { signAction } from "../../../packages/modules/domain/requests/src/application/operator-links";
import { testApp } from "./helpers/test-app";

const SECRET = "ops-link-secret-at-least-32-characters";

async function events(t: Awaited<ReturnType<typeof testApp>>, type: string) {
  const rows = (await t.db.execute(sql`SELECT id FROM platform.domain_events WHERE type = ${type}`)) as unknown[];
  return rows.length;
}

describe("operator action links", () => {
  it("GET does not change status; POST quotes once and a replay does not", async () => {
    const t = await testApp({ suite: "ops-links", env: { OPS_LINK_SECRET: SECRET } });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const before = await events(t, "request.status_changed");
    const token = signAction(SECRET, id, "quoted");
    const get = await t.app.request(`/ops/requests/${token}`);
    expect(get.status).toBe(200);
    const html = await get.text();
    expect(html).toContain('<form method="post"');
    expect(html).not.toContain("<script");
    expect(await events(t, "request.status_changed")).toBe(before);
    const rows = (await t.db.execute(sql`SELECT status FROM requests.requests WHERE id = ${id}`)) as {
      status: string;
    }[];
    expect(rows[0]?.status).toBe("received");

    const post = await t.app.request(`/ops/requests/${token}`, { method: "POST" });
    expect(post.status).toBe(200);
    expect(await post.text()).toContain("Marked as quote sent");
    expect(await events(t, "request.status_changed")).toBe(before + 1);

    const again = await t.app.request(`/ops/requests/${token}`, { method: "POST" });
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("Already marked");
    expect(await events(t, "request.status_changed")).toBe(before + 1);
    await t.close();
  });

  it("rejects a tampered signature, an expired link, and a token for another request", async () => {
    const t = await testApp({ suite: "ops-links-bad", env: { OPS_LINK_SECRET: SECRET } });
    const a = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const b = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const idA = ((await a.json()) as { id: string }).id;
    const idB = ((await b.json()) as { id: string }).id;
    const token = signAction(SECRET, idA, "quoted");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect((await t.app.request(`/ops/requests/${tampered}`)).status).toBe(403);

    const expired = signAction(SECRET, idA, "quoted", Date.now() - 8 * 24 * 3600 * 1000);
    expect((await t.app.request(`/ops/requests/${expired}`)).status).toBe(410);

    const post = await t.app.request(`/ops/requests/${token}`, { method: "POST" });
    expect(post.status).toBe(200);
    const rows = (await t.db.execute(sql`SELECT status FROM requests.requests WHERE id = ${idB}`)) as {
      status: string;
    }[];
    expect(rows[0]?.status).toBe("received");
    await t.close();
  });
});

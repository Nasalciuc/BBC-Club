import { describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { signAction, verifyAction } from "../../../packages/modules/domain/requests/src/application/operator-links";
import { testApp } from "./helpers/test-app";

const SECRET = "ops-link-secret-at-least-32-characters";

async function events(t: Awaited<ReturnType<typeof testApp>>, type: string) {
  const rows = (await t.db.execute(sql`SELECT id FROM platform.domain_events WHERE type = ${type}`)) as unknown[];
  return rows.length;
}

describe("operator action links", () => {
  // Route inventory matches this path literally: /ops/requests/:token
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
    const dot = token.indexOf(".");
    const sig = token.slice(dot + 1);
    const flipped = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
    const tampered = `${token.slice(0, dot + 1)}${flipped}`;
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

  it("the send job carries three links that verify", async () => {
    const t = await testApp({ suite: "ops-send", env: { OPS_LINK_SECRET: SECRET } });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    await t.platform.jobs.run("send-requests");
    const payload = t.crm.submitted[0] as {
      _request_id: string;
      _actions: { quoted: string; booked: string; closed: string };
    };
    expect(payload._request_id).toBe(id);
    for (const action of ["quoted", "booked", "closed"] as const) {
      const token = new URL(payload._actions[action]).pathname.replace("/ops/requests/", "");
      const verified = verifyAction(SECRET, decodeURIComponent(token));
      expect(verified.ok).toBe(true);
      if (verified.ok) expect(verified.action).toBe(action);
    }
    await t.close();
  });

  it("a stale link never takes a request back: Quote sent on a booked request, Booked on a closed one", async () => {
    const t = await testApp({ suite: "ops-links-stale", env: { OPS_LINK_SECRET: SECRET } });
    const created = await t.submitRequestAs(t.memberA, t.sampleRequestBody());
    const { id } = (await created.json()) as { id: string };
    const post = (action: "quoted" | "booked" | "closed") =>
      t.app.request(`/ops/requests/${signAction(SECRET, id, action)}`, { method: "POST" });
    expect(await (await post("quoted")).text()).toContain("Marked as quote sent.");
    expect(await (await post("booked")).text()).toContain("Marked as booked.");
    const before = await events(t, "request.status_changed");

    const stale = await post("quoted");
    expect(stale.status).toBe(200);
    expect(stale.headers.get("content-type")).toContain("text/html");
    expect(await stale.text()).toContain("Already booked — nothing changed.");
    const status = async () =>
      ((await t.db.execute(sql`SELECT status FROM requests.requests WHERE id = ${id}`)) as { status: string }[])[0]
        ?.status;
    expect(await status()).toBe("booked");
    expect(await events(t, "request.status_changed")).toBe(before);

    expect(await (await post("closed")).text()).toContain("Marked as closed.");
    const reopen = await post("booked");
    expect(reopen.status).toBe(200);
    expect(await reopen.text()).toContain("This request is closed — nothing changed.");
    expect(await status()).toBe("closed");
    const timeline = (await t.db.execute(
      sql`SELECT status FROM requests.request_events WHERE request_id = ${id} ORDER BY created_at, id`,
    )) as { status: string }[];
    expect(timeline.map((e) => e.status)).toEqual(["received", "quoted", "booked", "closed"]);
    await t.close();
  });
});

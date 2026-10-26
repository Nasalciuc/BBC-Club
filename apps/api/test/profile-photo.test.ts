/** The member's own photo (ADR-IMPL-070, D9): PUT, GET and DELETE /v1/profile/photo. The bytes live in Postgres, are
 *  served only to their member with a strong ETag, and anything that is not a 512-px still WebP without metadata is
 *  the client's to fix — never a 500. The photos are made-up WebP bytes (`webp-fixtures`), never a picture (D13). */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { ProfileVM } from "@bbc/shared/api/v1/profile";
import { PHOTO_MAX_BYTES } from "@bbc/shared/media/webp";
import { FLAGS, chunk, filler, photoWebp, photoWithMetadata, riff, vp8, vp8x } from "@bbc/shared/media/webp-fixtures";
import { testApp } from "./helpers/test-app";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp({ suite: "profile-photo" });
});
afterAll(() => t.close());

const put = (cookie: string | null, body: Uint8Array | string, type = "image/webp") =>
  t.app.request("/v1/profile/photo", {
    method: "PUT",
    headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": type },
    body,
  });
const get = (cookie: string | null, headers: Record<string, string> = {}) =>
  t.app.request("/v1/profile/photo", { headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } });
const del = (cookie: string | null) =>
  t.app.request("/v1/profile/photo", { method: "DELETE", headers: cookie ? { Cookie: cookie } : {} });
const stored = async (memberId: string) =>
  (await t.db.execute(
    sql`SELECT byte_size, sha256 FROM members.profile_photo WHERE member_id = ${memberId}`,
  )) as unknown as { byte_size: number; sha256: string }[];
/** A member who joined and whose profile is made (member.registered delivered). */
async function joined(email: string) {
  const m = await t.auth.createMember(email);
  const cookie = await t.auth.cookieFor(email);
  await t.drainAll();
  return { id: m.id as string, cookie };
}
const refusal = async (res: Response) =>
  (await res.json()) as { error: { code: string; message: string; context?: { problem?: string } } };

describe("PUT /v1/profile/photo, GET /v1/profile/photo", () => {
  it("keeps the photo, answers the whole profile with its tag, and serves it back to its member only", async () => {
    const image = photoWebp({ extra: 4000 });
    const saved = await put(t.memberA.cookie, image);
    expect(saved.status).toBe(200);
    const vm = ProfileVM.parse(await saved.json());
    expect(vm.memberId).toBe(t.memberA.id);
    expect(vm.email).toBe(t.memberA.email);
    expect(vm.photo).toEqual({ etag: sha(image) });
    expect(await stored(t.memberA.id)).toEqual([{ byte_size: image.length, sha256: sha(image) }]);

    // GET /v1/profile carries the tag too — never an address.
    const profile = ProfileVM.parse(
      await (await t.app.request("/v1/profile", { headers: { Cookie: t.memberA.cookie } })).json(),
    );
    expect(profile.photo).toEqual({ etag: sha(image) });

    const res = await get(t.memberA.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("ETag")).toBe(`"${sha(image)}"`);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("Vary")).toBe("Cookie, Authorization");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(image);

    // Someone else's photo: there is no way to name it. Member B asks and gets their own — none — exactly as a member
    // who never had one; B's profile says none.
    const asB = await get(t.memberB.cookie);
    expect(asB.status).toBe(404);
    expect((await refusal(asB)).error.code).toBe("NOT_FOUND");
    const bProfile = ProfileVM.parse(
      await (await t.app.request("/v1/profile", { headers: { Cookie: t.memberB.cookie } })).json(),
    );
    expect(bProfile.photo).toBeNull();

    // Signed out: 401 for each method, nothing read or written.
    expect((await get(null)).status).toBe(401);
    expect((await put(null, photoWebp())).status).toBe(401);
    expect((await del(null)).status).toBe(401);
    expect(await stored(t.memberA.id)).toEqual([{ byte_size: image.length, sha256: sha(image) }]);
  });

  it("If-None-Match with the current tag → 304 without the bytes; an older tag → the photo", async () => {
    const image = photoWebp({ lossless: true, extra: 1500 });
    expect((await put(t.memberA.cookie, image)).status).toBe(200);
    const etag = `"${sha(image)}"`;
    for (const header of [etag, `W/${etag}`, `"0000", ${etag}`, "*"]) {
      const same = await get(t.memberA.cookie, { "If-None-Match": header });
      expect([header, same.status]).toEqual([header, 304]);
      expect(same.headers.get("ETag")).toBe(etag);
      expect(same.headers.get("Cache-Control")).toBe("private, no-cache");
      expect((await same.arrayBuffer()).byteLength).toBe(0);
    }
    const older = await get(t.memberA.cookie, { "If-None-Match": `"${sha(photoWebp())}"` });
    expect(older.status).toBe(200);
    expect(new Uint8Array(await older.arrayBuffer())).toEqual(image);
  });

  it("refuses what is not the club's photo — 400, 413 or 415, never 500 — and keeps the photo there was", async () => {
    // profile.write allows a burst of 10 a member: the refusals are shared between two members who joined for it.
    const carol = await joined("carol.profile-photo@test.dev");
    const dave = await joined("dave.profile-photo@test.dev");
    const kept = photoWebp({ extra: 777 });
    expect((await put(carol.cookie, kept)).status).toBe(200);
    const head = photoWebp({ extra: 0 }).length;
    const cases: [string, Response, number, string | undefined][] = [
      ["too large", await put(carol.cookie, photoWebp({ extra: PHOTO_MAX_BYTES - head + 1 })), 413, "size"],
      // Over the host's 256 KB for every member body: the host's own 413 says it, without a problem.
      ["far too large", await put(carol.cookie, photoWebp({ extra: 300 * 1024 })), 413, undefined],
      ["a JSON body", await put(carol.cookie, JSON.stringify({ photo: "x" }), "application/json"), 415, "type"],
      ["a JPEG's type", await put(carol.cookie, photoWebp(), "image/jpeg"), 415, "type"],
      ["no type", await put(carol.cookie, photoWebp(), ""), 415, "type"],
      [
        "a PNG called WebP",
        await put(carol.cookie, Uint8Array.of(0x89, 0x50, 0x4e, 0x47, ...filler(80))),
        400,
        "format",
      ],
      ["words called WebP", await put(carol.cookie, "RIFF....WEBPVP8 not really"), 400, "format"],
      ["an empty body", await put(carol.cookie, new Uint8Array()), 400, "format"],
      ["EXIF, XMP, ICC", await put(dave.cookie, photoWithMetadata()), 400, "metadata"],
      [
        "EXIF alone",
        await put(dave.cookie, riff([vp8x(512, 512), vp8(512, 512), chunk("EXIF", filler(30))])),
        400,
        "metadata",
      ],
      [
        "an animation",
        await put(dave.cookie, riff([vp8x(512, 512, FLAGS.animation), chunk("ANIM", filler(6))])),
        400,
        "animation",
      ],
      ["1024 square", await put(dave.cookie, photoWebp({ side: 1024 })), 400, "dimensions"],
      ["300 square", await put(dave.cookie, photoWebp({ side: 300 })), 400, "dimensions"],
    ];
    for (const [name, res, status, problem] of cases) {
      const body = await refusal(res);
      expect([name, res.status, body.error.code, body.error.context?.problem]).toEqual([
        name,
        status,
        "VALIDATION",
        problem,
      ]);
      expect(body.error.message.length).toBeGreaterThan(0);
    }
    expect(await stored(carol.id)).toEqual([{ byte_size: kept.length, sha256: sha(kept) }]);
    expect(await stored(dave.id)).toEqual([]);
  });

  it("a new photo replaces the last, under a new tag; each save is published as a profile change", async () => {
    const first = photoWebp({ extra: 10 });
    const second = photoWebp({ extra: 20 });
    await put(t.memberA.cookie, first);
    const before = (await t.journal.forMember(t.memberA.id)).length;
    const res = await put(t.memberA.cookie, second);
    expect(ProfileVM.parse(await res.json()).photo).toEqual({ etag: sha(second) });
    expect(await stored(t.memberA.id)).toEqual([{ byte_size: second.length, sha256: sha(second) }]);
    expect((await get(t.memberA.cookie, { "If-None-Match": `"${sha(first)}"` })).status).toBe(200);
    const events = (await t.journal.forMember(t.memberA.id)).slice(before);
    expect(events.map((e: { payload: { type: string; fields?: string[] } }) => e.payload)).toContainEqual(
      expect.objectContaining({ type: "member.profile_updated", fields: ["photo"] }),
    );
  });
});

describe("the photo's own bucket of profile.write", () => {
  it("photos use up only photos: past the burst a photo is 429, and the name still saves", async () => {
    const frank = await joined("frank.profile-photo@test.dev");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await put(frank.cookie, photoWebp({ side: 64 }))).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
    const name = await t.app.request("/v1/profile", {
      method: "PATCH",
      headers: { Cookie: frank.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Frank Example" }),
    });
    expect(name.status).toBe(200);
  });
});

describe("DELETE /v1/profile/photo", () => {
  it("takes the photo away and answers the profile without it; asked again, the same answer", async () => {
    await put(t.memberA.cookie, photoWebp());
    await put(t.memberB.cookie, photoWebp({ extra: 5 }));
    const first = await del(t.memberA.cookie);
    expect(first.status).toBe(200);
    const vm = ProfileVM.parse(await first.json());
    expect([vm.memberId, vm.photo]).toEqual([t.memberA.id, null]);
    expect(await stored(t.memberA.id)).toEqual([]);
    expect((await get(t.memberA.cookie)).status).toBe(404);

    const again = await del(t.memberA.cookie);
    expect(again.status).toBe(200);
    expect(ProfileVM.parse(await again.json()).photo).toBeNull();
    // Member B's photo is untouched by A's deletion.
    expect((await stored(t.memberB.id)).length).toBe(1);
  });
});

describe("the photo right after the join code (member.registered not yet delivered)", () => {
  it("the upload makes the profile row the delivery would make, then keeps the photo", async () => {
    const email = "erin.profile-photo@test.dev";
    const m = await t.auth.createMember(email);
    const cookie = await t.auth.cookieFor(email);
    const image = photoWebp({ extra: 64 });
    const res = await put(cookie, image);
    expect(res.status).toBe(200);
    expect(ProfileVM.parse(await res.json()).photo).toEqual({ etag: sha(image) });
    expect(await stored(m.id)).toEqual([{ byte_size: image.length, sha256: sha(image) }]);
    await t.drainAll();
    expect(await stored(m.id)).toEqual([{ byte_size: image.length, sha256: sha(image) }]);
  });
});

describe("ProfileVM.photo, both upgrade orders", () => {
  it("an older app drops it; a newer app reads an older server's profile; an odd value is none", () => {
    const vm = {
      memberId: "member-1",
      status: "active",
      email: "erin@test.dev",
      displayName: "Erin",
      homeAirport: "JFK",
      timezone: "America/New_York",
      phone: null,
      memberSince: new Date().toISOString(),
      crmLinkedAt: null,
      crmLinked: false,
      preferences: {},
      notifications: { requestUpdates: true, offers: true },
    };
    const etag = sha(photoWebp());
    expect(ProfileVM.omit({ photo: true }).parse({ ...vm, photo: { etag } })).not.toHaveProperty("photo");
    expect(ProfileVM.parse(vm).photo).toBeUndefined();
    expect(ProfileVM.parse({ ...vm, photo: { etag } }).photo).toEqual({ etag });
    expect(ProfileVM.parse({ ...vm, photo: null }).photo).toBeNull();
    for (const odd of [{ etag: "not-a-sha" }, { etag: etag.toUpperCase() }, "https://cdn.example.com/a.webp", 7, {}]) {
      const parsed = ProfileVM.parse({ ...vm, photo: odd });
      expect(parsed.photo).toBeNull();
      expect(parsed.displayName).toBe("Erin");
    }
  });
});

/** The member's own photo (ADR-IMPL-070, D9): kept in members.profile_photo, read only for its member, its tag the
 *  bytes' sha256, gone with the account. The photos are made-up WebP bytes (`webp-fixtures`), never a picture. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "@bbc/db/testing/isolated-db";
import { photoWebp } from "@bbc/shared/media/webp-fixtures";
import { createMembersFacade, toProfileVM } from "../../src/application/facade";
import { createPhotoStore, photoEtag } from "../../src/application/photo";
import { onMemberDeleted } from "../../src/handlers/on-member-deleted";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("members-photo", { max: 3 });
  db = iso.db;
});
afterAll(async () => {
  await iso.drop();
});

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const prefs = { offers_personal: true, offers_broadcast: true };

async function member(status: "active" | "waitlist" = "active"): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute(sql`INSERT INTO members.profile (member_id, status) VALUES (${id}, ${status})`);
  return id;
}

describe("@bbc/members — the member's own photo", () => {
  it("none until one is written; then its bytes, and its tag on the profile — the bytes' sha256", async () => {
    const id = await member();
    const photos = createPhotoStore(db);
    const facade = createMembersFacade(db);
    expect(await photos.read(undefined, id)).toBeNull();
    expect(await photos.etagOf(undefined, id)).toBeNull();
    expect((await facade.getProfile(undefined, id))?.photoEtag).toBeNull();

    const image = photoWebp({ extra: 3000 });
    expect(await db.transaction((tx) => photos.write(tx, id, image))).toBe(true);
    const stored = await photos.read(undefined, id);
    expect(stored?.etag).toBe(sha(image));
    expect(photoEtag(image)).toBe(sha(image));
    expect(stored?.image).toEqual(image);
    expect(await photos.etagOf(undefined, id)).toBe(sha(image));

    const row = await facade.getProfile(undefined, id);
    expect(row?.photoEtag).toBe(sha(image));
    // The view carries the tag, never an address or the bytes.
    const vm = toProfileVM(row, null, id, prefs);
    expect(vm.photo).toEqual({ etag: sha(image) });
    expect(JSON.stringify(vm)).not.toContain("RIFF");
  });

  it("a new photo replaces the last one — one row, a new tag; another member's stays theirs", async () => {
    const a = await member();
    const b = await member();
    const photos = createPhotoStore(db);
    const first = photoWebp({ extra: 100 });
    const second = photoWebp({ extra: 200 });
    const theirs = photoWebp({ lossless: true, extra: 300 });
    await db.transaction((tx) => photos.write(tx, a, first));
    await db.transaction((tx) => photos.write(tx, b, theirs));
    await db.transaction((tx) => photos.write(tx, a, second));
    expect((await photos.read(undefined, a))?.image).toEqual(second);
    expect((await photos.read(undefined, b))?.image).toEqual(theirs);
    const [{ n }] = (await db.execute(
      sql`SELECT count(*)::int AS n FROM members.profile_photo WHERE member_id = ${a}`,
    )) as unknown as { n: number }[];
    expect(n).toBe(1);
  });

  it("nothing is written without a live profile, and a deleted profile shows none", async () => {
    const photos = createPhotoStore(db);
    expect(await db.transaction((tx) => photos.write(tx, crypto.randomUUID(), photoWebp()))).toBe(false);

    const id = await member();
    await db.transaction((tx) => photos.write(tx, id, photoWebp()));
    await db.execute(sql`UPDATE members.profile SET status = 'deleted', deleted_at = now() WHERE member_id = ${id}`);
    expect(await photos.read(undefined, id)).toBeNull();
    expect(await photos.etagOf(undefined, id)).toBeNull();
    expect(await db.transaction((tx) => photos.write(tx, id, photoWebp({ extra: 9 })))).toBe(false);
  });

  it("remove takes it away once; asked again, there is none", async () => {
    const id = await member();
    const photos = createPhotoStore(db);
    await db.transaction((tx) => photos.write(tx, id, photoWebp()));
    expect(await photos.remove(undefined, id)).toBe(true);
    expect(await photos.remove(undefined, id)).toBe(false);
    expect(await photos.read(undefined, id)).toBeNull();
    expect((await createMembersFacade(db).getProfile(undefined, id))?.photoEtag).toBeNull();
  });

  it("member.deleted takes the photo with the profile — delivered twice, the second deletes nothing", async () => {
    const id = await member();
    const other = await member();
    const photos = createPhotoStore(db);
    await db.transaction((tx) => photos.write(tx, id, photoWebp()));
    await db.transaction((tx) => photos.write(tx, other, photoWebp()));
    const deleted = { type: "member.deleted", version: 1, memberId: id, deletedAt: new Date().toISOString() };
    await db.transaction((tx) => onMemberDeleted({ tx }, deleted));
    await db.transaction((tx) => onMemberDeleted({ tx }, deleted));
    const rows = (await db.execute(
      sql`SELECT member_id FROM members.profile_photo WHERE member_id IN (${id}, ${other})`,
    )) as unknown as { member_id: string }[];
    expect(rows.map((r) => r.member_id)).toEqual([other]);
  });
});

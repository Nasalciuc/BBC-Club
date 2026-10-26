/** 0043 (ADR-IMPL-070): what Postgres itself keeps of a member's photo — a WebP's container, 1 B to 100 KB, the size
 *  and the tag its bytes' own, one per member, gone with the profile. The bytes here are made up: a RIFF/WEBP header
 *  around filler, never a picture. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { isolatedDb, type IsolatedDb } from "../src/testing/isolated-db";

let iso: IsolatedDb;
let db: IsolatedDb["db"];
beforeAll(async () => {
  iso = await isolatedDb("db-members-photo", { max: 1 });
  db = iso.db;
});
afterAll(() => iso.drop());

/** `RIFF`, a size, `WEBP`, then `length - 12` bytes of filler. */
function webpLike(length: number): Buffer {
  const b = Buffer.alloc(length, 7);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(length - 8, 4);
  b.write("WEBP", 8, "latin1");
  return b;
}
const hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function code(q: ReturnType<typeof sql>): Promise<string> {
  try {
    await db.execute(q);
    return "ok";
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "error";
  }
}

const insert = (memberId: string, image: Buffer, size = image.length, sha = hex(image)) => sql`
  INSERT INTO members.profile_photo (member_id, image, byte_size, sha256) VALUES (${memberId}, ${image}, ${size}, ${sha})`;

describe("members.profile_photo (0043)", () => {
  it("takes a WebP's container from 1 B to 100 KB, its own size and its own sha256 — nothing else", async () => {
    await db.execute(
      sql`INSERT INTO members.profile (member_id, status) VALUES ('photo-a', 'active'), ('photo-b', 'active')`,
    );
    const ok = webpLike(2048);
    expect(await code(insert("photo-a", ok))).toBe("ok");
    // One per member.
    expect(await code(insert("photo-a", ok))).toBe("23505");

    expect(await code(insert("photo-b", webpLike(102_401)))).toBe("23514"); // over 100 KB
    expect(await code(insert("photo-b", ok, 2047))).toBe("23514"); // a size that is not the bytes'
    expect(await code(insert("photo-b", ok, 2048, "0".repeat(64)))).toBe("23514"); // a tag that is not the bytes'
    const png = Buffer.from(ok);
    png.write("\x89PNG", 0, "latin1");
    expect(await code(insert("photo-b", png))).toBe("23514"); // not RIFF
    const wav = Buffer.from(ok);
    wav.write("WAVE", 8, "latin1");
    expect(await code(insert("photo-b", wav))).toBe("23514"); // RIFF, not WEBP
    expect(await code(insert("photo-b", webpLike(102_400)))).toBe("ok"); // exactly 100 KB
  });

  it("belongs to a profile, and goes with it", async () => {
    expect(await code(insert("no-such-member", webpLike(64)))).toBe("23503");
    await db.execute(sql`DELETE FROM members.profile WHERE member_id = 'photo-a'`);
    const left = (await db.execute(sql`SELECT member_id FROM members.profile_photo ORDER BY member_id`)) as unknown as {
      member_id: string;
    }[];
    expect(left.map((r) => r.member_id)).toEqual(["photo-b"]);
  });

  it("updated_at follows an update made in SQL; the image is stored out of line, uncompressed", async () => {
    const [before] = (await db.execute(
      sql`SELECT updated_at FROM members.profile_photo WHERE member_id = 'photo-b'`,
    )) as unknown as { updated_at: Date }[];
    const next = webpLike(4096);
    await db.execute(
      sql`UPDATE members.profile_photo SET image = ${next}, byte_size = 4096, sha256 = ${hex(next)} WHERE member_id = 'photo-b'`,
    );
    const [after] = (await db.execute(
      sql`SELECT updated_at FROM members.profile_photo WHERE member_id = 'photo-b'`,
    )) as unknown as { updated_at: Date }[];
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(before!.updated_at).getTime());
    const [storage] = (await db.execute(sql`
      SELECT a.attstorage AS s FROM pg_attribute a
      WHERE a.attrelid = 'members.profile_photo'::regclass AND a.attname = 'image'`)) as unknown as { s: string }[];
    expect(storage?.s).toBe("e");
  });
});

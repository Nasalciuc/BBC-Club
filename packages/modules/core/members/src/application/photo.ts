/** The member's own photo (ADR-IMPL-070, D9): the bytes in members.profile_photo, read and written only for the member
 *  whose session asks — the routes in module.ts are the only callers; no other module reads a photo. */
import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Executor } from "@bbc/db";
import { profile, profilePhoto } from "@bbc/db/schema/members";

export type StoredPhoto = { image: Uint8Array<ArrayBuffer>; etag: string };

/** The photo's tag: its bytes' sha256, in hex — what Postgres checks it against (profile_photo_sha256). */
export function photoEtag(image: Uint8Array): string {
  return createHash("sha256").update(image).digest("hex");
}

export type PhotoStore = {
  /** The tag of the member's photo, or null — none, or no live profile. Reads no bytes (If-None-Match). */
  etagOf(exec: Executor | undefined, memberId: string): Promise<string | null>;
  /** The member's photo and its tag, or null. */
  read(exec: Executor | undefined, memberId: string): Promise<StoredPhoto | null>;
  /** Keeps `image` as the member's photo, in place of the one before. False — no live profile to hang it on. Run it in
   *  a transaction: the profile is locked until the photo is written, so a deletion cannot leave it behind. */
  write(exec: Executor, memberId: string, image: Uint8Array): Promise<boolean>;
  /** Takes the member's photo away; true when there was one. Asked twice, the second finds none. */
  remove(exec: Executor | undefined, memberId: string): Promise<boolean>;
};

export function createPhotoStore(db: Executor): PhotoStore {
  /** As the profile reads it: a `deleted` profile has no photo to show (facade.ts `live`). */
  const live = (memberId: string) => and(eq(profilePhoto.memberId, memberId), ne(profile.status, "deleted"));

  return {
    async etagOf(exec, memberId) {
      const [row] = await (exec ?? db)
        .select({ etag: profilePhoto.sha256 })
        .from(profilePhoto)
        .innerJoin(profile, eq(profile.memberId, profilePhoto.memberId))
        .where(live(memberId))
        .limit(1);
      return row?.etag ?? null;
    },

    async read(exec, memberId) {
      const [row] = await (exec ?? db)
        .select({ image: profilePhoto.image, etag: profilePhoto.sha256 })
        .from(profilePhoto)
        .innerJoin(profile, eq(profile.memberId, profilePhoto.memberId))
        .where(live(memberId))
        .limit(1);
      return row ? { image: new Uint8Array(row.image), etag: row.etag } : null;
    },

    async write(exec, memberId, image) {
      const [owner] = await exec
        .select({ memberId: profile.memberId })
        .from(profile)
        .where(and(eq(profile.memberId, memberId), ne(profile.status, "deleted")))
        .for("share")
        .limit(1);
      if (!owner) return false;
      const values = { image: Buffer.from(image), byteSize: image.length, sha256: photoEtag(image) };
      await exec
        .insert(profilePhoto)
        .values({ memberId, ...values })
        .onConflictDoUpdate({ target: profilePhoto.memberId, set: { ...values, updatedAt: new Date() } });
      return true;
    },

    async remove(exec, memberId) {
      const gone = await (exec ?? db)
        .delete(profilePhoto)
        .where(eq(profilePhoto.memberId, memberId))
        .returning({ memberId: profilePhoto.memberId });
      return gone.length > 0;
    },
  };
}

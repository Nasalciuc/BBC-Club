import { PHOTO_MAX_BYTES, checkPhotoWebp, stripWebpMetadata, type PhotoProblem } from "@bbc/shared/media/webp";

import type { Profile } from "@/lib/api";

/**
 * The member's own photo (brief 3.4.2, ADR-IMPL-070) — the decisions, pure, so they are tested without React Native:
 * whether this build can pick a photo at all, how a picked photo is cropped and how hard it is compressed, what the app
 * sends, and what the portrait shows. photo-native.ts does the picking and the encoding; PhotoSheet the words.
 */

/**
 * The native modules a photo needs, by the names their packages ask the runtime for (`requireNativeModule`; a test
 * reads them from the packages). A binary built before them (0.2.0) has neither: an update over the air brings the
 * JavaScript, never the native code.
 */
export const PHOTO_NATIVE_MODULES = ["ExponentImagePicker", "ExpoImageManipulator"] as const;

/**
 * Whether this build can pick and encode a photo: every native module is there. `lookup` is expo's
 * `requireOptionalNativeModule` in the app (null for a module the binary does not have); one that throws counts as
 * missing. False — Edit profile has no Photo row, and nothing ever loads the picker's JavaScript.
 */
export function photoPickerAvailable(lookup: (name: string) => unknown): boolean {
  return PHOTO_NATIVE_MODULES.every((name) => {
    try {
      return lookup(name) != null;
    } catch {
      return false;
    }
  });
}

/** The square in the middle of a picture, in whole pixels — what is kept when the picker hands back a picture that is
 *  not square (a crop the platform left a pixel off, or no crop at all). */
export function squareCrop(
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } {
  const side = Math.max(1, Math.floor(Math.min(width, height)));
  return {
    originX: Math.max(0, Math.floor((width - side) / 2)),
    originY: Math.max(0, Math.floor((height - side) / 2)),
    width: side,
    height: side,
  };
}

/** WebP qualities tried in turn, best first, until the photo weighs at most 100 KB. A 512-px face is usually 20–60 KB
 *  at the first. */
export const PHOTO_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35] as const;

export type Encoded = { ok: true; bytes: Uint8Array; quality: number } | { ok: false };

/**
 * The photo at the best quality that fits: `encode` (the manipulator, saving WebP at a quality) is asked at each
 * quality in turn, and the first answer within `max` bytes is kept — none fits, `{ ok: false }`.
 */
export async function encodeWithin(
  encode: (quality: number) => Promise<Uint8Array>,
  max = PHOTO_MAX_BYTES,
  qualities: readonly number[] = PHOTO_QUALITIES,
): Promise<Encoded> {
  for (const quality of qualities) {
    const bytes = await encode(quality);
    if (bytes.length > 0 && bytes.length <= max) return { ok: true, bytes, quality };
  }
  return { ok: false };
}

/**
 * What is sent: the encoder's WebP without its metadata (EXIF, XMP, an ICC profile — whatever the platform's encoder
 * wrote), then the server's own check. A photo that does not pass is never sent.
 */
export function photoToSend(
  encoded: Uint8Array,
): { ok: true; bytes: Uint8Array } | { ok: false; problem: PhotoProblem } {
  const bytes = stripWebpMetadata(encoded);
  const checked = checkPhotoWebp(bytes);
  return checked.ok ? { ok: true, bytes } : { ok: false, problem: checked.problem };
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SEXTET = new Map([...BASE64].map((c, i) => [c, i]));

/** The bytes of a base64 string (the manipulator's `base64`): padding and whitespace ignored; a character outside the
 *  alphabet is an error. */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s=]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let at = 0;
  for (const c of clean) {
    const sextet = SEXTET.get(c);
    if (sextet === undefined) throw new Error("not base64");
    value = (value << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (value >>> bits) & 0xff;
    }
  }
  return out.subarray(0, at).slice();
}

/** The portrait's source, as `Photo` takes it. */
export type PortraitSource = { uri: string; headers?: Record<string, string> };

/**
 * What the portrait shows (Explore's greeting, Profile): the photo the member added — GET /v1/profile/photo with the
 * session's own headers, its tag in the address so a phone keeps each photo once and asks for a new one only when the
 * tag changes; else the photo the club keeps an address of (`avatarUrl`); else nothing, and the portrait shows the
 * initials.
 */
export function portraitSource(
  profile: Pick<Profile, "photo" | "avatarUrl"> | null | undefined,
  apiUrl: string,
  headers: Record<string, string>,
): PortraitSource | null {
  const etag = profile?.photo?.etag;
  if (etag) return { uri: `${apiUrl}/v1/profile/photo?v=${etag}`, headers };
  return profile?.avatarUrl ? { uri: profile.avatarUrl } : null;
}

/** Edit profile's `Photo` row: `Added` once there is one, else `Not set` — as its other rows say a missing value. */
export function photoRowValue(profile: Pick<Profile, "photo"> | null | undefined): string {
  return profile?.photo ? "Added" : "Not set";
}

/**
 * What Edit profile offers for the photo. Choosing needs the picker's native modules; removing is one request and needs
 * none, so a member whose photo was added on another phone can still remove it on a build without the picker: the
 * row and its sheet are there whenever a photo is, the sheet's `Choose` only where the picker is.
 */
export function photoActions(
  pickerReady: boolean,
  hasPhoto: boolean,
): { row: boolean; choose: boolean; remove: boolean } {
  return { row: pickerReady || hasPhoto, choose: pickerReady, remove: hasPhoto };
}

/** Why a photo was not saved, in the sheet's calm words (slate, never red: no field is at fault). */
export type PhotoFailure = "picker" | "prepare" | "upload";

export function photoFailureCopy(failure: PhotoFailure, serverMessage?: string): string {
  if (failure === "picker") return "Your photos could not be opened. Please try again.";
  if (failure === "prepare") return "That photo could not be used. Choose another one.";
  return serverMessage ?? "Your photo was not saved. Please try again.";
}

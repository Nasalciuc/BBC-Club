/** The member's own photo (brief 3.4.2, ADR-IMPL-070): whether a build can pick one, how it is cropped and how hard it is
 *  compressed, what is sent, and what the portrait shows. The photos are made-up WebP bytes, never a picture (D13). */
import { describe, expect, it } from "bun:test";
import { PHOTO_MAX_BYTES, checkPhotoWebp } from "@bbc/shared/media/webp";
import { photoWebp, photoWithMetadata } from "@bbc/shared/media/webp-fixtures";

import {
  PHOTO_NATIVE_MODULES,
  PHOTO_QUALITIES,
  base64ToBytes,
  encodeWithin,
  insideDirectory,
  photoActions,
  photoFailureCopy,
  photoPickerAvailable,
  photoRowValue,
  photoToSend,
  portraitSource,
  squareCrop,
} from "./photo-logic";

const ETAG = "a".repeat(64);

describe("photoPickerAvailable — the row only on a build that has the native modules (D4)", () => {
  it("true only when every module is there", () => {
    expect(photoPickerAvailable(() => ({}))).toBe(true);
    // 0.2.0 reached by an update over the air: neither module.
    expect(photoPickerAvailable(() => null)).toBe(false);
    expect(photoPickerAvailable(() => undefined)).toBe(false);
    // One without the other is no photo either: picking needs the encoder, the encoder needs a pick.
    for (const missing of PHOTO_NATIVE_MODULES) {
      expect(photoPickerAvailable((name) => (name === missing ? null : {}))).toBe(false);
    }
  });

  it("a lookup that throws counts as missing — never a crash", () => {
    expect(
      photoPickerAvailable(() => {
        throw new Error("Cannot find native module");
      }),
    ).toBe(false);
  });

  it("asks for each module by name, once", () => {
    const asked: string[] = [];
    photoPickerAvailable((name) => {
      asked.push(name);
      return {};
    });
    expect(asked).toEqual(["ExponentImagePicker", "ExpoImageManipulator"]);
  });
});

describe("squareCrop", () => {
  it("keeps the square in the middle, in whole pixels", () => {
    expect(squareCrop(4032, 3024)).toEqual({ originX: 504, originY: 0, width: 3024, height: 3024 });
    expect(squareCrop(3024, 4032)).toEqual({ originX: 0, originY: 504, width: 3024, height: 3024 });
    expect(squareCrop(1081, 1080)).toEqual({ originX: 0, originY: 0, width: 1080, height: 1080 });
    expect(squareCrop(512, 512)).toEqual({ originX: 0, originY: 0, width: 512, height: 512 });
    expect(squareCrop(1001.5, 700.4)).toEqual({ originX: 150, originY: 0, width: 700, height: 700 });
  });
});

describe("encodeWithin — the best quality that weighs at most 100 KB", () => {
  const ofSize = (n: number) => new Uint8Array(n);

  it("keeps the first quality that fits and asks no further", async () => {
    const asked: number[] = [];
    const sizes = [180_000, 120_000, 90_000, 60_000];
    const r = await encodeWithin(async (q) => {
      asked.push(q);
      return ofSize(sizes[asked.length - 1] ?? 1);
    });
    expect(r).toMatchObject({ ok: true, quality: PHOTO_QUALITIES[2] });
    expect(r.ok && r.bytes.length).toBe(90_000);
    expect(asked).toEqual(PHOTO_QUALITIES.slice(0, 3));
  });

  it("a photo that fits at once is encoded once, at the best quality", async () => {
    let calls = 0;
    const r = await encodeWithin(async () => {
      calls += 1;
      return ofSize(40_000);
    });
    expect([r.ok && r.quality, calls]).toEqual([0.85, 1]);
  });

  it("exactly 100 KB fits; one byte more does not; never fitting, nothing is sent", async () => {
    expect((await encodeWithin(async () => ofSize(PHOTO_MAX_BYTES))).ok).toBe(true);
    let calls = 0;
    const r = await encodeWithin(async () => {
      calls += 1;
      return ofSize(PHOTO_MAX_BYTES + 1);
    });
    expect(r).toEqual({ ok: false });
    expect(calls).toBe(PHOTO_QUALITIES.length);
    // An encoder that wrote nothing is no photo.
    expect(await encodeWithin(async () => ofSize(0))).toEqual({ ok: false });
  });

  it("the qualities go down, best first, and stay above nothing", () => {
    expect([...PHOTO_QUALITIES].sort((a, b) => b - a)).toEqual([...PHOTO_QUALITIES]);
    expect(PHOTO_QUALITIES.every((q) => q > 0 && q <= 1)).toBe(true);
  });
});

describe("photoToSend — what leaves the phone", () => {
  it("strips what the encoder wrote about the picture, then passes the server's own check", () => {
    const sent = photoToSend(photoWithMetadata());
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(checkPhotoWebp(sent.bytes).ok).toBe(true);
    expect(String.fromCharCode(...sent.bytes)).not.toContain("GPS");
  });

  it("never sends a photo the server would refuse", () => {
    expect(photoToSend(photoWebp({ side: 1024 }))).toEqual({ ok: false, problem: "dimensions" });
    expect(photoToSend(new TextEncoder().encode("not a photo"))).toEqual({ ok: false, problem: "format" });
  });
});

describe("base64ToBytes", () => {
  it("decodes what the manipulator hands back, with or without padding", () => {
    const bytes = photoWebp({ extra: 37 });
    expect(base64ToBytes(Buffer.from(bytes).toString("base64"))).toEqual(bytes);
    expect(base64ToBytes("QQ==")).toEqual(Uint8Array.of(65));
    expect(base64ToBytes("QUI")).toEqual(Uint8Array.of(65, 66));
    expect(base64ToBytes("QUJD\nREVG")).toEqual(new TextEncoder().encode("ABCDEF"));
    expect(base64ToBytes("")).toEqual(new Uint8Array());
  });

  it("refuses what is not base64", () => {
    expect(() => base64ToBytes("not*base64")).toThrow();
  });
});

describe("portraitSource — what the portrait shows", () => {
  const API = "https://api.example.com";
  const HEADERS = { Cookie: "made-up-session" };

  it("the member's own photo: the route with the session's headers, its tag in the address", () => {
    expect(
      portraitSource({ photo: { etag: ETAG }, avatarUrl: "https://cdn.example.com/a.webp" }, API, HEADERS),
    ).toEqual({ uri: `${API}/v1/profile/photo?v=${ETAG}`, headers: HEADERS });
  });

  it("else the address the club keeps; else none — the initials", () => {
    expect(portraitSource({ photo: null, avatarUrl: "https://cdn.example.com/a.webp" }, API, HEADERS)).toEqual({
      uri: "https://cdn.example.com/a.webp",
    });
    expect(portraitSource({ photo: null, avatarUrl: null }, API, HEADERS)).toBeNull();
    // An older server's profile: neither field.
    expect(portraitSource({}, API, HEADERS)).toBeNull();
    expect(portraitSource(null, API, HEADERS)).toBeNull();
  });

  it("a new photo is a new address: the phone never shows the last one from its cache", () => {
    const a = portraitSource({ photo: { etag: ETAG } }, API, HEADERS);
    const b = portraitSource({ photo: { etag: "b".repeat(64) } }, API, HEADERS);
    expect(a?.uri).not.toBe(b?.uri);
  });
});

describe("the row and the words", () => {
  it("the Photo row says Added or Not set", () => {
    expect(photoRowValue({ photo: { etag: ETAG } })).toBe("Added");
    expect(photoRowValue({ photo: null })).toBe("Not set");
    expect(photoRowValue({})).toBe("Not set");
    expect(photoRowValue(null)).toBe("Not set");
  });

  it("each failure says what happened and what to do, calmly", () => {
    for (const copy of [
      photoFailureCopy("picker"),
      photoFailureCopy("prepare"),
      photoFailureCopy("upload"),
      photoFailureCopy("upload", "No connection. Your photo stays as it was."),
    ]) {
      expect(copy.length).toBeGreaterThan(0);
      expect(copy).not.toContain("!");
    }
    expect(photoFailureCopy("upload", "The club's own words.")).toBe("The club's own words.");
  });
});

describe("photoActions — removing needs no picker", () => {
  it("a build with the picker: the row always, Choose always, Remove once there is a photo", () => {
    expect(photoActions(true, false)).toEqual({ row: true, choose: true, remove: false });
    expect(photoActions(true, true)).toEqual({ row: true, choose: true, remove: true });
  });

  it("a build without it: no row until there is a photo, then the row with Remove alone", () => {
    expect(photoActions(false, false)).toEqual({ row: false, choose: false, remove: false });
    expect(photoActions(false, true)).toEqual({ row: true, choose: false, remove: true });
  });
});

describe("insideDirectory — the picker's copy is deleted only from the app's cache", () => {
  const cache = "file:///data/user/0/club.bbc.app/cache/";
  it("a file in the cache, or under it, with or without the directory's last slash", () => {
    expect(insideDirectory(`${cache}ImagePicker/1f2e.jpeg`, cache)).toBe(true);
    expect(insideDirectory(`${cache}crop.jpeg`, cache.slice(0, -1))).toBe(true);
  });
  it("never the member's own photo, a sibling directory, the cache itself or a way out of it", () => {
    expect(insideDirectory("content://media/external/images/media/42", cache)).toBe(false);
    expect(insideDirectory("file:///data/user/0/club.bbc.app/cache2/crop.jpeg", cache)).toBe(false);
    expect(insideDirectory(cache, cache)).toBe(false);
    expect(insideDirectory(`${cache}../files/profile.webp`, cache)).toBe(false);
  });
});

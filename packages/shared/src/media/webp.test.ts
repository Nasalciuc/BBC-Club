import { describe, expect, it } from "bun:test";
import { PHOTO_MAX_BYTES, checkPhotoWebp, stripWebpMetadata } from "./webp";
import { FLAGS, chunk, filler, photoWebp, photoWithMetadata, riff, vp8, vp8l, vp8x } from "./webp-fixtures";

const problem = (bytes: Uint8Array) => {
  const r = checkPhotoWebp(bytes);
  return r.ok ? "ok" : r.problem;
};

describe("checkPhotoWebp — what the club keeps as a member's photo (ADR-IMPL-070)", () => {
  it("takes a 512 × 512 still WebP, lossy or lossless, simple or extended", () => {
    expect(checkPhotoWebp(photoWebp())).toEqual({ ok: true, width: 512, height: 512 });
    expect(problem(photoWebp({ lossless: true }))).toBe("ok");
    expect(problem(riff([vp8x(512, 512), vp8(512, 512)]))).toBe("ok");
    // Alpha: its own chunk before a lossy picture.
    expect(problem(riff([vp8x(512, 512, FLAGS.alpha), chunk("ALPH", filler(33)), vp8(512, 512)]))).toBe("ok");
    // An odd-sized chunk is padded to an even length.
    expect(problem(photoWebp({ extra: 65 }))).toBe("ok");
  });

  it("takes 100 KB, refuses one byte more", () => {
    const head = photoWebp({ extra: 0 }).length;
    const exact = photoWebp({ extra: PHOTO_MAX_BYTES - head });
    expect(exact.length).toBe(PHOTO_MAX_BYTES);
    expect(problem(exact)).toBe("ok");
    expect(problem(photoWebp({ extra: PHOTO_MAX_BYTES - head + 1 }))).toBe("size");
  });

  it("refuses another size, a canvas that is not the picture's, or a picture that is not square", () => {
    expect(problem(photoWebp({ side: 511 }))).toBe("dimensions");
    expect(problem(photoWebp({ side: 1024 }))).toBe("dimensions");
    expect(problem(riff([vp8l(512, 384)]))).toBe("dimensions");
    expect(problem(riff([vp8x(512, 512), vp8(256, 256)]))).toBe("format");
  });

  it("refuses metadata — a chunk or a flag — wherever it stands", () => {
    expect(problem(photoWithMetadata())).toBe("metadata");
    expect(problem(riff([vp8x(512, 512), vp8(512, 512), chunk("EXIF", filler(20))]))).toBe("metadata");
    expect(problem(riff([vp8x(512, 512), chunk("XMP ", filler(20)), vp8(512, 512)]))).toBe("metadata");
    expect(problem(riff([vp8x(512, 512), chunk("ICCP", filler(20)), vp8(512, 512)]))).toBe("metadata");
    for (const flag of [FLAGS.icc, FLAGS.exif, FLAGS.xmp]) {
      expect(problem(riff([vp8x(512, 512, flag), vp8(512, 512)]))).toBe("metadata");
    }
    // A simple file has no room for metadata: a chunk after its picture is still metadata.
    expect(problem(riff([vp8(512, 512), chunk("EXIF", filler(20))]))).toBe("metadata");
  });

  it("refuses an animation", () => {
    expect(problem(riff([vp8x(512, 512, FLAGS.animation), chunk("ANIM", filler(6))]))).toBe("animation");
    expect(problem(riff([vp8x(512, 512, FLAGS.animation), vp8(512, 512)]))).toBe("animation");
  });

  it("refuses what is not a WebP, or a container that does not hold together", () => {
    const good = photoWebp();
    expect(problem(new Uint8Array())).toBe("format");
    expect(problem(new TextEncoder().encode("not an image at all, just words"))).toBe("format");
    // A JPEG's first bytes, a PNG's.
    expect(problem(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, ...filler(60)))).toBe("format");
    expect(problem(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...filler(60)))).toBe("format");
    // RIFF but not WEBP (a WAV).
    const wav = good.slice();
    wav.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(problem(wav)).toBe("format");
    // Cut short, or with bytes after the last chunk: the RIFF size is not the file's.
    expect(problem(good.subarray(0, good.length - 3))).toBe("format");
    expect(problem(Uint8Array.of(...good, 0, 0))).toBe("format");
    // A chunk whose size runs past the end.
    const long = good.slice();
    long[16] = 0xff;
    long[17] = 0xff;
    expect(problem(long)).toBe("format");
    // A chunk the club does not know, two pictures, alpha before a lossless picture, an extended header alone.
    expect(problem(riff([vp8(512, 512), chunk("ZZZZ", filler(8))]))).toBe("format");
    expect(problem(riff([vp8x(512, 512), vp8(512, 512), vp8(512, 512)]))).toBe("format");
    expect(problem(riff([vp8x(512, 512), chunk("ALPH", filler(9)), vp8l(512, 512)]))).toBe("format");
    expect(problem(riff([vp8x(512, 512)]))).toBe("format");
    // A lossy frame that is not a key frame, or without its start code; a lossless one with a wrong signature.
    const inter = photoWebp();
    inter[20] = 0x11;
    expect(problem(inter)).toBe("format");
    const noStart = photoWebp();
    noStart[23] = 0x00;
    expect(problem(noStart)).toBe("format");
    const notLossless = photoWebp({ lossless: true });
    notLossless[20] = 0x2e;
    expect(problem(notLossless)).toBe("format");
  });
});

describe("stripWebpMetadata — what the app sends", () => {
  it("drops EXIF, XMP and the ICC profile and clears their flags; the picture's bytes stay as they were", () => {
    const camera = photoWithMetadata();
    const clean = stripWebpMetadata(camera);
    expect(checkPhotoWebp(clean)).toEqual({ ok: true, width: 512, height: 512 });
    expect(clean).toEqual(riff([vp8x(512, 512), vp8(512, 512)]));
    const text = String.fromCharCode(...clean);
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("xmpmeta");
  });

  it("keeps the alpha flag and its chunk", () => {
    const withAlpha = riff([
      vp8x(512, 512, FLAGS.alpha | FLAGS.exif),
      chunk("ALPH", filler(33)),
      vp8(512, 512),
      chunk("EXIF", filler(12)),
    ]);
    expect(stripWebpMetadata(withAlpha)).toEqual(
      riff([vp8x(512, 512, FLAGS.alpha), chunk("ALPH", filler(33)), vp8(512, 512)]),
    );
  });

  it("hands back a clean photo, or what is not a WebP, as it is", () => {
    const clean = photoWebp();
    expect(stripWebpMetadata(clean)).toBe(clean);
    const words = new TextEncoder().encode("not an image");
    expect(stripWebpMetadata(words)).toBe(words);
  });
});

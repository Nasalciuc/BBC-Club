/**
 * The member's own photo as the club keeps it (ADR-IMPL-070): a still WebP, exactly 512 × 512, at most 100 KB, with no
 * metadata — no EXIF (where and when it was taken, the camera), no XMP, no ICC profile. Read from its RIFF container
 * and the image chunk's header only: the club never decodes the picture. The server refuses what is not such a photo
 * (`checkPhotoWebp`); the app strips what an encoder adds (`stripWebpMetadata`) and checks before it sends.
 *
 * The container (developers.google.com/speed/webp/docs/riff_container): `RIFF`, the size of what follows (32-bit little
 * endian), `WEBP`, then chunks — a FourCC, a 32-bit size, the payload, a pad byte when the size is odd. A simple file
 * is one `VP8 ` (lossy) or `VP8L` (lossless) chunk; an extended one starts with `VP8X`, whose flags name the optional
 * chunks (ICC, alpha, EXIF, XMP, animation) and whose canvas is the picture's size.
 */

/** A side of the photo, in pixels: the app crops square and resizes to it; the server takes no other size. */
export const PHOTO_SIDE = 512;
/** The most a photo may weigh: 100 KB. A 512-px WebP of a face is usually 20–60 KB. */
export const PHOTO_MAX_BYTES = 100 * 1024;
export const PHOTO_CONTENT_TYPE = "image/webp";

/** Why a body is not the club's photo: too heavy, not a WebP, carrying metadata, moving, or not 512 × 512. */
export type PhotoProblem = "size" | "format" | "metadata" | "animation" | "dimensions";
export type PhotoCheck = { ok: true; width: number; height: number } | { ok: false; problem: PhotoProblem };

type Chunk = { fourcc: string; start: number; size: number };

/** The chunks that only describe a picture: never kept. */
const METADATA = new Set(["EXIF", "XMP ", "ICCP"]);
const ANIMATION = new Set(["ANIM", "ANMF"]);
/** What a still picture is made of; every other chunk is dropped by the strip and refused by the check. */
const PICTURE = new Set(["VP8X", "ALPH", "VP8 ", "VP8L"]);

/** VP8X flags, in its first payload byte. */
const FLAG_ICC = 0x20;
const FLAG_EXIF = 0x08;
const FLAG_XMP = 0x04;
const FLAG_ANIMATION = 0x02;
const FLAGS_METADATA = FLAG_ICC | FLAG_EXIF | FLAG_XMP;

const byte = (b: Uint8Array, i: number): number => b[i] ?? 0;
const u24 = (b: Uint8Array, i: number): number => byte(b, i) | (byte(b, i + 1) << 8) | (byte(b, i + 2) << 16);
const u32 = (b: Uint8Array, i: number): number => (u24(b, i) | (byte(b, i + 3) << 24)) >>> 0;
const tag = (b: Uint8Array, i: number): string =>
  String.fromCharCode(byte(b, i), byte(b, i + 1), byte(b, i + 2), byte(b, i + 3));

/** The chunks of a RIFF/WEBP file, or null when the container does not hold together (a size that runs past the end,
 *  bytes after the last chunk, a RIFF size that is not the file's). */
function chunksOf(b: Uint8Array): Chunk[] | null {
  if (b.length < 20 || tag(b, 0) !== "RIFF" || tag(b, 8) !== "WEBP") return null;
  if (u32(b, 4) + 8 !== b.length) return null;
  const chunks: Chunk[] = [];
  let at = 12;
  while (at < b.length) {
    if (at + 8 > b.length) return null;
    const size = u32(b, at + 4);
    const start = at + 8;
    if (start + size > b.length) return null;
    chunks.push({ fourcc: tag(b, at), start, size });
    at = start + size + (size & 1);
  }
  return at === b.length ? chunks : null;
}

/** A lossy key frame's size: the frame tag (3 bytes, bit 0 clear on a key frame), the start code 9d 01 2a, then the
 *  width and the height in 14 bits each. */
function vp8Size(b: Uint8Array, c: Chunk): [number, number] | null {
  const s = c.start;
  if (c.size < 10 || (byte(b, s) & 1) !== 0) return null;
  if (byte(b, s + 3) !== 0x9d || byte(b, s + 4) !== 0x01 || byte(b, s + 5) !== 0x2a) return null;
  return [(byte(b, s + 6) | (byte(b, s + 7) << 8)) & 0x3fff, (byte(b, s + 8) | (byte(b, s + 9) << 8)) & 0x3fff];
}

/** A lossless picture's size: the signature 0x2f, then the width − 1 and the height − 1 in 14 bits each, the alpha
 *  hint, and a version that must be 0. */
function vp8lSize(b: Uint8Array, c: Chunk): [number, number] | null {
  const s = c.start;
  if (c.size < 5 || byte(b, s) !== 0x2f) return null;
  const bits = u32(b, s + 1);
  if (bits >>> 29 !== 0) return null;
  return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
}

/**
 * Whether `bytes` is the club's photo: at most 100 KB, a WebP whose container holds together, one still picture (an
 * optional `VP8X` and `ALPH` before one `VP8 ` or `VP8L`, nothing else), no metadata chunk or flag, no animation, and
 * 512 × 512 — the canvas and the picture alike. The first fault found, in that order.
 */
export function checkPhotoWebp(bytes: Uint8Array): PhotoCheck {
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, problem: "size" };
  const chunks = chunksOf(bytes);
  if (!chunks || chunks.length === 0) return { ok: false, problem: "format" };
  if (chunks.some((c) => METADATA.has(c.fourcc))) return { ok: false, problem: "metadata" };
  if (chunks.some((c) => ANIMATION.has(c.fourcc))) return { ok: false, problem: "animation" };

  const [first, ...rest] = chunks as [Chunk, ...Chunk[]];
  let canvas: [number, number] | null = null;
  let picture: Chunk | undefined = first;
  if (first.fourcc === "VP8X") {
    if (first.size < 10) return { ok: false, problem: "format" };
    const flags = byte(bytes, first.start);
    if (flags & FLAG_ANIMATION) return { ok: false, problem: "animation" };
    if (flags & FLAGS_METADATA) return { ok: false, problem: "metadata" };
    canvas = [u24(bytes, first.start + 4) + 1, u24(bytes, first.start + 7) + 1];
    // An alpha chunk goes only before a lossy picture (a lossless one carries its own alpha).
    const alpha = rest[0]?.fourcc === "ALPH" ? 1 : 0;
    if (rest.length !== alpha + 1) return { ok: false, problem: "format" };
    picture = rest[alpha];
    if (alpha && picture?.fourcc !== "VP8 ") return { ok: false, problem: "format" };
  } else if (rest.length > 0) {
    return { ok: false, problem: "format" };
  }

  const size =
    picture?.fourcc === "VP8 " ? vp8Size(bytes, picture) : picture?.fourcc === "VP8L" ? vp8lSize(bytes, picture) : null;
  if (!size) return { ok: false, problem: "format" };
  const [width, height] = size;
  if (canvas && (canvas[0] !== width || canvas[1] !== height)) return { ok: false, problem: "format" };
  if (width !== PHOTO_SIDE || height !== PHOTO_SIDE) return { ok: false, problem: "dimensions" };
  return { ok: true, width, height };
}

/**
 * The same WebP without what only describes it: the EXIF, XMP and ICC chunks (and any chunk a still picture is not
 * made of) are dropped, the `VP8X` flags that named them cleared, and the RIFF size made right. The picture's own bytes
 * are copied as they are. Not a WebP whose container holds together: the bytes come back unchanged, for the check to
 * refuse.
 */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  const chunks = chunksOf(bytes);
  if (!chunks) return bytes;
  const kept = chunks.filter((c) => PICTURE.has(c.fourcc) || ANIMATION.has(c.fourcc));
  const flagged = kept.some((c) => c.fourcc === "VP8X" && c.size > 0 && (byte(bytes, c.start) & FLAGS_METADATA) !== 0);
  if (kept.length === chunks.length && !flagged) return bytes;

  const length = 12 + kept.reduce((n, c) => n + 8 + c.size + (c.size & 1), 0);
  const out = new Uint8Array(length);
  out.set(bytes.subarray(0, 12), 0);
  const riff = length - 8;
  out[4] = riff & 0xff;
  out[5] = (riff >>> 8) & 0xff;
  out[6] = (riff >>> 16) & 0xff;
  out[7] = (riff >>> 24) & 0xff;
  let at = 12;
  for (const c of kept) {
    out.set(bytes.subarray(c.start - 8, c.start + c.size), at);
    if (c.fourcc === "VP8X" && c.size > 0) out[at + 8] = byte(bytes, c.start) & ~FLAGS_METADATA;
    at += 8 + c.size + (c.size & 1); // the pad byte stays 0
  }
  return out;
}

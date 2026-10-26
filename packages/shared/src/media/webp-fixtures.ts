/**
 * Made-up WebP files for tests (ADR-IMPL-070): a real RIFF container and real chunk headers around made-up picture
 * bytes — never a photograph, never anyone's face (D13). The server and the app read only the container and the
 * picture's header, so these pass or fail exactly as an encoder's file would.
 */

/** Bytes in an ArrayBuffer of their own (what a fetch body or a response's bytes are). */
type Bytes = Uint8Array<ArrayBuffer>;

const ascii = (s: string): Bytes => Uint8Array.from(s, (c) => c.charCodeAt(0));

function le32(n: number): Bytes {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Deterministic filler, so a test's bytes and their sha256 are the same on every run. */
export function filler(length: number, seed = 1): Bytes {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

/** One chunk: its FourCC, its size, its payload, and a pad byte when the size is odd. */
export function chunk(fourcc: string, payload: Uint8Array): Bytes {
  return concat([
    ascii(fourcc),
    le32(payload.length),
    payload,
    payload.length & 1 ? Uint8Array.of(0) : new Uint8Array(),
  ]);
}

/** `RIFF`, the size of what follows, `WEBP`, the chunks. */
export function riff(chunks: Uint8Array[]): Bytes {
  const body = concat(chunks);
  return concat([ascii("RIFF"), le32(body.length + 4), ascii("WEBP"), body]);
}

/** A lossless picture's chunk: the signature, the size in 14 bits each (minus one), version 0, then `extra` bytes. */
export function vp8l(width: number, height: number, extra = 64): Bytes {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return chunk("VP8L", concat([Uint8Array.of(0x2f), le32(bits >>> 0), filler(extra, width + height)]));
}

/** A lossy key frame's chunk: the frame tag (a shown key frame), the start code, the size, then `extra` bytes. */
export function vp8(width: number, height: number, extra = 64): Bytes {
  const head = Uint8Array.of(
    0x10,
    0x02,
    0x00,
    0x9d,
    0x01,
    0x2a,
    width & 0xff,
    (width >>> 8) & 0x3f,
    height & 0xff,
    (height >>> 8) & 0x3f,
  );
  return chunk("VP8 ", concat([head, filler(extra, width * 3 + height)]));
}

/** The extended header: its flags, three reserved bytes, the canvas's width − 1 and height − 1 in 24 bits each. */
export function vp8x(width: number, height: number, flags = 0): Bytes {
  const w = width - 1;
  const h = height - 1;
  return chunk(
    "VP8X",
    Uint8Array.of(
      flags,
      0,
      0,
      0,
      w & 0xff,
      (w >>> 8) & 0xff,
      (w >>> 16) & 0xff,
      h & 0xff,
      (h >>> 8) & 0xff,
      (h >>> 16) & 0xff,
    ),
  );
}

export const FLAGS = { icc: 0x20, alpha: 0x10, exif: 0x08, xmp: 0x04, animation: 0x02 } as const;

/** A photo the club takes: 512 × 512, lossy by default, `extra` bytes of made-up picture. */
export function photoWebp(opts: { side?: number; lossless?: boolean; extra?: number } = {}): Bytes {
  const side = opts.side ?? 512;
  return riff([opts.lossless ? vp8l(side, side, opts.extra) : vp8(side, side, opts.extra)]);
}

/** The same picture as a camera's encoder may write it: an extended header naming EXIF, XMP and an ICC profile, with
 *  their chunks — a made-up GPS line in the EXIF. */
export function photoWithMetadata(): Bytes {
  return riff([
    vp8x(512, 512, FLAGS.icc | FLAGS.exif | FLAGS.xmp),
    chunk("ICCP", filler(40, 7)),
    vp8(512, 512),
    chunk("EXIF", ascii("Exif\0\0GPS 0.0000N 0.0000E (made up)")),
    chunk("XMP ", ascii("<x:xmpmeta>made up</x:xmpmeta>")),
  ]);
}

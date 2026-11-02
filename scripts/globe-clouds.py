"""The globe's clouds (ADR-IMPL-085): one picture of the whole sky, made here, not taken from anywhere.

    python3 scripts/globe-clouds.py            # writes apps/mobile/assets/images/club/globe/clouds.webp

Clouds of our own making, so nothing is owed to anyone for them: gradient noise sampled on the unit sphere (seamless
across the date line and over the poles), warped twice into swirls, the north axis squeezed so they run east-west as
the winds draw them, thickest where the Earth's clouds gather — the tropics' belt and the storm tracks near 50° — and
thinnest over the subtropics, with a thin veil between. Laid out in Web Mercator to 85.05°, so Mapbox's image source
puts it on the globe as it is. White, the cloud in the alpha alone; a fixed seed, so the same sky every run.
Needs numpy and Pillow (with WebP); takes about three minutes.
"""

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 2048
SEED = 7
OUT = Path(__file__).resolve().parent.parent / "apps/mobile/assets/images/club/globe/clouds.webp"

rng = np.random.default_rng(SEED)
PERM = np.concatenate([rng.permutation(256)] * 2).astype(np.int64)
GRAD = np.array(
    [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
     [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]],
    dtype=np.float32,
)


def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin(x, y, z):
    """Ken Perlin's improved gradient noise, in three dimensions."""
    xi, yi, zi = (np.floor(a).astype(np.int64) for a in (x, y, z))
    xf, yf, zf = ((a - ai).astype(np.float32) for a, ai in ((x, xi), (y, yi), (z, zi)))
    xi, yi, zi = xi & 255, yi & 255, zi & 255
    u, v, w = fade(xf), fade(yf), fade(zf)

    def g(dx, dy, dz):
        h = PERM[PERM[PERM[(xi + dx) & 255] + ((yi + dy) & 255)] + ((zi + dz) & 255)] % 12
        gr = GRAD[h]
        return gr[..., 0] * (xf - dx) + gr[..., 1] * (yf - dy) + gr[..., 2] * (zf - dz)

    x00 = g(0, 0, 0) + u * (g(1, 0, 0) - g(0, 0, 0))
    x10 = g(0, 1, 0) + u * (g(1, 1, 0) - g(0, 1, 0))
    x01 = g(0, 0, 1) + u * (g(1, 0, 1) - g(0, 0, 1))
    x11 = g(0, 1, 1) + u * (g(1, 1, 1) - g(0, 1, 1))
    y0 = x00 + v * (x10 - x00)
    y1 = x01 + v * (x11 - x01)
    return y0 + w * (y1 - y0)


def fbm(x, y, z, octaves, gain=0.5, off=0.0):
    total = np.zeros_like(x, dtype=np.float32)
    amp, freq = 0.5, 1.0
    for o in range(octaves):
        total += amp * perlin(x * freq + off + o * 17.1, y * freq - off + o * 9.3, z * freq + o * 3.7)
        freq *= 2.0
        amp *= gain
    return total


def sky(size):
    """The clouds' alpha, 0..1, for a size × size Web Mercator picture."""
    v = (np.arange(size) + 0.5) / size
    u = (np.arange(size) + 0.5) / size
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * v))))[:, None].repeat(size, 1)
    lon = (u * 360 - 180)[None, :].repeat(size, 0)
    la, lo = np.radians(lat), np.radians(lon)
    px = (np.cos(la) * np.cos(lo)).astype(np.float32)
    py = (np.cos(la) * np.sin(lo)).astype(np.float32)
    qz_ = (np.sin(la) * 1.9).astype(np.float32)  # the north axis squeezed: clouds run east-west

    s = 2.0
    qx = fbm(px * s, py * s, qz_ * s, 4, off=1.7)
    qy = fbm(px * s, py * s, qz_ * s, 4, off=8.3)
    qz = fbm(px * s, py * s, qz_ * s, 4, off=4.1)
    w = 0.9
    ax, ay, az = px * s + w * qx, py * s + w * qy, qz_ * s + w * qz
    rx, ry, rz = fbm(ax, ay, az, 4, off=2.9), fbm(ax, ay, az, 4, off=6.6), fbm(ax, ay, az, 4, off=5.2)
    b = 3.2
    base = fbm(px * b + 1.1 * rx, py * b + 1.1 * ry, qz_ * b + 1.1 * rz, 7, gain=0.55)
    n = base + 0.10 * fbm(px * 16, py * 16, qz_ * 16, 4, off=11.0)

    alat = np.abs(lat)
    cover = (
        0.30
        + 0.26 * np.exp(-(((lat - 6) / 7) ** 2))  # the tropics' belt
        + 0.30 * np.exp(-(((alat - 52) / 13) ** 2))  # the storm tracks
        - 0.16 * np.exp(-(((alat - 24) / 8) ** 2))  # the clear subtropics
        - 0.12 * np.exp(-(((alat - 82) / 7) ** 2))  # the poles, under ice not cloud
    )
    d = np.clip((n - (-0.01 - 0.6 * (cover - 0.3))) / 0.34, 0, 1)
    d = d * d * (3 - 2 * d)
    veil_noise = fbm(px * 3.2 + 0.6 * rx, py * 3.2 + 0.6 * ry, qz_ * 3.2 + 0.6 * rz, 4, off=21.0)
    veil = np.clip((veil_noise + 0.05 - 0.4 * (cover - 0.3)) / 0.35, 0, 1) ** 1.5 * 0.22
    return np.clip(np.maximum(d**1.4 * 0.88, veil), 0, 1)


def main():
    started = time.time()
    alpha = (sky(SIZE) * 255).round().astype(np.uint8)
    white = Image.new("L", (SIZE, SIZE), 255)
    picture = Image.merge("RGBA", [white, white, white, Image.fromarray(alpha, "L")])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Lossy alpha at 70: the soft edges lose under 3 of 255 on average, the file a third of a lossless one.
    picture.save(OUT, "WEBP", quality=90, alpha_quality=70, method=6)
    print(f"{OUT.name}: {SIZE}px, {OUT.stat().st_size // 1024} KB, cover {alpha.mean() / 255:.2f}, {time.time() - started:.0f}s")


if __name__ == "__main__":
    sys.exit(main())

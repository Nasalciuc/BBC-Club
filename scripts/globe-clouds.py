"""The globe's clouds (ADR-IMPL-085): one picture of the whole sky, made here, not taken from anywhere.

    python3 scripts/globe-clouds.py   # writes apps/mobile/assets/images/club/globe/clouds-{a,b}-{north,tropics,south}.webp

Clouds of our own making, so nothing is owed to anyone for them: fine ones, thin white wisps and small puffs, not
banks (the owner's choice among six looks, variant D). Gradient noise sampled on the unit sphere (seamless across the date line and over the
poles), swirled, the north axis squeezed so they run east-west as the winds draw them; ridged noise for the wisps,
plain noise for the puffs; only where a weather system is, most in the tropics' belt and the storm tracks near 55°,
fewest over the subtropics (the Sahara and Arabia stay clear). Laid out in Web Mercator to 85.05°, so Mapbox's image source
puts it on the globe as it is. White, the cloud in the alpha alone; a fixed seed, so the same sky every run.

They move (the owner's ask: as air masses would): two moments of the same sky, `a` and `b` — the swirl a little further
on in `b` — that the app fades into each other, each cut into three bands the app slides at the winds' own pace and way:
east in the northern and southern westerlies, west in the tropics' trade winds (`features/globe/cloud-drift.ts`). The
bands overlap by 12°, each fading out across the overlap as its neighbour fades in, so at rest they sum to the whole.
Each band's picture holds two turns of its sky side by side (3072 px across): wherever a band has drifted, the app lays
it so that one whole turn covers the world and its middle stays inside the world, the one place Mapbox's image source
can sit (`cloud-drift.ts`).
Needs numpy and Pillow (with WebP); takes about four minutes.
"""

import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 1536
SEED = 7
OUT_DIR = Path(__file__).resolve().parent.parent / "apps/mobile/assets/images/club/globe"
MAX_LAT = 85.0511287798066
# The two moments: how far along the swirl's field `b` is from `a`.
SLICES = {"a": 0.0, "b": 0.35}
# The bands, as cloud-drift.ts slides them: [north edge, south edge] of each picture, its fade on the inner edges.
BANDS = {"north": (MAX_LAT, 14.0), "tropics": (26.0, -26.0), "south": (-14.0, -MAX_LAT)}
OVERLAP = (14.0, 26.0)

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


def smooth(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def ridged(x, y, z, octaves):
    """Ridged noise: thin bright creases where the noise crosses zero — the wisps."""
    total = np.zeros_like(x, dtype=np.float32)
    amp, freq, weight = 0.5, 1.0, np.ones_like(x, dtype=np.float32)
    for o in range(octaves):
        r = 1 - np.abs(perlin(x * freq + o * 5.3, y * freq - o * 2.1, z * freq + o * 7.7))
        r = r * r * weight
        weight = np.minimum(1, r * 1.6)
        total += r * amp
        freq *= 2.1
        amp *= 0.55
    return total


def sky(size, t=0.0):
    """The clouds' alpha, 0..1, for a size × size Web Mercator picture: 02's thin wisps and small puffs."""
    v = (np.arange(size) + 0.5) / size
    u = (np.arange(size) + 0.5) / size
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * v))))[:, None].repeat(size, 1)
    lon = (u * 360 - 180)[None, :].repeat(size, 0)
    la, lo = np.radians(lat), np.radians(lon)
    px = (np.cos(la) * np.cos(lo)).astype(np.float32)
    py = (np.cos(la) * np.sin(lo)).astype(np.float32)
    pz = (np.sin(la) * 2.0).astype(np.float32)  # the north axis squeezed: clouds run east-west

    alat = np.abs(lat)
    band = (
        0.35
        + 0.35 * np.exp(-(((lat - 6) / 6) ** 2))  # the tropics' belt
        + 0.55 * np.exp(-(((alat - 55) / 12) ** 2))  # the storm tracks
        - 0.30 * np.exp(-(((alat - 24) / 9) ** 2))  # the clear subtropics: the Sahara, Arabia
        - 0.20 * np.exp(-(((alat - 84) / 6) ** 2))  # the poles, under ice not cloud
    )
    # A slow swirl, so the wisps curl round the weather systems.
    s = 1.8
    wx, wy, wz = (fbm(px * s, py * s, pz * s + t, 3, off=o) for o in (1.7, 8.3, 4.1))
    ax, ay, az = px + 0.55 * wx, py + 0.55 * wy, pz + 0.55 * wz
    # Where the weather systems are.
    # The owner's choice (variant D, 2 Nov 2026): fine clouds — fewer systems, thinner wisps, smaller puffs.
    systems = smooth(-0.05, 0.25, fbm(ax * 1.5, ay * 1.5, az * 1.5, 3, off=31.0) + (band - 0.5) * 0.6)
    wisps = smooth(0.66, 0.90, ridged(ax * 5.0, ay * 5.0, az * 5.0, 5))
    puffs = smooth(0.14, 0.32, fbm(ax * 12.0, ay * 12.0, az * 12.0, 5, gain=0.55, off=13.0))
    return np.minimum(0.9, systems * np.maximum(wisps * 0.55, puffs * 0.7))


def mercator_row(lat, size):
    """The picture's row (0 at the top) for a latitude, in Web Mercator."""
    y = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    return (1 - y / np.pi) / 2 * size


def band_weight(lat, band):
    """How much of the sky at this latitude a band carries: 1 inside it, fading across the overlap with its neighbour."""
    lo, hi = OVERLAP
    a = np.abs(lat)
    inner = np.clip((a - lo) / (hi - lo), 0, 1)  # 0 at 14°, 1 at 26°
    if band == "tropics":
        return 1 - inner
    return np.where((lat > 0) == (band == "north"), inner, 0)


def main():
    started = time.time()
    rows = (np.arange(SIZE) + 0.5) / SIZE
    lat_rows = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * rows))))
    for name, t in SLICES.items():
        alpha = sky(SIZE, t)
        for band, (north, south) in BANDS.items():
            top = max(0, int(np.floor(mercator_row(north, SIZE))))
            bottom = min(SIZE, int(np.ceil(mercator_row(south, SIZE))))
            weight = band_weight(lat_rows[top:bottom], band)[:, None]
            a8 = (alpha[top:bottom] * weight * 255).round().astype(np.uint8)
            # Two turns side by side: the sky is seamless across the date line, so the second turn carries on the first.
            a8 = np.concatenate([a8, a8], axis=1)
            white = Image.new("L", (2 * SIZE, bottom - top), 255)
            picture = Image.merge("RGBA", [white, white, white, Image.fromarray(a8, "L")])
            out = OUT_DIR / f"clouds-{name}-{band}.webp"
            # The alpha kept whole: a lossy one shows its steps as contour lines across the soft edges.
            picture.save(out, "WEBP", quality=90, alpha_quality=100, method=6)
            print(f"{out.name}: {2 * SIZE}x{bottom - top}, {out.stat().st_size // 1024} KB")
    print(f"done in {time.time() - started:.0f}s")


if __name__ == "__main__":
    sys.exit(main())

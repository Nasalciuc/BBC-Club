"""Explore's sky clouds (ADR-IMPL-085), taken from the design itself: the cumulus around the globe and in front of its
foot in 02 (`isolated/bbc-club-3.0-design/final/screens/02-explore.png`), lifted off the sky into white-and-shade with
an alpha, so the app lays exactly 02's clouds over its own globe and sky.

    python3 scripts/sky-clouds-from-design.py   # writes apps/mobile/assets/images/club/globe/sky-clouds.webp

How: 02's globe is fitted as a circle (centre 438, 572.3; radius 357.1 px). Outside it the sky's own colour is estimated
around each point (its least red, smoothed) and a cloud is taken as near-grey with a little blue in its shade: where a
pixel's blue-minus-red falls short of the sky's, that is cloud, and its colour is unmixed from the sky behind. Over the
globe's lower rim, where 02 sets cumulus in front of the Earth, the white of the clouds is keyed against the globe's
blues. The globe's own rim glow, the greeting, the avatar, the labels and the search bar are left out. Cut to the rows
the sky runs (200–819 in 02); the app places it by the globe (SkyBackdrop.tsx). Needs numpy, scipy and Pillow.
"""
from pathlib import Path

from PIL import Image
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "isolated/bbc-club-3.0-design/final/screens/02-explore.png"
OUT = ROOT / "apps/mobile/assets/images/club/globe/sky-clouds.webp"
im = np.array(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = im.shape
CX, CY, R = 438.0, 572.3, 357.1
yy, xx = np.mgrid[0:H, 0:W]
d = np.hypot(xx - CX, yy - CY)
ang = np.degrees(np.arctan2(yy - CY, xx - CX))  # 0 right, 90 down, -90 up
mx, mn = im.max(axis=2), im.min(axis=2)
sat = (mx - mn) / np.maximum(mx, 1)

TOP, BAR = 200, 819
region = (yy >= TOP) & (yy < BAR)
region &= ~((xx > 670) & (yy < 330))                 # the avatar
region &= ~((xx < 420) & (yy < 252))                 # the greeting
for x0, y0, x1, y1 in [(247, 324, 369, 394), (270, 416, 377, 487), (706, 435, 808, 505), (473, 545, 589, 613)]:
    region &= ~((xx > x0 - 12) & (xx < x1 + 12) & (yy > y0 - 12) & (yy < y1 + 12))  # the labels

# the sky behind: the bluest the sky gets around each point (its red lowest), smoothed; its colour from that red
outside = (d > R * 1.08) & region
red = np.where(outside, im[..., 0], 255.0)
bgR = ndimage.minimum_filter(red, size=141)
bgR = np.where(bgR >= 255, np.nan, bgR)
rowmed = np.nanmedian(bgR, axis=1)
rowmed = np.where(np.isnan(rowmed), np.nanmedian(rowmed), rowmed)
bgR = np.where(np.isnan(bgR), rowmed[:, None], bgR)
bgR = np.clip(ndimage.gaussian_filter(bgR, 45), 150, 240)
# the sky's blue minus red, from the sky's own pixels (a near-constant spread)
skypx = outside & (im[..., 0] < bgR + 6)
spread = float(np.median(im[..., 2][skypx] - im[..., 0][skypx]))
# a cloud is near-grey with a little blue in its shade: its blue-minus-red is small; the sky's is `spread`
TINT = 0.08
Pr, Pb = im[..., 0], im[..., 2]
c_guess = np.clip(Pr, 120, 255)
alpha_out = np.clip((spread - (Pb - Pr)) / np.maximum(spread - TINT * c_guess, 1), 0, 1)
# the globe's own glow at its rim, where no cloud is (the upper rim), taken off everywhere
ring = (d > R) & (d < R * 1.14)
top_rim = ring & (ang > -150) & (ang < -30)
bins = np.linspace(R, R * 1.14, 30)
idx = np.digitize(d, bins)
halo = np.zeros_like(d)
for i in range(1, len(bins)):
    sel = top_rim & (idx == i)
    if sel.any():
        halo[ring & (idx == i)] = np.median(alpha_out[sel])
alpha_out = np.clip((alpha_out - halo) / np.maximum(1 - halo, 1e-3), 0, 1)

# over the globe's lower rim: the white clouds in front of the blue, by their whiteness
white = np.clip((mn - 95) / (200 - 95), 0, 1) ** 0.8 * np.clip(1 - sat / 0.45, 0, 1)
rim = np.clip((d / R - 0.62) / 0.2, 0, 1)
lower = np.clip((yy - (CY + 0.05 * R)) / (0.25 * R), 0, 1)
alpha_in = white * rim * lower

inside = d <= R * 1.0
alpha = np.where(inside, alpha_in, alpha_out)
# the rim itself (the globe's edge and its glow): only what is cloud, not a thin bright line
rimzone = (d > R * 0.96) & (d < R * 1.07)
opened = ndimage.grey_opening(alpha, size=(9, 9))
alpha = np.where(rimzone, np.minimum(alpha, opened) * np.clip((ang - 5) / 20, 0, 1) * np.clip((175 - ang) / 20, 0, 1), alpha)
alpha *= ndimage.gaussian_filter(region.astype(float), 6)
alpha *= np.clip((BAR - 4 - yy) / 30, 0, 1)  # the bank meets the bar
alpha = ndimage.gaussian_filter(alpha, 0.7)
alpha = np.clip((alpha - 0.07) / 0.93, 0, 1)  # no haze where the sky is only a shade lighter

# the cloud's own colour: unmixed from the sky where thin (outside), as it is (over the globe)
bg = np.stack([bgR, np.clip(bgR + 0.53 * spread, 0, 255), np.clip(bgR + spread, 0, 255)], axis=2)
a3 = np.maximum(alpha, 1e-3)[..., None]
col_out = np.clip((im - (1 - a3) * bg) / a3, 0, 255)
col = np.where(inside[..., None], np.clip(im * 1.03, 0, 255), col_out)
col = np.where(alpha[..., None] < 0.06, 255, col)
rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').crop((0, TOP, W, BAR)).save(OUT, 'WEBP', quality=90, alpha_quality=100, method=6)
print(f"{OUT.name}: {W}x{BAR - TOP}, {OUT.stat().st_size // 1024} KB")

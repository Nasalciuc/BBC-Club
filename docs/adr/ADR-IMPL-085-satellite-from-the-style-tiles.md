# ADR-IMPL-085 — The globe's imagery from the style's tiles

Status: proposed · Date: 2026-11-02 · Scope: `apps/mobile` (`features/globe/satellite-source.ts`, `MapboxGlobe.tsx`,
`MapboxGlobe.web.tsx`, `mapbox-ready-logic.ts`, `cloud-drift.ts`, `assets/images/club/globe/`), `scripts/globe-clouds.py` ·
Amends ADR-IMPL-035 (the Mapbox globe), ADR-IMPL-068 (the black globe's floor) and ADR-IMPL-082 (its consequence "the
token's imagery is refused today") · Owner's request, 2 Nov 2026.

**Context.** No member has seen the satellite globe: the tile probe (F107) has kept the drawn globe on every phone and
on the web. The club's Mapbox account has no payment method — Mapbox's _demo access_ — and Mapbox refuses that account
some of its APIs. Asked on 2 Nov 2026 with the account's one token (the one in the `preview` environment, user
`mrordo`), from the owner's browser and from an EAS sandbox:

| Request                                                                     | Answer                               |
| --------------------------------------------------------------------------- | ------------------------------------ |
| `tokens/v2` (the token)                                                     | 200 `TokenValid`                     |
| `styles/v1/mapbox/satellite-v9` (the style)                                 | 200                                  |
| `v4/mapbox.satellite/…` (Raster Tiles API: the tiles the style names)       | **429**, always                      |
| `v4/mapbox.mapbox-terrain-dem-v1/…` (Raster Tiles API)                      | 429                                  |
| `v4/mapbox.mapbox-streets-v8/…` (Vector Tiles API)                          | 200                                  |
| `styles/v1/mapbox/satellite-v9/static/…` (Static Images API)                | 200, a JPEG                          |
| `styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x` (Static Tiles API) | **200, a JPEG** — 32 of 32 at zoom 3 |

The account's statistics (a year) show no Raster Tiles API use at all: the 429 is the product refused, not a limit
reached. `satellite-v9` names its imagery as a raster tileset (`mapbox://mapbox.satellite`), so the phone's map, the web's
map and the probe all asked the one API the account cannot use, while the same imagery, as tiles of the style, is served.

**Decision.**

1. **One source for the imagery** (`satellite-source.ts`): the style's tiles —
   `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x`, 512 points a tile, served at twice
   that — and a style made from it: `satellite-v9`'s two layers, its background as the drawn globe's deep ocean
   (ADR-IMPL-068, now in the style itself) and the imagery as a raster layer, with `satellite-v9`'s own credits (© Mapbox,
   © OpenStreetMap, Improve this map, © Maxar). No glyphs, no sprite: the pins, labels and route ends are the app's views,
   the route a line layer.
2. **The phone** (`@rnmapbox/maps`) takes that style as `styleJSON`; **the web** (Mapbox GL JS) as its `style`. The
   background no longer needs recolouring after the style loads.
3. **The probe** asks the world's tile at zoom 0 from the same place (`tileProbeUrl`): the drawn globe gives way only to
   imagery the map itself can load. Everything else in `Globe.tsx` is unchanged — the fade, the reprobe on return, the
   drawn globe when Mapbox fails.
4. **The look: variant D** (the owner's choice, 2 Nov 2026, among six drawn on Explore with the account's own imagery:
   natural, vivid like 02, pastel, natural with fine clouds, a first heavy-clouded one, minimal). The photographs as they
   are, with their own deep seas, a little livelier (`raster-saturation` 0.15, `raster-contrast` 0.08); no lighter sea
   over them (an earlier step filled Mapbox Streets' water with the drawn globe's ocean; D has none, so no new colour
   and no vector tiles). Fine clouds over them: pictures of the whole sky (Web Mercator to 85.05°, white with the
   cloud in the alpha) made by `scripts/globe-clouds.py` — thin wisps (ridged noise) and small puffs, swirled, only
   where a weather system is: most in the tropics' belt and the storm tracks, fewest over the subtropics; a fixed
   seed, so nothing is owed for them. Laid on the sphere as image sources over the imagery and under the route, they
   turn with the Earth. The phone adds them as `ImageSource` + `RasterLayer` (above `satellite`), which resolve the
   bundled files; the web's style carries them with the URLs Metro gives.
5. **The clouds move** (the owner's ask: as air masses would; simulated, his choice over NASA's daily clouds or a paid
   live service): two moments of one sky, `a` and `b` (the swirl a little further on in `b`), each cut into three bands
   — north of 14°, 26° either side of the equator, south of −14° — that overlap by 12° and fade across the overlap.
   `cloud-drift.ts` slides each band along longitude at the winds' own way — east 0.11°/s in the northern westerlies,
   0.09°/s in the southern, west 0.06°/s in the trades — and fades `a` into `b` and back over 150 s; the six pictures
   (about 0.75 MB together) are moved twice a second while the globe may move (`useCloudClock`: Explore on screen, the
   app in front, motion not reduced), and stay still otherwise. Mapbox does not carry an image round the globe: it
   draws an image source only inside the world, from the one tile under the image's middle, and a middle past 180° has
   no tile, so the image is not drawn at all (GL JS 3.33's `getCoordinatesCenterTileID`; CodeRabbit on #121). So each
   picture holds two turns of its band side by side (3072 px across, 1536 a turn) and lies from −540° + shift to
   180° + shift: whatever the shift, one whole turn covers the world, the rest falls outside it and is not drawn, and
   the middle (shift − 180°) stays inside, in the world's own tile.
6. **02's clouds beside and before the globe**: `SkyClouds` no longer draws soft round puffs. It lays 02's own cumulus,
   lifted off the design (`scripts/sky-clouds-from-design.py`, `assets/images/club/globe/sky-clouds.webp`, 52 KB): the
   sky's colour estimated around each cloud and unmixed from it, the clouds in front of the globe's foot keyed from its
   blues, the globe's own glow, the words, the avatar, the labels and the bar left out — and places it by the globe:
   02's globe (centre 438, 372.3 in the picture, radius 357.1 px) on the screen's (radius 168 pt). The globe's halo is
   thinner to match 02 (`horizonBlend` 0.06 → 0.02, phone and web): the wide glow washed out the clouds beside it.

**Consequences.**

- The satellite globe shows on demo access, and on standard access the same; nothing waits on the account for it.
- Mapbox bills these tiles as Static Tiles API requests, not as the Maps SDK's monthly users alone. The phone's SDK keeps
  them in its tile cache as it kept the tileset's. On demo access every product has a cap Mapbox does not publish, and
  reaching any cap stops all Mapbox APIs until the account is upgraded — then the probe fails and the drawn globe stays.
  Demo access also caps the Maps SDK at 100 monthly users (the console's figure). A launch needs a payment method on the
  account (standard access) whatever the source.
- The token is in the style's tile URL, as it was in every request Mapbox's SDK made: the public `pk.` token, in the
  bundle already. A URL restriction holds only for requests a browser makes (it is checked against the page's address);
  the phones' requests carry none, so a restricted token would refuse them and keep the drawn globe. Restrict only a
  token of the web build's own, and give the phones an unrestricted one — not the one token for both that ADR-IMPL-082's
  advice would restrict.
- An over-the-air update: no native change. The update grows by the clouds' pictures, about 0.8 MB (their alpha
  kept whole: a lossy one showed its steps as contour lines).
- Checked on 2 Nov 2026 in the owner's browser with Mapbox GL JS 3.9, the account's token and this style, projection
  `globe`: the map loaded and went idle with every tile in, no error, and drew the Earth by day.
  The six looks of decision 4 were drawn the same way, each idle with no error; D is the one kept. The phones' build is
  to be seen on the preview build.
- The drift (decision 5) was checked the same day with the app's own Mapbox GL JS 3.33.0 in a headless Chromium, on the
  globe, with a picture whose colour is its longitude: at shifts of 0°, 90°, 179.97°, 180°, 270° and 359.97° (the
  trades' first tick), seen from twelve longitudes, every point sampled showed the colour it should, within 0.6°, and
  the picture sat in tile 0/0/0. The first placement (one turn from −180° + shift) left a gap as wide as the shift and,
  from 180° on, a tile 0/1/0 that is never drawn — at 359.97° no cloud at all. The phones' SDK was not checked: the
  preview build is where to see it.

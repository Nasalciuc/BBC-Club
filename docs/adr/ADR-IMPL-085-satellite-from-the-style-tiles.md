# ADR-IMPL-085 — The globe's imagery from the style's tiles

Status: proposed · Date: 2026-11-02 · Scope: `apps/mobile` (`features/globe/satellite-source.ts`, `MapboxGlobe.tsx`,
`MapboxGlobe.web.tsx`, `mapbox-ready-logic.ts`) · Amends ADR-IMPL-035 (the Mapbox globe), ADR-IMPL-068 (the black
globe's floor) and ADR-IMPL-082 (its consequence "the token's imagery is refused today") · Owner's request, 2 Nov 2026.

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

**Consequences.**

- The satellite globe shows on demo access, and on standard access the same; nothing waits on the account for it.
- Mapbox bills these tiles as Static Tiles API requests, not as the Maps SDK's monthly users alone. The phone's SDK keeps
  them in its tile cache as it kept the tileset's. On demo access every product has a cap Mapbox does not publish, and
  reaching any cap stops all Mapbox APIs until the account is upgraded — then the probe fails and the drawn globe stays.
  Demo access also caps the Maps SDK at 100 monthly users (the console's figure). A launch needs a payment method on the
  account (standard access) whatever the source.
- The token is in the style's tile URL, as it was in every request Mapbox's SDK made: the public `pk.` token, in the
  bundle already. It should be limited to the club's URLs in Mapbox's account.
- An over-the-air update: no native change.
- Checked on 2 Nov 2026 in the owner's browser with Mapbox GL JS 3.9, the account's token and this style, projection
  `globe`: the map loaded and went idle with every tile in, no error, and drew the Earth by day.

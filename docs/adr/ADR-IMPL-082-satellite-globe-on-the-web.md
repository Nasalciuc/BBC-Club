# ADR-IMPL-082 — The satellite globe on the web too

Status: proposed · Date: 2026-11-02 · Scope: `apps/mobile` (`features/globe/MapboxGlobe.web.tsx`, `Globe.tsx`'s
`MAPBOX_READY`, `package.json`: `mapbox-gl` 3.33.0), `design/components.md` · Extends ADR-IMPL-035 (the Mapbox globe) ·
Owner's decision, 2 Nov 2026.

**Context.** Explore's globe is Mapbox's satellite imagery on the phone (ADR-IMPL-035: `@rnmapbox/maps`, `satellite-v9`,
`projection: globe`, the pale sky's atmosphere), and the drawn globe (`GlobeFallback`) wherever Mapbox cannot draw. The
web build — the club's previews, its screenshots, the owners' look at the app in a browser — always drew the fallback:
`MAPBOX_READY` asked for `@rnmapbox/maps`' native module, which a browser never has, and `@rnmapbox/maps` has no globe of
its own on the web. A clean install could not even export the web build: `@rnmapbox/maps`' web entry imports
`mapbox-gl/dist/mapbox-gl.css`, an optional peer nothing installed. The owner asked for the real globe on the phone and on
the web.

**Decision.**

1. **`MapboxGlobe.web.tsx`** — Metro's platform file, so the phones' builds never see it — draws the same globe with
   Mapbox GL JS: `satellite-v9`, `projection: "globe"`, the phone's atmosphere as fog (the pale sky, a white haze at the
   rim, no stars), the background recoloured to the drawn globe's deep ocean (ADR-IMPL-068), the same rest view, zoom
   range, slow turn (one turn in 120 s, waiting 4 s after a touch), the route's framing and its 600-ms arc, and the tap on
   the disc (`mapboxPress`). Pins, labels, the route's ends and the plane are the same `@bbc/ui` views, laid over the map
   where Mapbox projects each place (`map.project`) and moved with the camera; which pins show and where their labels go
   is decided as on the phone (`mapPoint`, `placeLabels`). Mapbox's logo and attribution stay visible above the sheet.
2. **`MAPBOX_READY`**: not the e2e build, a public token, and the native module **or the web**. Everything else in
   `Globe.tsx` is unchanged: the tile probe, the fade over the drawn globe once the map has loaded, the drawn globe back
   when the map fails.
3. **`mapbox-gl` 3.33.0**, pinned. `@rnmapbox/maps` 10.3.7 names `mapbox-gl ^2.9.0` as an optional peer for its own web
   entry, which the club no longer bundles (the `.web.tsx` file replaces `MapboxGlobe.tsx` there); the install warns, the
   phones' builds are unchanged.

**Consequences.**

- The web build shows the satellite globe wherever `EXPO_PUBLIC_MAPBOX_TOKEN` is set at export, and the drawn globe
  without it, as the phones do. The public token (`pk.`) is in the web bundle as it is in the apps; it should be limited
  to the club's URLs in Mapbox's account.
- Mapbox GL JS counts map loads for billing, as the phones count monthly users (docs/store/data-safety.md lists Mapbox).
- **The token's imagery is refused today.** With the preview environment's token, on 2 Nov 2026 Mapbox served the
  `satellite-v9` style (200) and refused every satellite raster tile (`/v4/mapbox.satellite/…`: 429, its rate-limit
  header at minus one): the account allows that token no raster tiles. The tile probe sees it and keeps the drawn globe —
  on the phones as on the web — so no member has seen the satellite globe on a preview build. The globe draws its
  imagery once the Mapbox account (its billing, or the token's scopes) allows raster tiles; nothing in the club changes
  for that. Checked with the same imagery swapped in (NASA's Blue Marble) in a test browser: the web globe draws, turns
  and frames a route.
- No server change, no new flag.

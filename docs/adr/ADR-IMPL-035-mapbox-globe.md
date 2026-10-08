# ADR-IMPL-035 — The Explore globe on Mapbox

Status: accepted · Date: 2026-10-05 · Decided by: the owner · Supersedes: ADR-IMPL-033 "Why not Mapbox"

**Context.** The drawn globe (ADR-IMPL-033) ships by OTA and matches Figma, but members could tap only London: Paris
sat 13 points from it under London's 48-point tap area, Tokyo and Singapore were on the far side, Dubai fell off a
393-point screen, and a chosen route was framed behind the sheet. The owner wants the globe on Mapbox now.

**Decision.** Explore draws its globe with `@rnmapbox/maps` 10.3.7 on the Mapbox Maps SDK 11.23.1, globe projection.

- **Style in code, not Mapbox Studio** (`MapboxGlobe.tsx`): ocean `surface-panel`, land `surface-muted`, space and
  horizon `surface-night`, no labels, no roads. The land is the same Natural Earth data as the drawn globe (`landFor`),
  as a GeoJSON source: no tiles are downloaded, the globe works offline, and the shapes match Figma.
- **Sizes from Figma** (`globe-geo.ts`, tested): zoom 1.605 gives Figma's 248-point radius; pinch 1×–3×; pins 8 / 12
  points, offer halos 28 pulsing every 2 s; the route is a dashed great circle, unwrapped across the antimeridian.
- **Taps** (`pickPin`): the nearest pin wins; only a tap that lands between two pins (within 8 points of both) zooms
  toward them. Home is drawn, never picked.
- **Framing** (`routeCamera`, `globePadding`): London, Paris or Rome from New York keep Figma's opening view; any
  other route centres its great-circle midpoint and zooms out until both ends fit the width, above the sheet.
- **Motion**: Figma's 3° a second westward turn, paused by a touch and resumed after 4 s; none with reduced motion.
- **Mapbox's logo and attribution** stay visible, as Mapbox's terms require, just above the sheet's top edge.
- **Telemetry is off** (`setTelemetryEnabled(false)`). Mapbox still receives an anonymous identifier to count monthly
  active users; `docs/store/data-safety.md` and `app-privacy.md` say so.
- **Accessibility**: the map is one adjustable element — swiping up and down walks the destinations, a double tap
  chooses one.
- **Fallback** (`Globe.tsx`): the e2e APK (Maestro taps the drawn pins, offline), a build without a token, a build
  without the native module, and any Mapbox error at render all draw `GlobeFallback`. `@rnmapbox/maps` throws on
  import without its native module, so it is loaded through `import()` only after `NativeModules.RNMBXModule` exists.
- **Versioning**: the app version moves to 0.2.0. `runtimeVersion` follows it, so OTA updates for 0.2.0 never reach a
  0.1.0 APK that has no Mapbox.
- **Environment**: `EXPO_PUBLIC_MAPBOX_TOKEN` (public `pk.` token) and the staging `EXPO_PUBLIC_API_URL` live in the
  EAS environments, not in git (`docs/release.md` §1, §1b). Production refuses to build without the token, and refuses
  a secret one.

**Rejected.** MapLibre: its globe exists only in GL JS for the web, not in MapLibre Native, which React Native uses.
Mapbox Studio styles: they move the design out of code review and need a style URL per environment. Mapbox vector
tiles: Figma's globe has no detail they would add, and they cost requests and offline behaviour.

**Costs.** A native build: every tester installs the 0.2.0 APK once. The APK grows by roughly 10–15 MB. Mapbox bills
per monthly active user: the account needs a payment card before launch (without one the limit is 100 MAU, and each
reinstall is a new one), plus usage alerts.

**Rules that follow.** Any change to the native modules is a new build and a new app version. The drawn globe stays
maintained: it is what e2e and any failure show.

## Amendment — 7 Oct 2026: satellite imagery, atmosphere and stars

The owner chose a photographic Earth, like Mapbox's own globe example, over Figma's flat globe. The globe now loads
Mapbox's `satellite-streets-v12` style (imagery with the names of countries and cities; roads only appear past the
globe's zoom range) and draws an `Atmosphere`: a pale horizon (`globe-atmosphere`), a
deep-blue sky (`globe-atmosphere-high`), near-black space (`globe-space`) with stars at 0.6. Pins and the route are
unchanged, except a thin night ring around each dot, which keeps it readable over bright imagery. They are added after
the style, so they sit above its labels.

What this changes from the decision above:

- **Network.** Imagery is downloaded from Mapbox the first time a region is seen, then served from Mapbox's cache. With
  no network and nothing cached, the style cannot load: `onMapLoadingError` switches Explore to the drawn globe, which
  still works offline. The e2e APK keeps the drawn globe.
- **Privacy.** Mapbox now also receives tile requests, so it sees the device's IP address while the globe loads
  imagery (store documents updated). Telemetry stays off.
- **Cost.** Still billed per monthly active user; the Maps SDK's MAU price includes its tiles.
- **Figma.** Figma's globe frames still show the flat style; they are to be updated to this look. Pins, route, zoom,
  framing and motion still follow Figma.
- **Delivery.** JavaScript only: it ships by OTA to the 0.2.0 APK.

## Amendment — 8 Oct 2026: instant globe, cinematic flight, day and night (Figma 07 · Additions, A6)

- **Instant globe.** `Globe.tsx` mounts the drawn globe (`GlobeFallback`) at once and the Mapbox globe over it at
  opacity 0, untouchable, until the map reports itself loaded or idle with its style in; then the satellite fades in
  over 600 ms (Reanimated; 0 ms under Reduce motion) and the drawn globe unmounts 50 ms later. No empty space while
  imagery downloads; the drawn globe's pins answer taps meanwhile. With the satellite style a tile, glyph or sprite
  can fail on a weak connection: only an error **before the style loaded** (a bad token, an unreachable style) or a
  render error hands Explore to the drawn globe for good; later errors are blemishes Mapbox retries. On the light page
  (typing, expanded, an empty route) the map stays mounted but is not displayed.
- **Cinematic flight.** Choosing a destination moves the camera with Mapbox's `flyTo` along the great circle in 950 ms
  (`MOVE_MS.flight`), then the route draws itself home-to-destination in 600 ms (Motion spec 4) through
  `lineTrimOffset: [drawn, 1]`, stepped every 30 ms from JavaScript — the route is a few dozen points, the cost is
  negligible. Back to Rest keeps the 900 ms ease. Reduce motion: an instant ease and the whole route at once, as the
  Figma RM frames show.
- **Day and night.** `packages/ui/src/globe/terminator.ts` computes the sun's declination and sub-solar longitude
  (Meeus's low-precision solar position: declination within 0.01°, hour angle within a quarter degree) and the night
  hemisphere as one planar polygon — the terminator's latitude at every 2° of longitude, closed over the dark pole —
  which a `FillLayer` shades in `surface-night` at 0.35 above the imagery and below the route and pins. Recomputed on
  the minute while the globe is on screen and whenever the app returns to the foreground. Pure and tested against the
  solar altitude at 600 points per date, at the solstices and the equinoxes.
- **Haptics** (the fourth note on A6) wait for a native build: `expo-haptics` is not in the 0.2.0 APK.
- **Delivery.** JavaScript only, OTA.

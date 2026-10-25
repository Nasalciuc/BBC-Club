# ADR-IMPL-068 — Tap anywhere on the globe

Status: proposed · Date: 2026-10-25 · Scope: `packages/shared` (`HomeVM.bookable`, `BookablePlaceVM`), `catalog` (the
facade's `bookable`, `application/bookable.ts`, `site.repo` `bookable`, the night's sync gate), the mobile BFF
(`GET /v1/home`), `scripts/seed-flags.ts`, `packages/ui` globe (`globe-logic`, `globe-geo`, `pin-labels`,
`globe-engine`, `GlobeFallback`), the app (`features/globe`, Explore, `DestinationDetails`), `infra/RUNBOOK.md` · Brief
3.3, decision D8, owner item 5 · Amends ADR-IMPL-033 and ADR-IMPL-035 (the globe takes taps off its pins) and
ADR-IMPL-045 (the night's sync also reads the site for the globe's tap).

Every decision below was taken by default for the owner, from the brief and the evidence of 25 Oct 2026; **the owner
may change any of them**.

**Context.**

- **D8.** A tap anywhere on Explore's globe opens the nearest destination the club can sell, within 600 km; over the
  sea or far from any, a calm answer; never a place the club cannot sell. The pre-registered check ("3.3 globe"): 20
  scripted taps near the site's cities open the right city, 10 taps over open sea give the calm answer, 0 taps fire
  during a drag; and the floor — the drawn globe replaces a black one.
- **The globe before this.** Only pins answered a tap. The drawn globe (`GlobeFallback`) had a pan and a pinch, no tap;
  Mapbox's `onPress` only paused the turn. `GET /v1/home` sent the pins (`destinations`: the cheapest fare per arrival,
  then up to twelve of the site's cities with `catalog.site_pins`) and `places` (code, city, country, no coordinates).
- **What the club sells, as data.** The site's cities (`catalog.site_places`, 153 placed of the 154 the site lists —
  Kyoto has no airport), the US airports the site lists a price from (`catalog.site_routes`, 16 airports for the 18
  names the site uses), the fares on sale (none in production today), the offers a member can see. The formula
  (ADR-IMPL-037) prices any pair with an end in North America: from JFK, 3,672 of the 3,860 reference airports — the
  places the club cannot sell among them.
- **Coverage.** Within 600 km of the 153 cities lies 27 % of the habitable land (Europe 83 %, North America 1 %); with
  the 16 US origins, 32 % (North America 32 %). So a tap on land far from Europe often gets the calm answer too: the copy
  says "nothing near there", not "this is the sea".
- **Screen scale.** At rest the globe is 168 pt across its radius: 600 km is 15.8 pt on screen, half a finger (22 pt)
  is about 834 km; at 3× 600 km is 47.5 pt.
- **Pitfalls measured.** d3's orthographic inverse does not fail off the globe: it clamps a point on the sky to the limb
  (200 pt right of a 168-pt globe's centre gives 145°E on the equator). React Native Gesture Handler 2.32's Tap has no
  distance limit by default. The black globe is satellite-v9's background layer, `rgb(4,7,14)`, wherever a tile is
  missing; @rnmapbox/maps 10.3.7 on Android never reports those errors (10.3.8 does, a native release).

**Decision.**

1. **Bookable from home H** = the site's placed cities, each by its main airport ∪ the arrivals of the fares on sale
   from H (Home's fare pins) ∪ the arrivals of the offers the member can see (Home's feed) ∪ the site's US origin
   airports; minus H and every airport under `SAME_METRO_KM` (100 km) from it. **A formula price alone never makes a
   city bookable**; the formula only prices a city already in the set, through that city's search (D6's order:
   published fare, the site's price, the formula, else "Request a quote"). The origins are in so that a member in
   London who taps New York gets New York: the site has no city in the US, Canada or Mexico.
2. **The API owns the set; the app snaps.** `HomeVM` gains `bookable?: BookablePlaceVM[]`,
   `.optional().catch(undefined)` (`packages/shared`, AGENTS rule 9: this ADR): an older server sends none, and a list
   this app cannot read is none — Home still parses. `BookablePlaceVM` is `AirportVM`'s code, city, name, country, lat
   and lng — the brief's four fields plus the airport's name and country, so a snapped city goes through
   `selectDestination` as a pin's airport does (the destination prints its country before its search answers, and the
   recent searches name the airport). No price. About 21 KB of JSON for the 169 airports of today's site (153 cities, 16 origins; measured), inside Home's existing per-member
   ETag (the tag hashes the body). The nearest search runs on the phone (8 µs for 153 cities): an answer in the same
   frame, offline on the drawn globe, no request per tap, and the tapped point never leaves the phone. The sources, the
   flags, the offers' ownership and the price rules stay on the server.
3. **The flag** `catalog.globe_tap`, `{ enabled: false }`, seeded off by `scripts/seed-flags.ts`. Off: `bookable` is
   absent and nothing is read; a tap off the pins does nothing, as before. On: the catalog facade's `bookable(exec,
{ home, also })` reads the site's part — main airports and origins, one `UNION` joined to `catalog.airports` — the
   same for every member, cached a minute like the site's pins (`catalog:bookable:{generation}` with Redis, else in the
   process) and dropped when the night's sync or an import bumps `catalog:dest:gen`; then, in memory
   (`application/bookable.ts`), adds the BFF's `also` (the fare pins and the offers' arrivals Home already loaded), one
   entry per airport, without home or its metro, by code. **The night's sync** (`sync-site-destinations`) also reads the
   site while this flag is on, as it does for the site's photos and pins: the set is the snapshot.
4. **The snap** (`apps/mobile/src/features/globe/globe-tap-logic.ts`). The nearest bookable city to the tapped point
   by great circle, **within 600 km**, ties to the code. Home takes part as a candidate: when it is nearest (a tap on
   London from Heathrow, or on Newark from JFK — the list leaves home's metro out), the existing home answer (`That's
your home airport.` / `Choose another city.`). Nothing within 600 km, or over the sea: the calm answer. Only at rest
   (02): with a route chosen (13) or every offer raised (16) a tap does what it did. A snapped city opens exactly as a
   pin's tap does — `selectDestination`, its search (`GET /v1/search`) for the price, the route in place (13); a city
   with a pin opens with the pin's airport.
5. **The distance line.** Shown when the city stands **more than 22 pt from the finger on screen** (or out of sight),
   measured in the projection the finger saw: `Nearest: Rome · 180 km`, in kilometres as the brief writes it, rounded
   to 10. A fixed distance in km would print a distance on nearly every tap at rest (600 km is 16 pt there); measured on
   screen, the line shows only zoomed in, where a city can be visibly away from the finger. It is a second line under
   the country in the route's sheet (13), in the country's role and slate.
6. **The calm answer.** `No destination near there.` / `Tap closer to a city, or search for one.`, with the link
   `Search a destination` (17's words) to Search; the home answer carries the same link. The attention `NoticeCard`
   (sheet 41) under the search bar at rest, a polite live region; it stays until the next choice, the search or `See
all`. No image draws the answer or the distance line (`DESIGN.md` has no rule for them): both use existing components,
   roles and tokens, and are reported to design.
7. **The gestures.** The drawn globe: `projector().invert(x, y)` returns null off the disc (the disc is checked before
   d3); a `Gesture.Tap()` with `maxDistance(8)` (the pan's `minDistance`) and `maxDuration(500)`, composed
   `Gesture.Race(Gesture.Simultaneous(pan, pinch), tap)` — a drag starts the pan, which cancels the tap: a drag never
   fires one. A tap on a pin, its label or its 44-pt target (`pinAt`, the same box as `GlobePin`'s hit slop) is the
   pin's; since the Tap's activation may also cancel the pin's own press, the tap chooses the pin too, and a press guard
   keeps one touch to one choice (the second within 400 ms is the same touch). Mapbox (`mapTap`): Mapbox answers a
   press beside the globe with the nearest place on its horizon, and on Android @rnmapbox/maps 10.3.7 reports as the
   press's screen point that place reprojected (`pixelForCoordinate`), on the limb — not the finger. So the place
   decides first: one past the near side (`NEAR_SIDE_DEG`, 80°, where no pin is drawn either) is the sky's. Then the
   screen point must be on the disc (`onGlobeDisc`: the radius at the camera's zoom around the globe's centre — iOS
   reports the finger) and on no pin's target; a press within 400 ms of a pin's press is the pin's (Android's map
   absorbs a press on a MarkerView; iOS is unchecked). Then the place Mapbox gives is the tap. Pins, labels, the route
   view and reduced motion are unchanged. The globe gains no accessible element: Search stays the screen reader's way
   to a city.
8. **The black globe's floor, over the air.** Mapbox's `background` layer (`existing`) is recoloured to the drawn
   globe's deep ocean (`globe-ocean-deep`): a missing tile shows the sea, never near-black. The satellite tile probe
   (F107) is asked again when the app comes back to the foreground or the phone comes back online, while Mapbox is the
   globe shown, at most once a minute; a failure hands Explore back to the drawn globe for the session. Counting
   Mapbox's tile errors after the style loaded (10.3.8's `subscribeMapLoadingError`, which carries the type) needs the
   native release (D4) and is left to it.

**Rejected.** A server endpoint for the nearest city (`GET …/nearest?lat&lng`): a spinner and a request on every tap,
nothing offline, the read rate limit spent, and the tapped point sent to the server. The formula's reach as the set: D8
excludes the places the club cannot sell. A fixed distance in km for the distance line (above). `Gesture.Exclusive`
with the pan first: the tap would wait for the pan to fail, a delay on every tap, for the same result as the race. A
new design component for the answer: no image draws one; the existing notice holds the words.

**Consequences.**

- Nothing changes until an operator turns `catalog.globe_tap` on. Then a member's taps off the pins open cities in
  Europe almost everywhere on land, elsewhere near the site's cities and the US origins only; the calm answer covers
  the rest.
- The set is only as good as the night's snapshot of the site. With the site unreachable the last snapshot stands; an
  empty snapshot (a new environment before its first night) sends an empty list, and the app then answers nothing.
- Home costs one cached read more with the flag on (the query budget test pins it), and about 21 KB of JSON (uncompressed).
- Toronto and Vancouver, which the site lists as origins, are not in the set: the sync's `originAirports` keeps only
  US airports (`site-places.ts`), so their routes are dropped. A separate change.

**Left to the owner.**

- Every decision above; in particular whether the US origins are bookable (1), 13 (the route in place, chosen) or 04
  (the destination's page with its photo) for a snapped city (4), and kilometres or miles (5).
- Design: no image draws the calm answer or the distance line; both are proposed with existing components and want a
  frame of their own in `DESIGN.md` 3.0 — reported, not resolved.
- **To check on a phone** (not runnable here): Mapbox's `onPress` over the sky, beside the globe at rest and in a
  corner zoomed in, on Android above all (its place is the horizon's, past the near side: `mapTap` ignores it — if the
  camera's horizon stood short of 80° the zoomed-in corner would show it); 10 swipes across the globe fire 0 taps, on
  both globes; a pin's press on iOS is not also a map press (a doubled press would choose once, through the guard); the
  drawn globe's pins still open on the first tap (the Tap's activation and the pin's press); a missing tile shows the
  ocean, not black.

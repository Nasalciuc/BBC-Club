# ADR-IMPL-086 — The city's own photograph, and credits out of the way

Status: proposed · Date: 2026-11-03 · Scope: `catalog` (`application/place-photo-sources.ts`), `packages/db`
(`migrations/0056_catalog_place_photos_look_again.sql`, migrate.ts), the app (the photo slots of Explore's offers,
onboarding's home airport, the request sheet and the request received; `usePlacePhotos.ts`; `features/globe/TapPlaces.tsx`;
`app/settings.tsx`), `design/components.md`, `packages/db/seeds/NOTICE.md` · Amends ADR-IMPL-043 (decisions on the
order of a city's files, the size a Commons file needs, the last tier) and ADR-IMPL-083 (where GeoNames' credit
stands) · Owner's request, 3 Nov 2026.

**Context.** The owner, on the preview build (3 Nov 2026), tapped the globe near Ji-Paraná (JPR) and asked for a quote:
the request sheet's trip card showed the club's cabin picture and the fare page the satellite view, though Wikidata
has Ji-Paraná's main image (`Ji-Parana 005.jpg`, 800 × 600, public domain). ADR-IMPL-043 refused any Commons original
not wider than 1280 px (so both widths would be real thumbnails), tried a city's night view (P3451) before its main
image (P18), and where no photo was known the app stood the club's cabin picture in the slot — though ADR-IMPL-056
had already taken that picture out of the club. He asked for the locality's own photo from Wikimedia, "not a random
one", and for the `Place names: GeoNames · CC BY 4.0` line under the tapped airports to go: it does not look good on
Explore.

**Decision.**

1. **The main image first.** A city's candidate files are its main images, then its night views (`factsOf`): the
   photograph a reader of the city's page sees first. Montages, maps and flags stay out; three at most.
2. **A town's smaller photograph counts.** A Commons JPEG in landscape from `MIN_PHOTO_WIDTH` (640 px) wide is
   accepted. Wider than 1280 px, both widths are real thumbnails as before; narrower, Commons answers the 1280-px
   question with the original itself (`thumbwidth` 1280, the original's address — asked of Commons for
   `Ji-Parana 005.jpg` on 3 Nov 2026), which the full-width photo then is, and the card is still its 500-px thumbnail.
   The licence, the credit, the restrictions and the landscape band are ADR-IMPL-043's.
3. **Looked at again now.** Migration 0056 makes every row the job chose itself due at once, not up to 33 days later:
   a night view gives way to the city's main image, a satellite view to a town's own photograph. An operator's photo
   (`override`, never expiring) and a row already due are left as they are. The job keeps its own pace (ten a minute,
   Wikimedia's limits).
4. **No cabin in a city's slot.** While a city's photo is not known, or when there is none a card can show, the slot is
   the light tint `Photo` draws while a picture loads (`fallback={null}`), as ADR-IMPL-056 meant: the trip card of the
   request sheet, the request received, Explore's offers and onboarding's home airport. The fare page's hero keeps the
   satellite view the server chose for a city without a photograph. The cabin picture stays the entry's.
5. **GeoNames' credit in Settings.** CC BY 4.0 asks for the credit in any reasonable manner for the medium; it moves
   from the card under the tapped airports to the legal card of Settings: `Place names` — `GeoNames · CC BY 4.0`,
   opening geonames.org.

**Consequences.**

- Within the job's next runs some cities change photograph: the main image where a night view was shown, a town's own
  photograph where its satellite view was.
- A photograph from 640 to 1280 px wide is softer across a phone's full width than a 1280-px thumbnail; the owner
  prefers the place's own picture to the satellite view or the club's.
- Mapbox's logo and its (i) stay on the globe: Mapbox's terms require both on the map and allow only another corner
  (asked by the owner on 3 Nov 2026; where they stand is his call).
- Checked: the unit tests (the order, Chișinău's answer, a 800-px original, the 640-px edge), the catalog's contract
  tests, migrate's test of 0056, the app's typecheck and lint.

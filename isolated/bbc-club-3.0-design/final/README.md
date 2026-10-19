# BBC Club 3.0 — final design reference

This isolated folder is the final visual reference for BBC Club 3.0.

## Folder rules

- Never import screens/, states/, or components/ into apps/mobile or any @bbc/* package.
- Rebuild the app in React Native using @bbc/ui tokens and components; screenshots are visual references, not application UI.
- Only files in assets/ may be copied into the app.
- Keep all design work isolated in isolated/bbc-club-3.0-design/.

## Source and generation

Source: the BBC Club final image prompt, October 19, 2026.
User-supplied final screenshots are the source references. Eight reference edits, states, component sheets and standalone assets were produced with the built-in imagegen tool using the user's per-image specifications and source images.
Screens 01, 03, 05, 07 and 09 are unchanged copies of the supplied originals.
Generated raster edits and reconstructed photos are visual approximations, not certified pixel-identical extractions. Component-sheet type sizes and shadow values are inferred visual annotations, not authoritative @bbc/ui tokens.

## File inventory

- `screens/01-onboarding.png` — Onboarding.
- `screens/02-explore.png` — Explore.
- `screens/03-search.png` — Search.
- `screens/04-destination.png` — Destination, the city page opened from Search.
- `screens/05-fare-details.png` — Fare details.
- `screens/06-request-quote.png` — Request a quote.
- `screens/07-travel-dates.png` — Travel dates.
- `screens/08-request-received.png` — Request received.
- `screens/09-requests.png` — Requests.
- `screens/10-requests-empty.png` — Requests, no requests yet.
- `screens/11-request-details.png` — Request details.
- `screens/12-profile.png` — Profile.
- `screens/13-destination-globe.png` — Destination on the globe, after choosing a city on Explore.
- `states/14-onboarding-home-airport.png` — Onboarding, choosing the home airport.
- `states/15-onboarding-no-airport.png` — Onboarding, no airport found.
- `states/16-explore-all-offers.png` — Explore, all offers.
- `states/17-explore-no-offers.png` — Explore, no offers yet.
- `states/18-search-typing.png` — Search, typing.
- `states/19-destination-offline.png` — Destination on the globe, offline.
- `states/20-fare-about.png` — Fare details, "About this fare".
- `states/21-fare-unavailable.png` — Fare details, unavailable.
- `states/22-request-missing-return.png` — Request a quote, missing return date.
- `states/23-request-sending.png` — Request a quote, sending.
- `states/24-dates-departure.png` — Travel dates, choosing the departure.
- `states/25-received-notifications.png` — Request received, notifications.
- `states/26-request-saved-offline.png` — Request saved offline.
- `states/27-too-many-requests.png` — Too many requests.
- `states/28-requests-attention.png` — Requests, one needs attention.
- `states/29-requests-loading.png` — Requests, loading.
- `states/30-request-received-status.png` — Request details, received.
- `states/31-request-booked.png` — Request details, booked.
- `states/32-request-not-sent.png` — Request details, saved on the phone.
- `states/33-request-closed.png` — Request details, closed.
- `states/34-settings.png` — Settings.
- `states/35-delete-account.png` — Delete account.
- `states/36-edit-profile.png` — Edit profile.
- `components/37-colors-type-shape.png` — Colors, type and shape.
- `components/38-buttons.png` — Buttons.
- `components/39-fields-controls.png` — Fields and controls.
- `components/40-cards-rows.png` — Cards and rows.
- `components/41-status-feedback.png` — Status and feedback.
- `components/42-navigation-surfaces.png` — Navigation and surfaces.
- `components/43-icons.png` — Icons.
- `components/44-photos-illustration.png` — Photos and illustration.
- `assets/london.png` — London Westminster; daylight landscape 3:2 photo without UI or text.
- `assets/tower-bridge.png` — Tower Bridge; daylight landscape 3:2 photo without UI or text.
- `assets/paris.png` — Paris; daylight landscape 3:2 photo without UI or text.
- `assets/tokyo.png` — Tokyo; daylight landscape 3:2 photo without UI or text.
- `assets/dubai.png` — Dubai; daylight landscape 3:2 photo without UI or text.
- `assets/rome.png` — Rome; daylight landscape 3:2 photo without UI or text.
- `assets/new-york.png` — New York skyline; daylight landscape 3:2 photo without UI or text.
- `assets/business-class-seat.png` — Business-class seat; daylight landscape 3:2 photo without UI or text.
- `assets/airport-lounge.png` — Airport lounge; daylight landscape 3:2 photo without UI or text.
- `assets/empty-state-illustration.png` — Empty-state illustration; square on white, with the complete JFK / NEW YORK to LHR / LONDON boarding pass, plane and barcode; no app UI or airline branding.
- `README.md` — source, isolation rules, generation notes and one-line file inventory.


## Complete illustration asset

Use assets/empty-state-illustration.png directly as one complete image. Do not regenerate, redraw, rebuild or replace its boarding pass, text, objects or London view. The pass already contains JFK, NEW YORK, LHR, LONDON, the small plane and barcode. Keep the cream/navy seat, patterned upholstery, white headrest cloth and pillow, navy fringed throw, side console, London airplane-window view, globe, white background and shadows. Do not invent airline branding, passenger details, ticket numbers, dates or other text. This asset's embedded route labels are intentional and supersede the earlier no-text instruction for this asset only.

## Locked A–Z visual handoff

Start with IMPLEMENTATION-CONTRACT.md and design-contract.json before implementing any screen. REFERENCE-SPEC.md preserves the complete original prompt and all copy; its original no-commit instruction is historical and was superseded by the later explicit GitHub upload request.
Open VISUAL-CATALOG.html for all 117 unscaled source fragments and 29 pinned Lucide SVGs. Original context-specific city photos, Daniel's avatar, airline marks, distinct cabin icons, family/weather details, badges, states and controls are identified in assets/locked/catalog.json with source coordinates and SHA-256 hashes.
The direct extracts are source-pixel copies, not new AI generations. Earlier standalone 3:2 reconstructed photos remain available, but use the locked context-specific crop when screenshot identity matters. Do not substitute unrelated images or invent cities/prices.
Interactive control fragments are reference-only; implement native components using existing @bbc/ui tokens. Existing Lucide SVGs include their license and are not represented as pixel-identical raster traces.
All new files remain isolated and unimported. No application source is changed.

- AGENTS.md — folder-local rules preventing visual substitution and invented content.
- IMPLEMENTATION-CONTRACT.md — source priority, native implementation and no-fallback rules.
- REFERENCE-SPEC.md — complete source specification with all requested screen descriptions and exact copy.
- design-contract.json — fixed data, photo assignments, palette, states and implementation rules.
- VISUAL-CATALOG.html — local visual catalog of every locked fragment and pinned SVG.
- assets/locked/catalog.json — inventory of 117 pixel extracts with exact source rectangles and hashes.
- assets/locked/icons-svg/catalog.json — inventory of 29 pinned Lucide line vectors.
- assets/locked/icons-svg/LICENSE.txt — original Lucide license.
- tooling/export-regions.json — reproducible source rectangles and usage classifications.
- tooling/export-locked-assets.ps1 — deterministic source-pixel export utility.
- tooling/export-vector-icons.mjs — installed-library SVG export and gallery utility.

## Complete locked file inventory

- assets/locked/identity/avatar-daniel.png — identity; image; exact source pixels from screens/12-profile.png.
- assets/locked/branding/wordmark.png — branding; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/branding/wordmark-over-photo.png — branding; reference; exact source pixels from screens/08-request-received.png.
- assets/locked/globe/globe-explore-complete.png — globe; static-image; exact source pixels from screens/02-explore.png.
- assets/locked/globe/globe-route-complete.png — globe; static-image; exact source pixels from screens/13-destination-globe.png.
- assets/locked/photos/photo-new-york-onboarding.png — photos; image; exact source pixels from screens/01-onboarding.png.
- assets/locked/photos/photo-london-search.png — photos; image; exact source pixels from screens/03-search.png.
- assets/locked/photos/photo-paris-search.png — photos; image; exact source pixels from screens/03-search.png.
- assets/locked/photos/photo-tokyo-search.png — photos; image; exact source pixels from screens/03-search.png.
- assets/locked/photos/photo-paris-offer.png — photos; image; exact source pixels from screens/02-explore.png.
- assets/locked/photos/photo-tokyo-offer.png — photos; image; exact source pixels from screens/02-explore.png.
- assets/locked/photos/photo-dubai-offer.png — photos; image; exact source pixels from screens/02-explore.png.
- assets/locked/photos/photo-london-request.png — photos; image; exact source pixels from screens/09-requests.png.
- assets/locked/photos/photo-tokyo-request.png — photos; image; exact source pixels from screens/09-requests.png.
- assets/locked/photos/photo-dubai-request.png — photos; image; exact source pixels from screens/09-requests.png.
- assets/locked/photos/photo-paris-request.png — photos; image; exact source pixels from screens/09-requests.png.
- assets/locked/photos/photo-london-fare-clean.png — photos; image; exact source pixels from screens/05-fare-details.png.
- assets/locked/photos/photo-tower-bridge-clean.png — photos; image; exact source pixels from screens/08-request-received.png.
- assets/locked/photos/photo-business-seat-thumbnail.png — photos; image; exact source pixels from screens/05-fare-details.png.
- assets/locked/photos/photo-airport-lounge-thumbnail.png — photos; image; exact source pixels from screens/05-fare-details.png.
- assets/locked/airlines/airline-british-airways.png — airlines; image; exact source pixels from screens/04-destination.png.
- assets/locked/airlines/airline-virgin-atlantic.png — airlines; image; exact source pixels from screens/04-destination.png.
- assets/locked/airlines/airline-american-airlines.png — airlines; image; exact source pixels from screens/04-destination.png.
- assets/locked/details/cabin-business.png — details; image; exact source pixels from screens/01-onboarding.png.
- assets/locked/details/cabin-first.png — details; image; exact source pixels from screens/01-onboarding.png.
- assets/locked/details/family-children.png — details; image; exact source pixels from screens/01-onboarding.png.
- assets/locked/details/weather-london.png — details; image; exact source pixels from screens/05-fare-details.png.
- assets/locked/details/success-check.png — details; image; exact source pixels from screens/08-request-received.png.
- assets/locked/details/notification-dot.png — details; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/details/timeline-completed.png — details; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/details/timeline-current.png — details; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/details/timeline-upcoming.png — details; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/badges/pill-save-48.png — badges; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/badges/badge-quote-ready.png — badges; reference; exact source pixels from screens/09-requests.png.
- assets/locked/badges/badge-received.png — badges; reference; exact source pixels from screens/09-requests.png.
- assets/locked/badges/badge-booked.png — badges; reference; exact source pixels from screens/09-requests.png.
- assets/locked/badges/badge-closed.png — badges; reference; exact source pixels from screens/09-requests.png.
- assets/locked/badges/badge-not-sent.png — badges; reference; exact source pixels from states/32-request-not-sent.png.
- assets/locked/controls/onboarding-progress.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/cabin-business-selected.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/cabin-first-unselected.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/traveler-stepper.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/family-info-card.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/primary-continue.png — controls; reference; exact source pixels from screens/01-onboarding.png.
- assets/locked/controls/search-field.png — controls; reference; exact source pixels from screens/03-search.png.
- assets/locked/controls/trip-segment.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/trip-date-fields.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/trip-travelers-field.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/contact-name.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/contact-phone.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/contact-email.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/contact-note.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/primary-request.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/round-back.png — controls; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/controls/round-share.png — controls; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/controls/round-heart.png — controls; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/controls/round-bookmark.png — controls; reference; exact source pixels from screens/13-destination-globe.png.
- assets/locked/controls/sheet-grabber.png — controls; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/controls/toggle-off.png — controls; reference; exact source pixels from screens/07-travel-dates.png.
- assets/locked/controls/calendar-selected.png — controls; reference; exact source pixels from screens/07-travel-dates.png.
- assets/locked/controls/filter-chips.png — controls; reference; exact source pixels from screens/09-requests.png.
- assets/locked/navigation/tabs-explore.png — navigation; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/navigation/tabs-requests.png — navigation; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/navigation/tabs-profile.png — navigation; reference; exact source pixels from screens/12-profile.png.
- assets/locked/navigation/timeline-quote-ready.png — navigation; reference; exact source pixels from screens/11-request-details.png.
- assets/locked/cards/offer-paris-complete.png — cards; reference; exact source pixels from screens/02-explore.png.
- assets/locked/cards/popular-london-complete.png — cards; reference; exact source pixels from screens/03-search.png.
- assets/locked/cards/recent-search-row.png — cards; reference; exact source pixels from screens/03-search.png.
- assets/locked/cards/request-london-complete.png — cards; reference; exact source pixels from screens/09-requests.png.
- assets/locked/cards/trip-summary-complete.png — cards; reference; exact source pixels from screens/06-request-quote.png.
- assets/locked/cards/fare-weather-complete.png — cards; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/cards/flight-overview-complete.png — cards; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/cards/route-preview-complete.png — cards; reference; exact source pixels from screens/05-fare-details.png.
- assets/locked/cards/flight-option-complete.png — cards; reference; exact source pixels from screens/04-destination.png.
- assets/locked/cards/profile-trip-london.png — cards; reference; exact source pixels from screens/12-profile.png.
- assets/locked/cards/profile-trip-tokyo.png — cards; reference; exact source pixels from screens/12-profile.png.
- assets/locked/cards/profile-trip-dubai.png — cards; reference; exact source pixels from screens/12-profile.png.
- assets/locked/cards/profile-trip-paris.png — cards; reference; exact source pixels from screens/12-profile.png.
- assets/locked/cards/profile-preferences-rows.png — cards; reference; exact source pixels from screens/12-profile.png.
- assets/locked/feedback/loading-card.png — feedback; reference; exact source pixels from states/29-requests-loading.png.
- assets/locked/feedback/return-date-error.png — feedback; reference; exact source pixels from states/22-request-missing-return.png.
- assets/locked/feedback/button-sending.png — feedback; reference; exact source pixels from states/23-request-sending.png.
- assets/locked/feedback/attention-card.png — feedback; reference; exact source pixels from states/28-requests-attention.png.
- assets/locked/feedback/offline-fare-block.png — feedback; reference; exact source pixels from states/19-destination-offline.png.
- assets/locked/icons-reference/icon-search.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-map-pin.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-plane.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-calendar.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-user.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-users.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-family.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-armchair.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-globe.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-compass.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-clipboard-list.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-chevron-right.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-chevron-down.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-arrow-left.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-arrow-right.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-x.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-share.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-heart.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-bookmark.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-phone.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-bell.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-lock.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-trash.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-user-pen.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-check.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-info.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-sun-cloud.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-bar-chart.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-file-text.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/icons-reference/icon-message.png — icons-reference; reference; exact source pixels from components/43-icons.png.
- assets/locked/navigation-icons/tab-compass-active.png — navigation-icons; image; exact source pixels from screens/05-fare-details.png.
- assets/locked/navigation-icons/tab-requests-active.png — navigation-icons; image; exact source pixels from screens/11-request-details.png.
- assets/locked/navigation-icons/tab-profile-active.png — navigation-icons; image; exact source pixels from screens/12-profile.png.
- assets/locked/icons-svg/search.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/map-pin.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/plane.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/calendar.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/user.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/users.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/armchair.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/globe.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/compass.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/clipboard-list.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/chevron-right.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/chevron-down.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/arrow-left.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/arrow-right.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/x.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/share.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/heart.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/bookmark.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/phone.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/bell.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/lock.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/trash.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/user-pen.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/check.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/info.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/sun-cloud.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/bar-chart.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/file-text.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.
- assets/locked/icons-svg/message.svg — pinned Lucide 1.47.0 line icon; compare with original raster glyph.

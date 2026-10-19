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

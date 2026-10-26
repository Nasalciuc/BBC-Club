Work inside this project, the BBC Club repository on this computer.
All files go into the isolated folder isolated/bbc-club-3.0-design/final/ at the root of the repository: screens/ for Images 1–13, states/ for Images 14–36, components/ for Images 37–44 and assets/ for the separate photos and the illustration. Use exactly the file names below, as PNG.
Keep the folder isolated: change no other file in the project, import it nowhere, run no build, test or install, and do not commit or push. Make sure the line "isolated/bbc-club-3.0-design/" is in .git/info/exclude, so git never picks the images up.
If you cannot write files, give each image its file name, so I can save it there myself.

THE REFERENCE
Images 1–13 are the final screens of BuyBusinessClass Club 3.0, already chosen. They are in final/screens/ (or attached to this message). Look at all 13 before you start. Every image you make must look like the same app: the same fonts and sizes, the same colors, the same shapes and shadows, the same icons, the same photo for each city and the same avatar.
BuyBusinessClass Club is a private business-class travel club app: members see fares from their home airport, request a quote, and a travel specialist arranges the trip by phone.
If you can only make one image per answer, do one step now, then the next each time I write "next".

HOW TO KEEP IT EXACT
1. The 13 final screens are the truth for how everything looks. Never invent a new style, font, color, icon or photo: take every element from them.
2. Every state (14–36) starts from the final screen it names (for example 06): edit that image and change only what the state needs; everything else stays identical, down to the pixel.
3. Every element on the component sheets (37–44) is drawn exactly as it appears on the final screens, at the same size, color, radius, shadow, icon and font. A state that is not on the screens follows the same colors: pressed is a slightly darker navy, disabled is light tint #F1F5F9 with slate text, focused has a navy border, error has a red #EF4444 border and red text.
4. Every text is written exactly as given, word for word, with nothing added or dropped. Every number, date, price, status and active tab follows the data below.
5. After each image, compare it with the final screens. If a font, color, shape, icon, photo, the avatar or a text differs, redo it before you move on.
6. If I write "redo" and a number (for example "redo 22"), make that image again by these rules.

STEP 1 · Edit eight of the final screens
Edit the image itself and save it over the same file, changing only what is listed and keeping everything else identical. If you cannot edit an image, regenerate that screen from its description further down.
02: the avatar at the top right becomes the same man as on the Profile screen (12): a smiling man with dark wavy hair and sunglasses
04: remove the small globe with the JFK → LHR arc from the top left of the photo, so the London photo runs clean across the top; the flight options become the three from the data (British Airways, Virgin Atlantic, American Airlines); the local time reads "14:32" and "London (GMT)"; the tab bar has Explore active
06: behind the dimmed sheet put the Fare details screen (05) instead of the page that is there now; the titles "Request a quote" and "We will contact you" in the same bold sans-serif as every other title, with no serif
08: the wordmark at the top left on one line, "BuyBusinessClass Club", as on 01 and 07
10: the boarding pass in the illustration shows "JFK → LHR" with a small plane, without any airline name or logo
11: under the "We will call" card, the small slate text "Your specialist confirms availability and books by phone. No payment is taken in the app."
12: the "My trips" cards read London, Nov 12 – 19, 2026, JFK → LHR; Tokyo, Jan 14 – 21, 2027, JFK → HND; Dubai, Mar 3 – 10, 2027, JFK → DXB; Paris, Oct 5 – 12, 2026, JFK → CDG
13: the Explore tab icon becomes the compass, as on the other screens; the local time reads "14:32" and "London (GMT)"
Leave 01, 03, 05, 07 and 09 exactly as they are.

STEP 2 · Make Images 14–44 by the rules above
Screens 14–36: a vertical iPhone screenshot, portrait 9:19.5 (if that size is not available, the tallest portrait size), the screen filling the whole image edge to edge, the iOS status bar (9:41) at the top and the home indicator at the bottom; one phone screen per image: not an iPad or tablet layout, not landscape, not a board, no device frame, no captions.
Component sheets 37–44: a portrait sheet on off-white #FAFAF8, the elements at real phone size in a clean grid, each with a small slate label under it.

STEP 3 · The assets, then the README (both at the end)

DESIGN SYSTEM, as in the final screens
Style: modern 2026 travel startup app, light mode with airy white space, bright daylight photography (blue skies, sunlit cities), white cards with subtle soft shadows, sheets with 24px top corners that overlap the photos, round white buttons over photos, pill buttons and chips, thin line icons, Apple-level clean UI with luxury travel branding.
Colors: white #FFFFFF and off-white #FAFAF8 backgrounds; navy #1E293B for text and as the only accent; slate #64748B for secondary text; light tint #F1F5F9 for chips, info cards and fields; light navy #E2E8F0 for borders, dividers and light badges; pale sky #BAD2EB only behind the globe; red #EF4444 only for "Sign out", "Delete account" and errors; no gold, bronze, orange, yellow, green or bright azure blue.
Type: one modern sans-serif (SF Pro / Inter style) everywhere, no serif: very large bold screen titles, bold section titles, small uppercase letter-spaced slate labels ("INDICATIVE FARE", "LOCAL TIME", "BUSINESS CLASS"), comfortable body text, large bold prices with tabular figures.
Wordmark: "BuyBusinessClass Club" on one line, "BuyBusinessClass" bold and "Club" regular, navy (white over photos).
Tab bar: Explore (compass), Requests (clipboard), Profile (person); the active tab has a filled navy icon and a bold label, the others are slate line icons.
The same avatar everywhere: the smiling man with dark wavy hair and sunglasses from 12. The same photo for each city everywhere.

DATA, the same everywhere
Member: Daniel Reed, flies from New York (JFK), Business, 1 adult, +1 212 555 0142, daniel@example.com; 3 trips, 2 open requests, 8 saved.
Fares from New York, round trip, Business, rating ★ 4.8: London $3,900 (was $7,550, save 48%), Paris $3,450 (was $7,500, save 54%), Tokyo $4,200 (was $7,500, save 44%), Dubai $4,100 (was $7,600, save 46%).
Main trip: New York (JFK) to London (LHR), British Airways, Nov 12 – 19, 2026, departs 18:55 on Nov 12, arrives 07:05 +1 on Nov 13, nonstop 7h 10m. London now: 14:32 (GMT), 12°, mostly sunny.
Flight options JFK → LHR: British Airways 18:55 → 07:05 +1, nonstop 7h 10m, $3,900; Virgin Atlantic 19:30 → 07:25 +1, nonstop 6h 55m, $3,950; American Airlines 21:25 → 09:25 +1, nonstop 7h 00m, $4,050.
Requests: London, JFK → LHR, Nov 12 – 19, 2026, Quote ready (received Oct 16, quote ready Oct 18); Tokyo, JFK → HND, Jan 14 – 21, 2027, Received; Dubai, JFK → DXB, Mar 3 – 10, 2027, Booked; Paris, JFK → CDG, Oct 5 – 12, 2026, Closed on Oct 3; Rome, JFK → FCO, Dec 3 – 10, 2026, Not sent, saved on the phone (only in Images 28 and 32).
Because London's quote is ready, the Requests tab shows a small navy dot.

THE 13 FINAL SCREENS (the reference; regenerate one only if Step 1 asks for it or I ask)

Image 1 · Onboarding · file screens/01-onboarding.png
A thin navy progress line at the top, two thirds filled on a light track (it fills as the member answers)
The wordmark at the top left
Title "Where do you usually fly from?", text "So we start with the right fares. You can change this later."
"Your home airport": a large rounded photo card of the Lower Manhattan skyline from the water in daylight, a pin icon and "New York · JFK" in white at the bottom left, a round white chevron button at the bottom right
"Preferred cabin": two selection cards side by side, each with a seat line icon, a bold title and a slate line: "Business" / "More space, a better journey" (selected: navy border, light tint, navy check circle) and "First" / "The highest level of comfort" (empty circle)
"Who usually travels": a card with a person icon, "Adults", "Ages 18+" and a pill stepper "− 1 +"
An info card in light tint with a family icon: "Travelling with children?" and "Add their ages in a note when you request."
Navy pill "Continue →" and the slate text button "Skip"

Image 2 · Explore · file screens/02-explore.png
A soft pale sky with white clouds behind a large daytime globe (Europe, Africa, Asia); navy drop pins with white label cards: "London $3,900", "Paris $3,450", "Tokyo $4,200", "Dubai $4,100"
Top left: "Good morning," in slate and "Daniel" very large in bold navy; the round avatar at the top right
A white search bar with a soft shadow: "Where would you like to go?"
"Offers to inspire" with "See all >"
Offer cards: a tall daylight photo, the city in bold with "★ 4.8" at the right, the country in slate, "from" and the price large and bold, and a light tint pill with the saving: Paris, France, $3,450, "Save 54%"; Tokyo, Japan, $4,200, "Save 44%"; Dubai, UAE, $4,100, "Save 46%"
Tab bar with Explore active

Image 3 · Search · file screens/03-search.png
A light gray search field with a search icon and "Where would you like to go?", and "Cancel" in navy at the right
"Popular from New York": full-width photo cards, the photo on top and under it the city in bold, the airport and code in slate, and at the right "from", the price in bold and a chevron: London, "Heathrow Airport · LHR", $3,900; Paris, "Charles de Gaulle Airport · CDG", $3,450; Tokyo, "Haneda Airport · HND", $4,200
"Recent searches" with "Clear all": rows with a small photo, the city in bold, the dates in slate and a chevron: London, Nov 12 – 19, 2026; Paris, Oct 5 – 12, 2026; Dubai, Mar 3 – 10, 2027

Image 4 · Destination, the city page opened from Search · file screens/04-destination.png
A full-width daylight photo of London (Westminster and Big Ben) at the top, with no globe on it
A white sheet overlapping the photo: "London" very large and bold, and "Iconic sights, world-class culture and unforgettable experiences."
Chips with icons: "Nov 12 – 19, 2026", "Business", "1 adult"
A card: "INDICATIVE FARE", "From $3,900 · round trip", "Indicative · your specialist confirms the fare"; at the right after a divider: "LOCAL TIME", "14:32", "London (GMT)"
"Flight options": the three cards from the data, each with the airline logo, departure and arrival times over the airport codes, "Nonstop · duration" and the price with "round trip"
Navy pill "Request a quote"
Tab bar with Explore active

Image 5 · Fare details · file screens/05-fare-details.png
A large daylight photo of Westminster from across the Thames with round white buttons: back at the left, share and a heart at the right
A strip of rounded thumbnails overlapping the bottom of the photo (London, the business-class seat, the lounge) and three carousel dots under it
"New York to London" very large and bold
Pills with icons: "Business", "Round trip", "1 Adult", "Nov 12–19"
A card: a sun-and-cloud icon, "London weather", "12°", "Mostly sunny", "Nov 12 – 19"; at the right after a divider: "Your fare", "$3,900" large and bold, "Down from $7,550" and a light navy pill "Save 48%"
A card "Flight overview": the British Airways logo and name; JFK, New York, 18:55, Nov 12, 2026, a line with a plane, LHR, London, 07:05 +1, Nov 13, 2026
A card of two rows with icons and chevrons: "About this fare" and "The comparison"
A card "The route": a light map with a dashed navy arc and a small plane from JFK, New York, across the "North Atlantic Ocean" to LHR, London
Navy pill "Request this fare" and the small text "No payment is taken in the app."
Tab bar with Explore active

Image 6 · Request a quote · file screens/06-request-quote.png
The bottom sheet over the dimmed Fare details screen (05), with a grabber and a close button
Title "Request a quote" in bold sans-serif
A trip card: a small London photo, "New York to London", "Business" and the British Airways logo at the right; under a divider "Nov 12 – Nov 19, 2026", "JFK 18:55 → LHR 07:05 +1", and at the right "$3,900" with "$7,550" struck through and "Save 48%"
A segmented control: "Round trip" in navy and "One way"
Fields with an icon and a chevron: "Depart" "Nov 12, 2026", "Return" "Nov 19, 2026", "Travelers" "1 adult"
"We will contact you" in bold sans-serif, then fields with icons: "Name" "Daniel Reed", "Phone" "+1 212 555 0142", "Email" "daniel@example.com", "Note (optional)" with the placeholder "Tell us about your travel plans or any special requests"
Navy pill "Request a quote →" and, with a small phone icon, "A specialist will call you shortly."

Image 7 · Travel dates · file screens/07-travel-dates.png
A top bar: a back chevron, the wordmark in the middle and a round profile button at the right
A rounded photo card of London with, in white, "NEW YORK TO LONDON", "Travel dates" and "Select your preferred travel dates for the best business class fares."
White cards for November 2026 and December 2026, each with < > arrows, the weekdays Mon to Sun and the days as light rounded squares; November starts on a Sunday, December on a Tuesday; Nov 12 and Nov 19 (Thursdays) as navy circles with a light navy band between them
A card "Keep the dates flexible" with "Get better fares if your travel dates can be flexible." and a toggle, off
With a calendar icon: "Preferred dates" and "Your specialist confirms availability."
Navy pill "Use these dates →"

Image 8 · Request received · file screens/08-request-received.png
A daylight photo of Tower Bridge at the top, with the wordmark on one line at the top left
A white sheet with a large navy check circle on its top edge
"Request received." and "A specialist will call you shortly on +1 212 555 0142.", the number in bold
"London is next." and a card: a London photo, "BUSINESS CLASS", "JFK → LHR", "Nov 12 – 19, 2026", "Round trip · 1 adult" and the British Airways logo at the right
Navy pill "View request >"
"Other great fares" with "See all >": photo cards for Paris $3,450, Tokyo $4,200 and Dubai $4,100
Tab bar with Requests active

Image 9 · Requests · file screens/09-requests.png
"Requests" very large and bold, "Journeys in good hands."
Filter chips: "All" in navy, then "Quote ready", "Received", "Booked", "Closed"
Cards with a rounded photo at the left, the city in bold, the badge at the right, the route, the dates, a divider, "Round trip" with a calendar icon, "1 adult" with a person icon, and a chevron: London "Quote ready" (solid navy), Tokyo "Received" (light navy), Dubai "Booked" (navy outline with a check), Paris "Closed" (light gray)
Tab bar with Requests active

Image 10 · Requests, no requests yet · file screens/10-requests-empty.png
"Requests" and "Journeys in good hands."
A soft photographic illustration: a cream and navy business-class seat with a white pillow and a navy throw, an airplane window with a daylight view of London, a small desk globe, and a white boarding pass "JFK → LHR" with a small plane and no airline name or logo
"No requests yet." and "Explore destinations and request a fare. Your requests will appear here."
Navy pill "Explore"
Tab bar with Requests active

Image 11 · Request details · file screens/11-request-details.png
A daylight photo of Westminster with a round white back button
A white sheet: "New York to London" very large, "Nov 12 – 19, 2026 · Round trip", "JFK → LHR · British Airways · 1 adult"
"Request progress": a horizontal stepper, Received with a navy check and "Oct 16", Quote ready as the current step (a navy dot with a soft halo) and "Oct 18", Booked hollow
An info card in light tint with a phone icon: "Your quote is ready." and "A specialist will call shortly to confirm the details."
"Review the quote with your specialist."
A card: "Your fare", "$3,900" very large, "$7,550" struck through and "Save 48%"
A card with a phone icon: "We will call", "+1 212 555 0142"; under it the small slate text "Your specialist confirms availability and books by phone. No payment is taken in the app."
Navy pill with a phone icon: "Call your specialist"
Tab bar with Requests active and the small dot

Image 12 · Profile · file screens/12-profile.png
The New York skyline in daylight at the top, the large round avatar overlapping its bottom edge
"Daniel Reed", "Flies from JFK"
Stats with dividers: "3 Trips", "2 Open requests", "8 Saved"
Navy pill "Edit profile" with a user-edit icon and outline pill "Call us" with a phone icon
"My trips" with "See all >": photo cards with the city, the dates and the route in white: London, Nov 12 – 19, 2026, JFK → LHR; Tokyo, Jan 14 – 21, 2027, JFK → HND; Dubai, Mar 3 – 10, 2027, JFK → DXB; Paris, Oct 5 – 12, 2026, JFK → CDG
A card of rows with icons and chevrons: "Home airport" "New York (JFK)", "Cabin" "Business", "Travelers" "1 adult", "Phone" "+1 212 555 0142"
A card: "Notifications", "Password"
A card: "Delete account" in red with a trash icon
Outline red pill "Sign out"
Tab bar with Profile active

Image 13 · Destination on the globe, after choosing a city on Explore · file screens/13-destination-globe.png
The daytime globe over the Atlantic, a white arc with a small plane from JFK to LHR, navy pins with white labels "JFK" and "LHR", a round white back button and a round white bookmark button
A white sheet with a grabber: "London" very large, "United Kingdom"
Chips with icons: "Nov 12 – 19, 2026", "Business", "1 adult"
"INDICATIVE FARE", "From $3,900 · round trip", "Indicative · your specialist confirms the fare."; at the right after a divider: "LOCAL TIME", "14:32", "London (GMT)"
"Flight option": a card with the British Airways logo and "Business"; "JFK 18:55, Nov 12, 2026" → "LHR 07:05 +1, Nov 13, 2026"; "$3,900 round trip"
Navy pill "Request a quote >"
Tab bar with Explore active, with the compass icon

THE STATES (new images, in the style of the final screens)

Image 14 · Onboarding, choosing the home airport · file states/14-onboarding-home-airport.png
The airport step of 01: a search field "City or airport code" with "New" typed, "Cancel" at the right, the keyboard open
Helper text: "City, airport or code — suggested from your time zone."
Results with a pin icon and the code at the right: New York JFK, Newark EWR, New York LaGuardia LGA

Image 15 · Onboarding, no airport found · file states/15-onboarding-no-airport.png
The same step with "Xyz" typed
"No airports found", "Try a city name or a three-letter airport code, such as JFK.", outline pill "Clear search"

Image 16 · Explore, all offers · file states/16-explore-all-offers.png
02 with the offers raised over the globe after "See all", and "Done" at the top right
Sections of the offer cards from 02: "Offers to inspire" (Paris, Tokyo, Dubai), "To Europe" (London, Paris), "To Asia" (Tokyo), "To the Middle East" (Dubai)
Tab bar with Explore active

Image 17 · Explore, no offers yet · file states/17-explore-no-offers.png
02 with an empty state in place of the offer cards: "No offers yet.", "Your specialist's offers will appear here. Search a destination to request a fare.", navy pill "Search a destination"

Image 18 · Search, typing · file states/18-search-typing.png
03 with "Lon" typed and the keyboard open
"Airports": rows with a pin icon, the city, the airport and the code: London Heathrow LHR, London Gatwick LGW, London City LCY

Image 19 · Destination on the globe, offline · file states/19-destination-offline.png
13 with, in place of the fare, "You're offline." and "You can still request a fare — it goes out as soon as you're back online." with a "Try again" link
Navy pill "Request a quote", still active

Image 20 · Fare details, "About this fare" · file states/20-fare-about.png
A bottom sheet over the dimmed 05: "About this fare", two short paragraphs about this fare and its business-class cabin, navy pill "Got it"

Image 21 · Fare details, unavailable · file states/21-fare-unavailable.png
The photo of 05 with the back button, then "This fare is unavailable." and the navy pill "Request an alternative"
Tab bar with Explore active

Image 22 · Request a quote, missing return date · file states/22-request-missing-return.png
06 with "Return" empty and outlined in red, and under it in red "Select a return date or choose One way."

Image 23 · Request a quote, sending · file states/23-request-sending.png
06 filled in, the fields dimmed, the navy pill with a small white spinner and "Sending…"

Image 24 · Travel dates, choosing the departure · file states/24-dates-departure.png
07 with no date selected, "Departure date" as the title in the photo card, and the "Use these dates" pill disabled in light tint

Image 25 · Request received, notifications · file states/25-received-notifications.png
08 dimmed behind a bottom sheet: a bell icon, "Know when your quote is ready.", navy pill "Turn on notifications", text button "Not now"

Image 26 · Request saved offline · file states/26-request-saved-offline.png
A white screen with a round back button: "Saved. It goes out when you're back online.", "You're offline right now. Nothing more to do — a specialist will call you shortly after it arrives.", navy pill "Done"
Tab bar with Requests active

Image 27 · Too many requests · file states/27-too-many-requests.png
"You've sent several requests this hour.", "You can send another in 12 minutes. Your specialist already has the others.", navy pill "Call your specialist"
Tab bar with Requests active

Image 28 · Requests, one needs attention · file states/28-requests-attention.png
09 with an info card in light tint at the top: "One request needs your attention." and "Open your request to check the details and try again."
First card: Rome, JFK → FCO, Dec 3 – 10, 2026, the line "Your travel details are saved" and the badge "Not sent" (light navy outline); then London, Tokyo and Dubai

Image 29 · Requests, loading · file states/29-requests-loading.png
09 while it loads: the title and the filter chips, then four card skeletons in light tint with a soft shimmer

Image 30 · Request details, received · file states/30-request-received-status.png
The layout of 11 for Tokyo (Tokyo photo, "New York to Tokyo", Jan 14 – 21, 2027, JFK → HND): the stepper with Received as the current step; info card "We have your request. A specialist will call shortly." and "We have your travel details."; the "We will call" card and the small booking text

Image 31 · Request details, booked · file states/31-request-booked.png
The layout of 11 for Dubai ("New York to Dubai", Mar 3 – 10, 2027, JFK → DXB): all three steps completed; info card "Your specialist completed this booking by phone. Your itinerary was sent by email." and "Your specialist confirms your flights."

Image 32 · Request details, saved on the phone · file states/32-request-not-sent.png
The layout of 11 for Rome ("New York to Rome", Dec 3 – 10, 2026, the badge "Not sent"): every step hollow; "Saved on your phone. It goes out when you're back online."; navy pill "Send now"

Image 33 · Request details, closed · file states/33-request-closed.png
The layout of 11 for Paris ("New York to Paris", Oct 5 – 12, 2026, the badge "Closed" and "Closed · Oct 3"): every step hollow in gray; "This request is closed."

Image 34 · Settings · file states/34-settings.png
A top bar with a back chevron and "Settings"; the row cards of 12: "Phone" "+1 212 555 0142", "Password" "Change", "Notifications" "Preferences" with "Request updates are always on."; "Privacy policy", "Terms of use"; "Delete account" in red; outline red pill "Sign out"
Tab bar with Profile active

Image 35 · Delete account · file states/35-delete-account.png
A bottom sheet over the dimmed 34: "Delete your account?", "Your profile, preferences and request history are removed from the app. This can't be undone. This closes 2 open requests.", a "Password" field, red pill "Delete account", text button "Cancel"

Image 36 · Edit profile · file states/36-edit-profile.png
A top bar with a back chevron and "Edit profile"; a card of rows with icons and chevrons: "Home airport" "New York (JFK)", "Cabin" "Business", "Travelers" "1 adult"
Tab bar with Profile active

THE COMPONENT SHEETS (new images, every element exactly as on the final screens)

Image 37 · Colors, type and shape · file components/37-colors-type-shape.png
Swatches with names and hex: White #FFFFFF, Off-white #FAFAF8, Navy #1E293B, Slate #64748B, Light tint #F1F5F9, Light navy #E2E8F0, Pale sky #BAD2EB, Red #EF4444
The type scale with sizes and weights and samples from the app: screen title "Requests", section title "Offers to inspire", the uppercase label "INDICATIVE FARE", body, caption, the large price "$3,900"
The wordmark on light and on a photo; radius samples (pill, 16, 20, 24); the spacing scale 4 to 48; the card and sheet shadows

Image 38 · Buttons · file components/38-buttons.png
The navy pill in four states (default, pressed, disabled, loading "Sending…"), with an arrow ("Continue →") and with an icon ("Call your specialist")
Outline pill ("Call us"), text buttons ("Skip", "See all >", "Clear all", "Cancel")
Destructive: outline red pill "Sign out" and the red row "Delete account"
Round white buttons over a photo: back, share, heart, bookmark, close

Image 39 · Fields and controls · file components/39-fields-controls.png
The search field, empty and while typing with "Cancel"; fields with an icon (Name, Phone, Email, Note) in default, focused, error ("Select a return date or choose One way.") and disabled
The date and travelers fields with chevrons; the segmented control "Round trip / One way"; the pill stepper "− 1 +"; the toggle on and off
The cabin selection cards (Business selected, First); chips with icons ("Nov 12 – 19, 2026", "Business", "1 adult"); filter chips ("All" selected, "Quote ready", "Received", "Booked", "Closed")

Image 40 · Cards and rows · file components/40-cards-rows.png
The offer card (02), the popular photo card (03), the recent search row (03), the flight option card (04 and 13), the trip card (06), the weather and fare card (05), the flight overview card (05), the route card (05), the request card (09), the trip photo card (12), the row card with icons (12), the info card in light tint (01 and 11)

Image 41 · Status and feedback · file components/41-status-feedback.png
Badges: "Quote ready", "Received", "Booked", "Closed", "Not sent"; the horizontal stepper with a completed, a current and an upcoming step; the "Save 48%" pill
The empty state (10), the error state ("Something went wrong." and "Try again"), the offline message ("You're offline." and "Try again"), the attention card ("One request needs your attention."), card and row skeletons, the large navy check (08)

Image 42 · Navigation and surfaces · file components/42-navigation-surfaces.png
The tab bar three times, with Explore, Requests and Profile active, and the small navy dot on Requests
The top bar of 07 (back, wordmark, profile button); the bottom sheet with grabber and close button (06); the greeting header (02); the globe pins with white labels, the white arc with the small plane; the carousel thumbnails with dots (05)

Image 43 · Icons · file components/43-icons.png
One Lucide-style line set at 24px in navy, each with its name: search, map pin, plane, calendar, user, users, family, armchair, globe, compass, clipboard list, chevron right, chevron down, arrow left, arrow right, x, share, heart, bookmark, phone, bell, lock, trash, user pen, check, info, sun cloud, bar chart, file text, message

Image 44 · Photos and illustration · file components/44-photos-illustration.png
The city photos used on the screens, without any UI: London (Westminster), Tower Bridge, Paris, Tokyo, Dubai, Rome, the New York skyline, the business-class seat, the airport lounge
The empty-state illustration of 10 on its own

THE ASSETS (each generated on its own, without any UI or text, saved in assets/)
assets/london.png, assets/tower-bridge.png, assets/paris.png, assets/tokyo.png, assets/dubai.png, assets/rome.png, assets/new-york.png, assets/business-class-seat.png, assets/airport-lounge.png: the same photos as on the screens, in bright daylight, landscape 3:2
assets/empty-state-illustration.png: the illustration of 10 alone, square, on white

THE README (last)
Write isolated/bbc-club-3.0-design/final/README.md:
One line per file with what it shows
The rules of the folder: the final reference for BBC Club 3.0; never imported into apps/mobile or any @bbc/* package; the app is rebuilt in React Native from the @bbc/ui tokens and components; only the files in assets/ may be copied into the app
Source: the BBC Club final image prompt, October 19, 2026
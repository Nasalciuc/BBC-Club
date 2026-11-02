# ADR-IMPL-081 — One price per city; a reference price only with its source

Status: proposed · Date: 2026-11-02 · Scope: `catalog` (`module.ts`: `siteDeals`, `dealEstimates`; `api/index.ts`),
`packages/shared` (`SiteDealVM.estimate`), `apps/api` (Home's BFF: the member's cabin to `siteDeals`; `toCard` without
`published`; `toSiteDealVM`), `apps/mobile` (`dealCardModel`, `lib/saving.ts`, `offer-page-logic.ts`,
`request-summary.ts`, `RequestSheet.tsx`), `infra/RUNBOOK.md`, catalog `MODULE.md` · Amends ADR-IMPL-067 (a deal's card
price) · Owner's decision, 2 Nov 2026.

**Context.** A tour of the app with the company site's real data (`sync-site-destinations` read 153 cities and 1,439
routes; 24 deals from JFK) found the same city at two or three prices:

- **A deal and its destination disagree.** A deal's card shows the site's "Price Today" (`from $1,030` for New York →
  Vienna: per person, no trip, no cabin, ADR-IMPL-067); the destination it opens shows the site's search answer
  (`From $2,011 · round trip`, ADR-IMPL-063). Singapore: $1,489 on the card, $2,386 on the page. A member reads both on
  two taps.
- **A deal's card says nothing of what its price covers** (`Frankfurt from $772`), against DESIGN.md: "a fare says what
  its price covers".
- **An offer's reference price has no source.** `proposals.offers` keeps `published_price` and no source column, yet
  `toCard` sent `published` and the app printed `Save 46%` and `Down from $7,850` on the offer's card, page and request
  sheet. `PricePair` allows `published` only with `publishedSource` (FTC evidence); DESIGN.md: `Save 48%` only where the
  published fare is on record, its source beside it.
- **A request's trip card printed a one-way fare's price beside round-trip days.**

The owner chose the search's price everywhere, and the price alone where a reference price has no source.

**Decision.**

1. **A deal carries its destination's price.** `siteDeals(exec, home, limit, cabin)` prices each picked deal as Home's
   site pins are priced (ADR-IMPL-045, -063): from the deal's own airport to the destination's main airport, round trip,
   in the member's cabin, in D6's order without the live question — the site's stored answer (one `freshFrom` read per
   origin), else the formula; with `catalog.site_prices` off, the formula alone. Where there is a number it is the deal's
   `estimate` (`EstimateVM`: `trip: round_trip`, `basis: formula`, `source`, `asOf`). Nothing new is asked of the site:
   `refresh-site-prices` already keeps the answers for every snapshot route. The memo key adds the cabin, the rules'
   fingerprint and whether the site prices.
2. **`SiteDealVM.estimate`: optional both ways** (`.optional().catch(undefined)`). An app built before it shows the
   site's `price` as before; a new app shows the estimate and says `round trip`. Without one (estimates off, the company
   has no price for the route) the card keeps the site's price and says `per person`. `from New York` follows after
   `·` when the deal leaves from another city.
3. **No reference price without its source.** `toCard` no longer sends an offer's `published` (it has no source). The
   app takes out a `published` without `publishedSource` (`onRecord`) on an offer's page, its sheets and its request, and
   `savingPercent` answers none without a source — for a server from before this change.
4. **A fare's price only beside the trip it covers.** The request's trip card prints a catalogue fare's price only while
   the trip asked is the one the fare is sold as (`priceForTrip`); an offer, whose trip is not recorded, keeps its price.

**Consequences.**

- The card and the destination it opens show one number when they price the same route (the member's own airport). A
  deal from another city (a Seattle member's San Francisco deal) is priced from that city and says so (`round trip ·
from San Francisco`); its destination is priced from home, as every destination is.
- Home reads one batch of stored answers per origin more, inside the same minute's memo: no question to the site.
- Offers lose `Save X%` until their maker records a source; offers have no trip either — both are open items for the
  owners (the CRM would need a source and a trip per offer).
- No migration, no new flag, no new event. Old apps keep working unchanged.

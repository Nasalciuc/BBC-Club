import type { FareVM } from "@bbc/shared/api/v1/fares";
import type { ProposalDetailVM } from "@bbc/shared/api/v1/proposals";

type Offer = Pick<ProposalDetailVM, "id" | "route" | "cabin" | "price" | "validUntil" | "flightFacts">;

const CLOCK = /^\d{2}:\d{2}$/;
const clock = (v: string | null | undefined) => (v && CLOCK.test(v) ? v : null);

/**
 * An offer as the fare page shows it (F067): the offer's own price pair and validity, its route and cabin — never a
 * catalogue fare's price. A catalogue fare on the same route and cabin (`routeFareFor`) may supply the flight facts the
 * offer does not state: all of them when it states none, else only the airline's code and logo, and only when it is
 * the same airline. Never the catalogue fare's day or trip: the offer is not that flight, and it is requested on the
 * member's dates. The cities by the names known, else their codes.
 */
export function offerFare(
  offer: Offer,
  routeFare: FareVM | null,
  cities: { from?: string | null; to?: string | null } = {},
): FareVM {
  const same =
    routeFare &&
    routeFare.from.code === offer.route.from &&
    routeFare.to.code === offer.route.to &&
    routeFare.cabin === offer.cabin
      ? routeFare
      : null;
  const facts = offer.flightFacts;
  const sameAirline = Boolean(facts?.carrier && same && same.carrier.name === facts.carrier);
  const carrier = facts?.carrier
    ? {
        name: facts.carrier,
        code: sameAirline && same ? same.carrier.code : null,
        logoUrl: sameAirline && same ? same.carrier.logoUrl : null,
      }
    : !facts && same
      ? same.carrier
      : // No airline known: the catalogue's own words for none, which the page never prints (knownCarrier).
        { code: null, name: "Unknown", logoUrl: null };
  const schedule = facts
    ? {
        nonstop: facts.nonstop,
        durationMinutes: facts.durationMinutes,
        product: facts.product ?? null,
        departLocal: clock(facts.departLocal),
        arriveLocal: clock(facts.arriveLocal),
        arriveDayOffset: 0,
      }
    : same
      ? {
          nonstop: same.nonstop,
          durationMinutes: same.durationMinutes,
          product: same.product,
          departLocal: same.departLocal,
          arriveLocal: same.arriveLocal,
          arriveDayOffset: same.arriveDayOffset,
        }
      : {
          nonstop: true,
          durationMinutes: null,
          product: null,
          departLocal: null,
          arriveLocal: null,
          arriveDayOffset: 0,
        };
  return {
    id: offer.id,
    carrier,
    from: { code: offer.route.from, city: cities.from ?? same?.from.city ?? offer.route.from },
    to: { code: offer.route.to, city: cities.to ?? same?.to.city ?? offer.route.to },
    cabin: offer.cabin,
    ...schedule,
    departAt: null,
    arriveAt: null,
    departDate: null,
    price: offer.price,
    trip: undefined,
    validUntil: offer.validUntil,
    hasOffer: true,
    offerId: offer.id,
  };
}

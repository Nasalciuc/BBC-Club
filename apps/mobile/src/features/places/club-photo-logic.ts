/**
 * Which of the design's cities an airport belongs to (ADR-IMPL-056) — pure, so it is tested without React Native.
 * Every airport of a city the design draws shows that city's photographs: Gatwick's London is Heathrow's London.
 */
export type ClubCity = "london" | "paris" | "tokyo" | "dubai" | "rome" | "new-york";

/** Where a photo is shown: the design gives some cities a different photograph in each of these places. */
export type PhotoContext =
  | "offer" // an offer card (02, 16, 08's other fares)
  | "search" // a popular destination (03)
  | "request" // a request's card (09, 28)
  | "received" // the request just sent (08: Tower Bridge)
  | "onboarding" // the home airport's card (01)
  | "any"; // everywhere else: heroes, trip cards, thumbnails

const CITY_OF: Record<string, ClubCity> = {
  LHR: "london",
  LGW: "london",
  LCY: "london",
  STN: "london",
  LTN: "london",
  SEN: "london",
  CDG: "paris",
  ORY: "paris",
  BVA: "paris",
  HND: "tokyo",
  NRT: "tokyo",
  DXB: "dubai",
  DWC: "dubai",
  FCO: "rome",
  CIA: "rome",
  JFK: "new-york",
  EWR: "new-york",
  LGA: "new-york",
};

export function clubCityOf(code: string | null | undefined): ClubCity | null {
  if (!code) return null;
  return CITY_OF[code.trim().toUpperCase()] ?? null;
}

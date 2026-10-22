import type { AirportVM } from "@bbc/shared/api/v1/fares";

/** Search's first title (03): `Popular from New York`. */
export function popularLabel(from: Pick<AirportVM, "city">): string {
  return `Popular from ${from.city}`;
}

/** 03 shows three popular destinations, never the origin itself — a city searched lately stays among them (03 lists
 *  London and Paris under both titles). */
export function popularRows(popular: readonly AirportVM[], from: Pick<AirportVM, "code"> | null, max = 3): AirportVM[] {
  return popular.filter((a) => a.code !== from?.code).slice(0, max);
}

/** The phone's IANA zone for GET /v1/airports/home-suggestion — null when the runtime has none to give. */
export function deviceTimeZone(resolve: () => string | undefined = defaultResolve): string | null {
  try {
    const tz = resolve();
    return tz && tz.includes("/") ? tz : null; // "UTC" or an abbreviation names no place
  } catch {
    return null;
  }
}

function defaultResolve(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** What is left of `Los Angeles International` without its city: generic words only, which name no airport. */
const GENERIC_ONLY = /^(?:(?:international|intl\.?|regional|municipal|airport|airfield)\s*)+$/i;

/**
 * `Heathrow Airport` (03, 18): the catalogue's name (`Heathrow`), called an airport where it does not say so already
 * (`John F Kennedy International`, `Leonardo da Vinci–Fiumicino Airport` stay as they are), without the city it sits
 * under (18: `London` over `City Airport`, not `London City Airport`) — unless only generic words would be left
 * (`Los Angeles International` stays whole, never a bare `International`).
 */
export function airportName(airport: Pick<AirportVM, "name"> & Partial<Pick<AirportVM, "city">>): string {
  const city = airport.city?.trim();
  const rest = city && airport.name.startsWith(`${city} `) ? airport.name.slice(city.length + 1).trim() : "";
  const name = rest && !GENERIC_ONLY.test(rest) ? rest : airport.name;
  return /airport|international|aeroport|aeropuerto|aeroporto|flughafen/i.test(name) ? name : `${name} Airport`;
}

/** `Heathrow Airport  ·  LHR` — the line under a city on Search (03). */
export function airportLine(airport: Pick<AirportVM, "name" | "code">): string {
  return `${airportName(airport)}  ·  ${airport.code}`;
}

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

/** A row Search lists: an airport, or a recent search of one. */
type Listed = Pick<AirportVM, "code"> | { airport: Pick<AirportVM, "code"> };
const codeOf = (row: Listed) => ("airport" in row ? row.airport.code : row.code);

/** The member's own airport is where the trip starts, never where it goes (F013): Search's airports and recent searches
 *  leave it out. Nothing is left out before the origin is known. */
export function withoutHome<T extends Listed>(rows: readonly T[], home: Pick<AirportVM, "code"> | null): T[] {
  return home ? rows.filter((row) => codeOf(row) !== home.code) : [...rows];
}

/** A destination's page opened on the member's own airport (a link, an older list): it says so instead of searching. */
export function isHomeAirport(code: string, home: Pick<AirportVM, "code"> | null): boolean {
  return home !== null && home.code === code;
}

export const HOME_AIRPORT_MESSAGE = { title: "That’s your home airport.", body: "Choose another city." } as const;

/** Where Search's GET /v1/home stands: still on its way, answered, or failed. */
export type HomeLoad = "loading" | "ok" | "failed";

/**
 * What stands under Search's field before typing (03): the popular cards once there are some; skeletons while Home is
 * on its way; Home's failure message with `Try again` once it failed (F011); `Type a city or an airport code.` when Home
 * answered without a popular destination and nothing was searched lately; else the recent searches alone.
 */
export function popularState(s: {
  popular: number;
  recent: number;
  load: HomeLoad;
}): "cards" | "skeleton" | "error" | "hint" | "none" {
  if (s.popular > 0) return "cards";
  if (s.load === "loading") return "skeleton";
  if (s.load === "failed") return "error";
  return s.recent === 0 ? "hint" : "none";
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

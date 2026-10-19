import type { AirportVM } from "@bbc/shared/api/v1/fares";

/** Search's first title (03): `Popular from New York`. */
export function popularLabel(from: Pick<AirportVM, "city">): string {
  return `Popular from ${from.city}`;
}

/** 03 shows three popular destinations, none that already sits under Recent searches, never the origin itself. */
export function popularRows(
  popular: readonly AirportVM[],
  recent: readonly Pick<AirportVM, "code">[],
  from: Pick<AirportVM, "code"> | null,
  max = 3,
): AirportVM[] {
  const taken = new Set(recent.map((a) => a.code));
  if (from) taken.add(from.code);
  return popular.filter((a) => !taken.has(a.code)).slice(0, max);
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

/**
 * `Heathrow Airport` (03, 18): the catalogue's name (`Heathrow`), called an airport where it does not say so already
 * (`John F Kennedy International`, `Leonardo da Vinci–Fiumicino Airport` stay as they are).
 */
export function airportName(airport: Pick<AirportVM, "name">): string {
  return /airport|international|aeroport|aeropuerto|aeroporto|flughafen/i.test(airport.name)
    ? airport.name
    : `${airport.name} Airport`;
}

/** `Heathrow Airport  ·  LHR` — the line under a city on Search (03). */
export function airportLine(airport: Pick<AirportVM, "name" | "code">): string {
  return `${airportName(airport)}  ·  ${airport.code}`;
}

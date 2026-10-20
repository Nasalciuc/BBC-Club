import type { Href } from "expo-router";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import type { RecentDates } from "./recent-search-logic";

type Params = Record<string, string | string[] | undefined>;

/** The destination's page (04) for an airport chosen on Search, with the dates it was last searched for. */
export function destinationHref(airport: AirportVM, dates: RecentDates | null): Href {
  const params: Record<string, string> = {
    code: airport.code,
    city: airport.city,
    name: airport.name,
    country: airport.countryCode,
    lat: String(airport.lat),
    lng: String(airport.lng),
  };
  if (dates?.depart) params.depart = dates.depart;
  if (dates?.return) params.ret = dates.return;
  return { pathname: "/destination/[code]", params } as unknown as Href;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The airport and dates back from the page's params; null when they do not name an airport (a link typed by hand). */
export function destinationFromParams(p: Params): { airport: AirportVM; dates: RecentDates | null } | null {
  const code = one(p.code)?.toUpperCase();
  const city = one(p.city);
  const lat = Number(one(p.lat));
  const lng = Number(one(p.lng));
  const country = one(p.country);
  if (!code || code.length !== 3 || !city || !country || country.length !== 2) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const depart = one(p.depart);
  const ret = one(p.ret);
  return {
    airport: { code, city, name: one(p.name) ?? city, countryCode: country, lat, lng },
    dates: depart && DAY.test(depart) ? { depart, return: ret && DAY.test(ret) ? ret : null } : null,
  };
}

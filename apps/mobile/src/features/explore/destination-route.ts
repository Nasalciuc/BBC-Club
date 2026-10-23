import type { Href } from "expo-router";
import type { AirportVM } from "@bbc/shared/api/v1/fares";

import { type RecentDates, upcomingDates } from "./recent-search-logic";

type Params = Record<string, string | string[] | undefined>;

/**
 * The destination's page (04) for an airport chosen on Search, with the dates it was last searched for — and the
 * search's origin, so the page never loads all of Home to learn where the member flies from (F104).
 */
export function destinationHref(airport: AirportVM, dates: RecentDates | null, origin: AirportVM | null = null): Href {
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
  if (origin) {
    params.from = origin.code;
    params.fromCity = origin.city;
    params.fromName = origin.name;
    params.fromCountry = origin.countryCode;
    params.fromLat = String(origin.lat);
    params.fromLng = String(origin.lng);
  }
  return { pathname: "/destination/[code]", params } as unknown as Href;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An airport from its params, or null when they do not name one. */
function airportFrom(v: {
  code?: string;
  city?: string;
  name?: string;
  country?: string;
  lat?: string;
  lng?: string;
}): AirportVM | null {
  const code = v.code?.toUpperCase();
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!code || code.length !== 3 || !v.city || !v.country || v.country.length !== 2) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { code, city: v.city, name: v.name ?? v.city, countryCode: v.country, lat, lng };
}

/**
 * The airport, dates and origin back from the page's params; null when they do not name an airport (a link typed by
 * hand). Dates whose departure has passed are dropped: the destination opens with flexible dates (F006). No origin
 * (a link, an older list): null, and the page finds it from the profile.
 */
export function destinationFromParams(
  p: Params,
  today?: string,
): { airport: AirportVM; dates: RecentDates | null; origin: AirportVM | null } | null {
  const airport = airportFrom({
    code: one(p.code),
    city: one(p.city),
    name: one(p.name),
    country: one(p.country),
    lat: one(p.lat),
    lng: one(p.lng),
  });
  if (!airport) return null;
  const depart = one(p.depart);
  const ret = one(p.ret);
  return {
    airport,
    dates:
      depart && DAY.test(depart) ? upcomingDates({ depart, return: ret && DAY.test(ret) ? ret : null }, today) : null,
    origin: airportFrom({
      code: one(p.from),
      city: one(p.fromCity),
      name: one(p.fromName),
      country: one(p.fromCountry),
      lat: one(p.fromLat),
      lng: one(p.fromLng),
    }),
  };
}

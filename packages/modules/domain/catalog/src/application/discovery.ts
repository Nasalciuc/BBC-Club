/**
 * Discovery (ADR-IMPL-039): "Popular from <city>" and the home airport suggested at onboarding. The rules were approved
 * on 7 Oct 2026: the last 7 days, at least 5 searches on a route, at most 4 destinations, names only; below that, the
 * club's busiest hubs.
 */
import type { Executor } from "@bbc/db";

import { airportsRepo } from "../infrastructure/airports.repo";
import { discoveryRepo } from "../infrastructure/discovery.repo";
import { SAME_METRO_KM, distanceKm } from "../pricing/estimate";
import type { AirportRow } from "./to-fare-vm";

export const POPULAR = { days: 7, minSearches: 5, max: 4 } as const;

const at = (a: AirportRow) => ({ lat: Number(a.lat), lng: Number(a.lng) });

/**
 * The destinations to show from `origin`: the routes members searched enough (already in order), then the hubs — never
 * the origin, never an airport of the same metro (under 100 km: JFK is not "popular from" Newark), each once, at most 4.
 */
export function pickPopular(
  origin: AirportRow,
  searched: readonly AirportRow[],
  hubs: readonly AirportRow[],
): { destinations: AirportRow[]; fromSearches: number } {
  const destinations: AirportRow[] = [];
  const take = (a: AirportRow) => {
    if (destinations.length >= POPULAR.max) return;
    if (a.code === origin.code || destinations.some((d) => d.code === a.code)) return;
    if (distanceKm(at(origin), at(a)) < SAME_METRO_KM) return;
    destinations.push(a);
  };
  for (const a of searched) take(a);
  const fromSearches = destinations.length;
  for (const a of hubs) take(a);
  return { destinations, fromSearches };
}

/** Three queries: the searched routes, their airports, the hubs. Twelve candidates each leave room for exclusions. */
export async function popularFrom(exec: Executor, origin: AirportRow, now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - POPULAR.days));
  const codes = await discoveryRepo.searchedFrom(exec, origin.code, since, POPULAR.minSearches, 12);
  const known = codes.length > 0 ? await airportsRepo.getMany(exec, codes) : [];
  const byCode = new Map(known.map((a) => [a.code, a]));
  const searched = codes.flatMap((code) => byCode.get(code) ?? []);
  return pickPopular(origin, searched, await discoveryRepo.hubs(exec, 12));
}

/**
 * Names a phone may report that the airport data spells differently, mapped to the data's (current IANA) name. Android
 * reports the ICU name ("Asia/Calcutta" where the data says "Asia/Kolkata"); a phone with old time zone data reports a
 * name IANA has since retired ("America/Yellowknife") or a country-level one ("GB", "Canada/Eastern", "Japan"). Only
 * the same place renamed or merged, or a country's own legacy name — never a link to another country that merely
 * shares the clock ("America/Marigot" is not Trinidad).
 */
export const ZONE_ALIASES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Montreal": "America/Toronto",
  "America/Nipigon": "America/Toronto",
  "America/Pangnirtung": "America/Iqaluit",
  "America/Rainy_River": "America/Winnipeg",
  "America/Santa_Isabel": "America/Tijuana",
  "America/Thunder_Bay": "America/Toronto",
  "America/Yellowknife": "America/Edmonton",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Istanbul": "Europe/Istanbul",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Macao": "Asia/Macau",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Australia/ACT": "Australia/Sydney",
  "Australia/Canberra": "Australia/Sydney",
  "Australia/Currie": "Australia/Hobart",
  "Australia/LHI": "Australia/Lord_Howe",
  "Australia/NSW": "Australia/Sydney",
  "Australia/North": "Australia/Darwin",
  "Australia/Queensland": "Australia/Brisbane",
  "Australia/South": "Australia/Adelaide",
  "Australia/Tasmania": "Australia/Hobart",
  "Australia/Victoria": "Australia/Melbourne",
  "Australia/West": "Australia/Perth",
  "Australia/Yancowinna": "Australia/Broken_Hill",
  "Brazil/Acre": "America/Rio_Branco",
  "Brazil/DeNoronha": "America/Noronha",
  "Brazil/East": "America/Sao_Paulo",
  "Brazil/West": "America/Manaus",
  "Canada/Atlantic": "America/Halifax",
  "Canada/Central": "America/Winnipeg",
  "Canada/Eastern": "America/Toronto",
  "Canada/Mountain": "America/Edmonton",
  "Canada/Newfoundland": "America/St_Johns",
  "Canada/Pacific": "America/Vancouver",
  "Canada/Saskatchewan": "America/Regina",
  "Canada/Yukon": "America/Whitehorse",
  "Chile/Continental": "America/Santiago",
  "Chile/EasterIsland": "Pacific/Easter",
  Cuba: "America/Havana",
  Egypt: "Africa/Cairo",
  Eire: "Europe/Dublin",
  "Europe/Kiev": "Europe/Kyiv",
  GB: "Europe/London",
  "GB-Eire": "Europe/London",
  Hongkong: "Asia/Hong_Kong",
  Iceland: "Atlantic/Reykjavik",
  Iran: "Asia/Tehran",
  Israel: "Asia/Jerusalem",
  Jamaica: "America/Jamaica",
  Japan: "Asia/Tokyo",
  Kwajalein: "Pacific/Kwajalein",
  Libya: "Africa/Tripoli",
  "Mexico/BajaNorte": "America/Tijuana",
  "Mexico/BajaSur": "America/Mazatlan",
  "Mexico/General": "America/Mexico_City",
  NZ: "Pacific/Auckland",
  "NZ-CHAT": "Pacific/Chatham",
  Navajo: "America/Denver",
  PRC: "Asia/Shanghai",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  Poland: "Europe/Warsaw",
  Portugal: "Europe/Lisbon",
  ROC: "Asia/Taipei",
  ROK: "Asia/Seoul",
  Singapore: "Asia/Singapore",
  Turkey: "Europe/Istanbul",
  "US/Alaska": "America/Anchorage",
  "US/Aleutian": "America/Adak",
  "US/Arizona": "America/Phoenix",
  "US/Central": "America/Chicago",
  "US/East-Indiana": "America/Indiana/Indianapolis",
  "US/Eastern": "America/New_York",
  "US/Hawaii": "Pacific/Honolulu",
  "US/Michigan": "America/Detroit",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Samoa": "Pacific/Pago_Pago",
  "W-SU": "Europe/Moscow",
};

/** UTC and fixed offsets are valid zones but not places — and "UTC" is the column's default, not a city. */
const NOT_A_PLACE = /^(?:UTC|UCT|GMT|Universal|Zulu|Etc\/.*|[+-]\d{2}(?::?\d{2})?)$/i;

/** The zone names to look up for what the phone reported: as this runtime spells it, and its current name; none for
 *  UTC or an offset. null when it is not a time zone at all. */
export function homeZones(tz: string): string[] | null {
  if (!tz || tz.length > 64) return null;
  let spelled: string;
  try {
    spelled = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
  if (NOT_A_PLACE.test(spelled)) return [];
  return [...new Set([spelled, ZONE_ALIASES[spelled] ?? spelled])];
}

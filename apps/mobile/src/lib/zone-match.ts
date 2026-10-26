/**
 * Whether an airport is in the phone's time zone (ADR-IMPL-039, ADR-IMPL-072): onboarding's search lists those first
 * (`suggested from your time zone`, 14). The phone and the club's airport data do not always spell a zone alike.
 */

/**
 * Names a phone may report that the airport data spells by the current IANA name: Android reports ICU's
 * (`Asia/Saigon` where the data says `Asia/Ho_Chi_Minh`, `Asia/Calcutta` for `Asia/Kolkata`); a phone with old zone
 * data reports a retired or a country-level name (`America/Yellowknife`, `Canada/Eastern`, `Japan`). The catalogue's
 * own table (`ZONE_ALIASES`, packages/modules/domain/catalog/src/application/discovery.ts), which the server applies to
 * the home suggestion; `zone-match.test.ts` keeps the two equal. Only the same place renamed or merged, or a
 * country's own legacy name — never another country that merely shares the clock.
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

/** A zone by its current IANA name: `Asia/Saigon` → `Asia/Ho_Chi_Minh`; a current name as it is. */
export function currentZone(zone: string): string {
  return ZONE_ALIASES[zone] ?? zone;
}

/** Two names of one zone: `Asia/Saigon` and `Asia/Ho_Chi_Minh` are the same place. */
export function sameZone(a: string, b: string): boolean {
  return currentZone(a) === currentZone(b);
}

/**
 * A city's name as a zone's city compares with it: no accents, no punctuation, lower case, and no `city` at its end —
 * `Ho Chi Minh City` and the zone's `Ho_Chi_Minh` are both `ho chi minh`, `St. John's` and `St_Johns` both `st johns`,
 * `Guatemala City` and `Guatemala` both `guatemala`.
 */
export function cityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[.'’()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ city$/, "");
}

/** The city a zone is named after, by its current name, as `cityKey` spells a city: `Asia/Saigon` → `ho chi minh`. */
export function zoneCityKey(zone: string): string {
  const current = currentZone(zone);
  return cityKey(current.slice(current.lastIndexOf("/") + 1));
}

/**
 * Whether an airport is in the phone's zone: by the airport's own zone where the catalogue gives one, under either of
 * its names (a phone in `Asia/Saigon` is in SGN's `Asia/Ho_Chi_Minh`); by its city where it gives none (an older
 * server, or a zone this runtime cannot format) — SGN's `Ho Chi Minh City` is the city `Asia/Ho_Chi_Minh` is named
 * after. Where the airport has a zone, its zone alone decides: a city of the same name elsewhere never comes near.
 */
export function inZone(airport: { tz?: string; city: string }, zone: string): boolean {
  if (airport.tz) return sameZone(airport.tz, zone);
  const city = zoneCityKey(zone);
  return city.length > 0 && cityKey(airport.city) === city;
}

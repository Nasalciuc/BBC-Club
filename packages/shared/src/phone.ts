import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type ParsedPhone = { valid: true; e164: string } | { valid: false; e164: null };

/** Same rule as the app (`lib/phone.ts`): default region US; E.164 when valid. */
export function parseMemberPhone(raw: string, defaultCountry: CountryCode = "US"): ParsedPhone {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return { valid: false, e164: null };
  return { valid: true, e164: parsed.format("E.164") };
}

export function isMemberPhone(raw: string): boolean {
  return parseMemberPhone(raw).valid;
}

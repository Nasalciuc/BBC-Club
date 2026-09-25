import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type ParsedPhone = { valid: true; e164: string } | { valid: false; e164: null };

/** Canonical E.164 parse for member phones. Mobile `validatePhone` delegates here. */
export function parseMemberPhone(raw: string, defaultCountry: CountryCode = "US"): ParsedPhone {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return { valid: false, e164: null };
  return { valid: true, e164: parsed.format("E.164") };
}

export function isMemberPhone(raw: string): boolean {
  return parseMemberPhone(raw).valid;
}

import { parseMemberPhone, type ParsedPhone } from "@bbc/shared/phone";
import { getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type { CountryCode };
export type PhoneResult = { valid: true; e164: string } | { valid: false; e164: null; error: string };

/** Club calling-code list — frequent routes, not every ISO country. */
export const CLUB_PHONE_COUNTRIES: readonly CountryCode[] = [
  "US",
  "CA",
  "GB",
  "AE",
  "DE",
  "FR",
  "CH",
  "IT",
  "ES",
  "NL",
  "AT",
  "RO",
  "MD",
  "SG",
  "JP",
  "AU",
] as const;

export function callingCodeLabel(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

/** Map device locale (Intl) → club country. No expo-localization. */
export function defaultPhoneCountry(locale = Intl.DateTimeFormat().resolvedOptions().locale): CountryCode {
  const tag = locale.replace("_", "-");
  const lower = tag.toLowerCase();
  if (lower === "ro-md" || lower.endsWith("-md")) return "MD";
  if (lower.startsWith("ro")) return "RO";
  if (lower.startsWith("en-gb") || lower === "en-uk") return "GB";
  if (lower.startsWith("en-ca") || lower.startsWith("fr-ca")) return "CA";
  if (lower.startsWith("de")) return "DE";
  if (lower.startsWith("fr")) return "FR";
  if (lower.startsWith("it")) return "IT";
  if (lower.startsWith("es")) return "ES";
  if (lower.startsWith("nl")) return "NL";
  if (lower.startsWith("ja")) return "JP";
  if (lower.startsWith("en-au")) return "AU";
  if (lower.includes("ae") || lower.startsWith("ar-ae")) return "AE";
  if (lower.startsWith("en-sg") || lower.startsWith("zh-sg")) return "SG";
  if (lower.startsWith("de-ch") || lower.startsWith("fr-ch") || lower.startsWith("it-ch")) return "CH";
  if (lower.startsWith("de-at")) return "AT";
  const region = tag.split("-")[1]?.toUpperCase();
  if (region && (CLUB_PHONE_COUNTRIES as readonly string[]).includes(region)) {
    return region as CountryCode;
  }
  return "US";
}

/** Split a stored E.164 (or national) value for the prefix UI. */
export function splitStoredPhone(
  stored: string | null | undefined,
  fallbackCountry: CountryCode = defaultPhoneCountry(),
): { country: CountryCode; national: string } {
  const raw = stored?.trim() ?? "";
  if (!raw) return { country: fallbackCountry, national: "" };
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.country && parsed.isValid()) {
    const country = (CLUB_PHONE_COUNTRIES as readonly string[]).includes(parsed.country)
      ? (parsed.country as CountryCode)
      : fallbackCountry;
    return { country, national: parsed.nationalNumber };
  }
  return { country: fallbackCountry, national: raw };
}

/** The invalid-number line, as each Figma frame writes it: the request sheet (135:852) and Edit · Phone (325:8525). */
export const PHONE_INVALID_COPY = {
  request: "Enter a complete phone number, including country code.",
  profile: "Enter a valid phone number, including the country code.",
} as const;

/** Validate on submit — never while the member is still typing. If raw starts with +, country is ignored. */
export function validatePhone(
  raw: string,
  defaultCountry: CountryCode = "US",
  where: keyof typeof PHONE_INVALID_COPY = "request",
): PhoneResult {
  const trimmed = raw.trim();
  if (trimmed.length < 7 && !trimmed.startsWith("+")) {
    return { valid: false, e164: null, error: "Enter a phone number so we can call you." };
  }
  if (trimmed.startsWith("+") && trimmed.length < 8) {
    return { valid: false, e164: null, error: "Enter a phone number so we can call you." };
  }
  const result: ParsedPhone = parseMemberPhone(trimmed, defaultCountry);
  if (!result.valid) {
    return { valid: false, e164: null, error: PHONE_INVALID_COPY[where] };
  }
  return { valid: true, e164: result.e164 };
}

/**
 * A stored number as a person reads it (Figma 233:4245: `+1 (212) 555-0148`): North American numbers in their national
 * shape after `+1`, the rest in international form. A number that does not parse is shown as it was stored.
 */
export function displayPhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed?.isValid()) return trimmed;
  return parsed.countryCallingCode === "1" ? `+1 ${parsed.formatNational()}` : parsed.formatInternational();
}

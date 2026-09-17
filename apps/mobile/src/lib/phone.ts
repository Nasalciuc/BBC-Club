import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneResult = { valid: true; e164: string } | { valid: false; e164: null; error: string };

/** Validate on submit — never while the member is still typing. Default region US. */
export function validatePhone(raw: string, defaultCountry: "US" | "GB" | "CA" = "US"): PhoneResult {
  const trimmed = raw.trim();
  if (trimmed.length < 7) {
    return { valid: false, e164: null, error: "Enter a phone number so we can call you." };
  }
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    return { valid: false, e164: null, error: "That phone number doesn't look right." };
  }
  return { valid: true, e164: parsed.format("E.164") };
}

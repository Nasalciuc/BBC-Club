/**
 * The club's general line, as every call in the app dials it (brief 3.5): `EXPO_PUBLIC_SUPPORT_PHONE`, in E.164. The
 * company's phone system hands the call to a free agent; the app has no telephony of its own. Pure, so the rules
 * are tested without React Native: `support-phone.ts` reads the variable once (from `lib/env.ts`) and dials.
 */

/** The `tel:` link for the configured number — `+` and its digits — or null when it is unset, not one number in
 *  E.164 (one leading `+`; spaces, brackets, dots and dashes between the digits are let pass), or not 8 to 15 digits
 *  long. The value is read before its formatting goes, so an extension (written out, or as a last group in brackets:
 *  `(22)`), a second `+` or a national `(0)` never joins the digits dialled; a North American number (`+1`) is 11 digits, so digits added after it are refused too. What a
 *  copied number carries unseen — a no-break space, a typographic dash, a direction mark — counts as its plain form.
 *  Null means no call button anywhere, and no words that ask the member to call (`canCall` false) but Join's
 *  (`otp-send-logic.ts`: the entry stays as it is, ADR-IMPL-047); a production or staging build or update refuses a
 *  number that gives null (`app.config.ts`), so a set number is never hidden in silence. */
export function telHref(phone: string | undefined): string | null {
  const raw = (phone ?? "")
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .trim();
  if (!/^\+[\d ().-]+$/.test(raw) || /\(\s*0\s*\)/.test(raw) || /\)[\s.-]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("1") && digits.length !== 11) return null;
  return digits.length >= 8 && digits.length <= 15 ? `tel:+${digits}` : null;
}

/** The words a call button carries: the screen's own (12 `Call us`, 11 `Call your agent`, the system pages'
 *  `Call an agent`). They come with the call, so a screen cannot draw them without one. */
export type CallLabel = "Call us" | "Call your agent" | "Call an agent";

/** A call button: its testID, its words and its press. A screen draws the button only from one of these. */
export type ClubCall = { testID: string; label: CallLabel; onPress: () => void };

/** The call button `testID` dials, or null when the club has no number: the screen then draws no button and no words.
 *  The press opens `tel` — the configured number's link, the only one there is — and nothing else. */
export function callFor(
  tel: string | null,
  testID: string,
  label: CallLabel,
  open: (url: string) => void,
): ClubCall | null {
  return tel ? { testID, label, onPress: () => open(tel) } : null;
}

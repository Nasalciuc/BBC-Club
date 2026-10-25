/**
 * The club's general line, as every call in the app dials it (brief 3.5): `EXPO_PUBLIC_SUPPORT_PHONE`, in E.164. The
 * company's phone system hands the call to a free specialist; the app has no telephony of its own. Pure, so the rules
 * are tested without React Native: `support-phone.ts` reads the variable once (from `lib/env.ts`) and dials.
 */

/** The `tel:` link for the configured number — its digits and `+` — or null when it is unset or too short to dial.
 *  Null means no call button anywhere, and no words that ask the member to call (`canCall` false). */
export function telHref(phone: string | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, "") ?? "";
  return digits.length >= 8 ? `tel:${digits}` : null;
}

/** The words a call button carries: the screen's own (12 `Call us`, 11 `Call your specialist`, the system pages'
 *  `Call a specialist`). They come with the call, so a screen cannot draw them without one. */
export type CallLabel = "Call us" | "Call your specialist" | "Call a specialist";

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

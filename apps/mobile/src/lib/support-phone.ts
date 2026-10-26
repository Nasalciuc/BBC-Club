import { Linking } from "react-native";

import { env } from "./env";
import { callFor, telHref, type CallLabel, type ClubCall } from "./support-phone-logic";

/** The club's general line as a `tel:` link, or null when the build has none. The only read of
 *  EXPO_PUBLIC_SUPPORT_PHONE outside `lib/env.ts`; screens dial it only through `clubCall` (support-phone.test.ts). */
const SUPPORT_TEL: string | null = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);

/** Whether the app may say "call": a button, or words that point at one, only when there is a number to dial. Every
 *  copy helper that can ask for a call is handed this, never a literal (support-phone.test.ts). */
export const CAN_CALL = SUPPORT_TEL !== null;

/** A call button that dials the club's general line, with its words — or null without one: the screen then draws no
 *  button and no words. */
export function clubCall(testID: string, label: CallLabel): ClubCall | null {
  return callFor(SUPPORT_TEL, testID, label, (url) => {
    // The dialer that does not open (a tablet without one) leaves the page as it is.
    Linking.openURL(url).catch(() => undefined);
  });
}

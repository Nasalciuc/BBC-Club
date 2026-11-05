/**
 * The company's travel guides (the site's blog), opened from Explore under the offers — the owner's choice of 4 Nov
 * 2026: the site's own page in the app's browser (Safari's or Chrome's sheet, `expo-web-browser`). No image draws the
 * link: proposed until design does.
 *
 * `app=1` turns on the site's app mode for that browser session (the site's PR #22, 5 Nov 2026): no $100 popup, no
 * WhatsApp, live chat or newsletter, and its quote forms replaced by a line sending the member back to `Request a quote`
 * in the app or to the club's number; it stays on from guide to guide. The utm pair names the app in the site's
 * analytics; nothing about the member is in the address.
 */
export const GUIDES_URL = "https://buybusinessclass.com/blog?app=1&utm_source=bbcclub_app&utm_medium=app";

/**
 * Opens the guides in the app's browser; where it cannot open (no browser to show the sheet), the phone's own browser
 * opens them. Only a failure of both is the caller's.
 */
export async function openGuides(
  inApp: (url: string) => Promise<unknown>,
  outside: (url: string) => Promise<unknown>,
): Promise<void> {
  try {
    await inApp(GUIDES_URL);
  } catch {
    await outside(GUIDES_URL);
  }
}

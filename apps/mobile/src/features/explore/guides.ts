/**
 * The company's travel guides (the site's blog), opened from Explore under the offers — the owner's choice of 4 Nov
 * 2026: the site's own page in the app's browser (Safari's or Chrome's sheet, `expo-web-browser`), as the site shows
 * it, its own banners included. No image draws the link: proposed until design does.
 */
export const GUIDES_URL = "https://buybusinessclass.com/blog";

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

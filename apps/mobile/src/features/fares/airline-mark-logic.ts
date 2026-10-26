/**
 * Which airlines the design draws a mark for (04; ADR-IMPL-056) and the size it draws each at — pure, so it is tested
 * without React Native. The crops come from an image 852 px wide drawn at 393 pt: 2.1679 px a point.
 */
export type MarkKey = "BA" | "VS" | "AA";

const PX_PER_PT = 852 / 393;

/** Each mark's crop in pixels (`assets/locked/airlines/`), and so its size in points. */
export const MARK_PIXELS: Record<MarkKey, { width: number; height: number }> = {
  BA: { width: 177 / PX_PER_PT, height: 62 / PX_PER_PT },
  VS: { width: 162 / PX_PER_PT, height: 100 / PX_PER_PT },
  AA: { width: 172 / PX_PER_PT, height: 83 / PX_PER_PT },
};

/** Where 04 centres each mark against the column's middle (54.6, 27.6 from the card's corner), in points. */
export const MARK_NUDGE: Record<MarkKey, { x: number; y: number }> = {
  BA: { x: -1.05, y: -2.2 },
  VS: { x: 1, y: 1.25 },
  AA: { x: 0.1, y: 0.8 },
};

/** The mark for an airline's two-letter code, or null where the design draws none. */
export function airlineMarkKey(code: string | null | undefined): MarkKey | null {
  const c = code?.trim().toUpperCase();
  return c === "BA" || c === "VS" || c === "AA" ? c : null;
}

/**
 * 05: the British Airways speedmarque alone, over the airline's name — the window of its crop that holds only the ribbon
 * (the wordmark under it left out): 37.8 in, 6 down, 39.7 × 10.4 of the crop's 81.65 × 28.6.
 */
export const RIBBON_WINDOW: Partial<Record<MarkKey, { left: number; top: number; width: number; height: number }>> = {
  BA: { left: 82 / PX_PER_PT, top: 13 / PX_PER_PT, width: 86 / PX_PER_PT, height: 22.5 / PX_PER_PT },
};

/**
 * The fifty further airlines the design package carries a logo for (#76, `assets/airlines-expanded`), by IATA code:
 * each its own colours, never recoloured. British Airways, Virgin Atlantic and American keep the crops above.
 */
export const LOGO_SLUGS: Readonly<Record<string, string>> = {
  A3: "aegean-airlines", // Aegean Airlines
  AC: "air-canada", // Air Canada
  AF: "air-france", // Air France
  AI: "air-india", // Air India
  AM: "aeromexico", // Aeroméxico
  AR: "aerolineas-argentinas", // Aerolíneas Argentinas
  AS: "alaska-airlines", // Alaska Airlines
  AT: "royal-air-maroc", // Royal Air Maroc
  AV: "avianca", // avianca
  AY: "finnair", // Finnair
  B6: "jetblue-airways", // JetBlue Airways
  BT: "airbaltic", // airBaltic
  CM: "copa-airlines", // Copa Airlines
  CX: "cathay-pacific", // Cathay Pacific
  EI: "aer-lingus", // Aer Lingus
  EK: "emirates", // Emirates
  ET: "ethiopian-airlines", // Ethiopian Airlines
  EY: "etihad-airways", // Etihad Airways
  FI: "icelandair", // Icelandair
  GA: "garuda-indonesia", // Garuda Indonesia
  IB: "iberia", // Iberia
  J2: "azerbaijan-airlines", // Azerbaijan Airlines
  JL: "japan-airlines", // Japan Airlines
  JU: "air-serbia", // Air Serbia
  KE: "korean-air", // Korean Air
  KL: "klm", // KLM
  KQ: "kenya-airways", // Kenya Airways
  KU: "kuwait-airways", // Kuwait Airways
  LA: "latam-airlines", // LATAM Airlines
  LH: "lufthansa", // Lufthansa
  LO: "lot-polish-airlines", // LOT Polish Airlines
  LX: "swiss", // SWISS
  MH: "malaysia-airlines", // Malaysia Airlines
  MK: "air-mauritius", // Air Mauritius
  NH: "all-nippon-airways", // All Nippon Airways
  NZ: "air-new-zealand", // Air New Zealand
  OZ: "asiana-airlines", // Asiana Airlines
  PG: "bangkok-airways", // Bangkok Airways
  PR: "philippine-airlines", // Philippine Airlines
  QR: "qatar-airways", // Qatar Airways
  RX: "riyadh-air", // Riyadh Air
  SK: "scandinavian-airlines", // Scandinavian Airlines
  SN: "brussels-airlines", // Brussels Airlines
  SQ: "singapore-airlines", // Singapore Airlines
  TK: "turkish-airlines", // Turkish Airlines
  TP: "tap-air-portugal", // TAP Air Portugal
  TS: "air-transat", // Air Transat
  UA: "united-airlines", // United Airlines
  UX: "air-europa", // Air Europa
  WY: "oman-air", // Oman Air
};

/** The package's logo for an airline's code, or null where it has none. */
export function airlineLogoSlug(code: string | null | undefined): string | null {
  const c = code?.trim().toUpperCase();
  return c ? (LOGO_SLUGS[c] ?? null) : null;
}

/**
 * A package logo's box — 320 × 96 px, the artwork fitted inside 288 × 64 — drawn in the British Airways mark's box (04),
 * so another airline stands as large as the ones the images draw.
 */
export const LOGO_BOX = { width: MARK_PIXELS.BA.width, height: MARK_PIXELS.BA.height } as const;

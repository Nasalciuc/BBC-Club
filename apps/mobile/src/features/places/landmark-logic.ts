/**
 * Which landmarks of a destination the app shows, and the credit each one owes (ADR-IMPL-064): up to three, best first
 * as the server ranks them, each with its name and its licence; fewer when fewer exist; none — nothing at all; never the
 * photograph the screen already shows as the city's (amendment 1). Pure: no React, no network.
 */
import {
  PLACE_LANDMARKS_MAX,
  PlaceLandmarksVM,
  type LandmarkCreditVM,
  type LandmarkVM,
} from "@bbc/shared/api/v1/places";

import { creditFor, remote, type Credit, type Picture, type PictureSource } from "./place-photo-logic";

/**
 * The answer's landmarks, read leniently: a landmark this app cannot read (a field added later, an address that is not
 * https) is dropped by the contract, never the list; a body that is not the contract's shape at all (a later server,
 * another code) is null — the app shows nothing.
 */
export function readLandmarks(raw: unknown, code: string): LandmarkVM[] | null {
  const parsed = PlaceLandmarksVM.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.code !== code.trim().toUpperCase()) return null;
  return parsed.data.landmarks;
}

const COMMONS = "Wikimedia Commons";
const AFTER_AUTHOR = ` · ${COMMONS}`;

/**
 * The credit line under a landmark, as the city photo's reads (`creditFor`): `Photo: Jane Doe · CC BY-SA 4.0 ·
 * Wikimedia Commons`, or `Photo: CC0 · Wikimedia Commons` when the licence needs no author — the server's `text` is
 * "<author> · Wikimedia Commons" or "Wikimedia Commons" alone. Another `text` (a later server's) is printed as it came,
 * the licence after it. Linked to the photograph's own page on Commons, as the city photo's credit is (ADR-IMPL-043);
 * to the licence's page from a server that sends no page; else only read. Null when the credit says nothing — no one
 * to credit or no licence: such a photograph is not shown.
 */
export function landmarkCredit(credit: LandmarkCreditVM): Credit | null {
  const text = credit.text.trim();
  const licence = credit.licence.trim();
  if (text.length === 0 || licence.length === 0) return null;
  const link = credit.pageUrl ?? credit.licenceUrl ?? null;
  if (text === COMMONS) return creditFor({ source: "wikimedia", author: null, license: licence, link });
  if (text.endsWith(AFTER_AUTHOR)) {
    const author = text.slice(0, -AFTER_AUTHOR.length).trim();
    if (author.length > 0) return creditFor({ source: "wikimedia", author, license: licence, link });
  }
  return {
    label: `Photo: ${text} · ${licence}`,
    spoken: ["Photo", ...text.split(" · "), licence].join(", "),
    link,
  };
}

/**
 * The address of the photograph a screen draws, as it hands it to `Photo` — a remote one's `uri` — or null: a bundled
 * image (the design's own photograph of the city) or nothing drawn. A landmark that stands in for the city's photo
 * (ADR-IMPL-064, amendment 1) comes back from the server with its own address as the city photo's `hero`, and a screen
 * draws that `hero` as it came (`bandPicture`): this is what `landmarksToShow` compares with.
 */
export function photoAddress(source: PictureSource | null | undefined): string | null {
  return source !== null && typeof source === "object" ? source.uri : null;
}

/** The photograph over the destination's page (04), the credit it owes, how it is kept, and what its landmarks skip. */
export type DestinationPhoto = {
  source: PictureSource | null;
  credit: Credit | null;
  /** The design's bundled photograph is kept in memory and on disk; the server's as its photo band says. */
  cache: "memory-disk" | Picture["cache"];
  /** `photoAddress(source)`: the address its landmarks leave out (`Landmarks` reads it from 04's `photo`). */
  cityPhoto: string | null;
};

/**
 * 04's photograph: the design's own of the city where it has one (`clubPhoto`, ADR-IMPL-056) — bundled, no credit, no
 * address, so no landmark is left out — else the server's (`bandPicture`) with the address it draws: the city's own
 * photo's, a stand-in landmark's own (ADR-IMPL-064, amendment 1) — the only one a landmark can share — or the
 * satellite view's Mapbox address, which none has; none when nothing is drawn. One choice for the photograph drawn and
 * the one its landmarks leave out, so the page never shows a photograph twice nor hides a landmark whose photograph is
 * not over it.
 */
export function destinationPhoto(bundled: number | null, band: Picture): DestinationPhoto {
  if (bundled !== null) return { source: bundled, credit: null, cache: "memory-disk", cityPhoto: null };
  return { ...band, cityPhoto: photoAddress(band.source) };
}

/** What else a screen shows beside its landmarks. */
export type LandmarkContext = {
  /** The photographs that would not load, by address. */
  failed?: ReadonlySet<string>;
  /** The address of the city's photograph the screen draws above them (`photoAddress`); null when it draws none. */
  cityPhoto?: string | null;
};

/**
 * The landmarks to show, in the server's order (best first): at most three; a landmark without a name, without a credit
 * it can print, showing a photograph already shown — the city's own photograph on the same screen among them: a
 * landmark standing in for it (ADR-IMPL-064, amendment 1) — or whose photograph would not load (`failed`, by address) is
 * left out before the three are counted, so the next one the server sent takes its place; never invented.
 */
export function landmarksToShow(landmarks: readonly LandmarkVM[], ctx: LandmarkContext = {}): LandmarkVM[] {
  const shown: LandmarkVM[] = [];
  const failed = ctx.failed ?? new Set<string>();
  const images = new Set<string>(ctx.cityPhoto ? [ctx.cityPhoto] : []);
  for (const landmark of landmarks) {
    if (shown.length === PLACE_LANDMARKS_MAX) break;
    const name = landmark.name.trim();
    if (name.length === 0 || images.has(landmark.imageUrl) || failed.has(landmark.imageUrl)) continue;
    if (!landmarkCredit(landmark.credit)) continue;
    images.add(landmark.imageUrl);
    shown.push({ ...landmark, name });
  }
  return shown;
}

/**
 * The band of shapes a landmark's photograph is shown in: ADR-IMPL-064's landscape band, 1.2 to 2.4 wide for 1 high. A
 * photograph outside it (a later server's portrait) fills the nearest shape, cropped, rather than a strip of odd widths.
 */
export const LANDMARK_SHAPE = { min: 1.2, max: 2.4 } as const;

/** A landmark's photograph as wide as its own shape makes it at this height (to a tenth of a point). */
export function landmarkPhotoWidth(size: { width: number; height: number }, photoHeight: number): number {
  const ratio = size.width / size.height;
  const shape = Number.isFinite(ratio) && ratio > 0 ? ratio : LANDMARK_SHAPE.min;
  const clamped = Math.min(LANDMARK_SHAPE.max, Math.max(LANDMARK_SHAPE.min, shape));
  return Math.round(photoHeight * clamped * 10) / 10;
}

/** One landmark as the screen draws it: its place in the row (1, 2, 3), its photograph and its credit. */
export type LandmarkTile = {
  rank: number;
  imageUrl: string;
  name: string;
  /** What a screen reader says for the photograph and its name. */
  spoken: string;
  source: PictureSource;
  photoWidth: number;
  credit: Credit;
};

/**
 * The tiles a destination draws: every one has its name and its credit (the floor ADR-IMPL-064 sets: every shown photo
 * has its credit), Wikimedia's headers on its photograph, numbered in the order shown; never the city photograph the
 * screen already draws (`cityPhoto`).
 */
export function landmarkTiles(
  landmarks: readonly LandmarkVM[],
  ctx: LandmarkContext & { headers: Record<string, string>; photoHeight: number },
): LandmarkTile[] {
  return landmarksToShow(landmarks, ctx).flatMap((landmark, i) => {
    const credit = landmarkCredit(landmark.credit);
    if (!credit) return [];
    return [
      {
        rank: i + 1,
        imageUrl: landmark.imageUrl,
        name: landmark.name,
        spoken: `${landmark.name}, photo`,
        source: remote(landmark.imageUrl, ctx.headers),
        photoWidth: landmarkPhotoWidth(landmark, ctx.photoHeight),
        credit,
      },
    ];
  });
}

/** Whether two answers show the same landmarks (a 200 that changed nothing leaves the screen alone). */
export function sameLandmarks(a: readonly LandmarkVM[], b: readonly LandmarkVM[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

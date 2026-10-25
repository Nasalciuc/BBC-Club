import { z } from "zod";

/** An https address: the app loads nothing over plain http. */
const HttpsUrl = z.string().max(2048).url().startsWith("https://");
const Iata = z.string().regex(/^[A-Z]{3}$/);

/**
 * Who took a place photo and under which licence (ADR-IMPL-043): the credit the app prints in small type with the photo,
 * linked to the photo's own page. `club` is a photo an operator chose; it may name no author, licence or page.
 */
export const PhotoCreditVM = z.object({
  source: z.enum(["wikimedia", "pexels", "club"]),
  author: z.string().min(1).nullable(),
  license: z.string().min(1).nullable(),
  link: HttpsUrl.nullable(),
});
export type PhotoCreditVM = z.infer<typeof PhotoCreditVM>;

/**
 * The picture for the city an airport serves (ADR-IMPL-043): a photograph hosted elsewhere, in a card's width and a
 * full-width one, with its credit (null: the club's own photo, nothing to credit); the point the app centres a
 * satellite view on (it draws the image from Mapbox and credits it); or nothing yet — the app shows its own image.
 */
export const PlacePhotoVM = z.discriminatedUnion("kind", [
  z.object({
    code: Iata,
    kind: z.literal("photo"),
    card: HttpsUrl,
    hero: HttpsUrl,
    credit: PhotoCreditVM.nullable(),
  }),
  z.object({
    code: Iata,
    kind: z.literal("satellite"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  z.object({ code: Iata, kind: z.literal("none") }),
]);
export type PlacePhotoVM = z.infer<typeof PlacePhotoVM>;

/**
 * GET /v1/places/photos?codes=LHR,CDG — one item per known airport asked about; an unknown code is left out. An item
 * this app cannot read (a kind added later, an address that is not https) is dropped, never the whole answer: the app
 * shows its own image for that city.
 */
export const PlacePhotosVM = z.object({
  items: z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const parsed = PlacePhotoVM.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});
export type PlacePhotosVM = z.output<typeof PlacePhotosVM>;

/** At most this many codes in one question. */
export const PLACE_PHOTOS_MAX_CODES = 20;

/**
 * Who took a landmark's photograph and under which licence (ADR-IMPL-064): `text` names who to credit as the app prints
 * it ("Jane Doe · Wikimedia Commons"), `licence` its short name ("CC BY-SA 4.0") and `licenceUrl` its page when Commons
 * gives one; `pageUrl` is the photograph's own page on Commons (its author, source and licence), which the credit links
 * to as the city photo's does (ADR-IMPL-043) — a server before it sent none.
 */
export const LandmarkCreditVM = z.object({
  text: z.string().min(1),
  licence: z.string().min(1),
  licenceUrl: HttpsUrl.optional(),
  pageUrl: HttpsUrl.optional(),
});
export type LandmarkCreditVM = z.infer<typeof LandmarkCreditVM>;

/** A landmark of a destination (ADR-IMPL-064): its name and its photograph — an address on Wikimedia, its size. */
export const LandmarkVM = z.object({
  name: z.string().min(1),
  imageUrl: HttpsUrl,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  credit: LandmarkCreditVM,
});
export type LandmarkVM = z.infer<typeof LandmarkVM>;

/** At most this many landmarks a place. */
export const PLACE_LANDMARKS_MAX = 3;

/**
 * GET /v1/places/:code/landmarks — up to three landmarks of the city the airport serves, best first; none until the
 * club has looked, or where it found none: fewer than three is what exists, never invented. A landmark this app cannot
 * read is dropped, never the whole answer.
 */
export const PlaceLandmarksVM = z.object({
  code: Iata,
  landmarks: z.array(z.unknown()).transform((items) =>
    items
      .flatMap((item) => {
        const parsed = LandmarkVM.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, PLACE_LANDMARKS_MAX),
  ),
});
export type PlaceLandmarksVM = z.output<typeof PlaceLandmarksVM>;

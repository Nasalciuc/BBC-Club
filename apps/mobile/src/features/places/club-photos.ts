import airportLounge from "@/assets/images/club/photos/airport-lounge.webp";
import businessSeat from "@/assets/images/club/photos/business-class-seat.webp";
import dubaiOffer from "@/assets/images/club/photos/dubai-offer.webp";
import dubaiRequest from "@/assets/images/club/photos/dubai-request.webp";
import dubai from "@/assets/images/club/photos/dubai.webp";
import londonRequest from "@/assets/images/club/photos/london-request.webp";
import londonSearch from "@/assets/images/club/photos/london-search.webp";
import london from "@/assets/images/club/photos/london.webp";
import loungeThumb from "@/assets/images/club/photos/lounge-thumb.webp";
import newYorkOnboarding from "@/assets/images/club/photos/new-york-onboarding.webp";
import newYork from "@/assets/images/club/photos/new-york.webp";
import parisOffer from "@/assets/images/club/photos/paris-offer.webp";
import parisRequest from "@/assets/images/club/photos/paris-request.webp";
import parisSearch from "@/assets/images/club/photos/paris-search.webp";
import paris from "@/assets/images/club/photos/paris.webp";
import rome from "@/assets/images/club/photos/rome.webp";
import seatThumb from "@/assets/images/club/photos/seat-thumb.webp";
import tokyoOffer from "@/assets/images/club/photos/tokyo-offer.webp";
import tokyoRequest from "@/assets/images/club/photos/tokyo-request.webp";
import tokyoSearch from "@/assets/images/club/photos/tokyo-search.webp";
import tokyo from "@/assets/images/club/photos/tokyo.webp";
import towerBridgeReceived from "@/assets/images/club/photos/tower-bridge-received.webp";

import { clubCityOf, type ClubCity, type PhotoContext } from "./club-photo-logic";

/** A bundled image: the number `require` gives (Photo's `PhotoSource`). */
type Bundled = number;

/**
 * The design's own photographs (isolated/bbc-club-3.0-design/final/assets/, copied unscaled as WebP into
 * assets/images/club; ADR-IMPL-056): each city it draws has the photo of each place it appears — Tokyo at dusk on a
 * request card, Mount Fuji on an offer — and the screens use exactly that one. A city the design does not draw has
 * none here and takes the server's place photo (ADR-IMPL-043).
 */
const PHOTOS: Record<ClubCity, Partial<Record<PhotoContext, Bundled>> & { any: Bundled }> = {
  london: { any: london, search: londonSearch, request: londonRequest, received: towerBridgeReceived },
  paris: { any: paris, offer: parisOffer, search: parisSearch, request: parisRequest },
  tokyo: { any: tokyo, offer: tokyoOffer, search: tokyoSearch, request: tokyoRequest },
  dubai: { any: dubai, offer: dubaiOffer, request: dubaiRequest },
  rome: { any: rome },
  "new-york": { any: newYork, onboarding: newYorkOnboarding },
};

/** The design's photo of this airport's city in this place of the app, or null when the design has none. */
export function clubPhoto(code: string | null | undefined, context: PhotoContext): Bundled | null {
  const city = clubCityOf(code);
  if (!city) return null;
  const set = PHOTOS[city];
  return set[context] ?? set.any;
}

/** The fare's photographs after the city's (05): the business-class seat and the lounge, as the carousel shows them;
 *  the small cuts for its thumbnails. */
export const CABIN_PHOTOS = {
  seat: { full: businessSeat, thumb: seatThumb },
  lounge: { full: airportLounge, thumb: loungeThumb },
} as const;

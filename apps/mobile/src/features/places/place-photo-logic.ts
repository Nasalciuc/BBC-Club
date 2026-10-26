/**
 * Which picture a card, a fare's photo band and Profile show, and the credit each one owes (ADR-IMPL-043). Four tiers:
 * the offer's own picture; the city's photograph (Wikimedia Commons, Pexels, or the club's own); for a photo band, the
 * satellite view the app draws from Mapbox; the club's own image. Pure: no React, no network.
 */
import type { PhotoCreditVM, PlacePhotoVM } from "@bbc/shared/api/v1/places";

/** Same shape as `PhotoSource` in @bbc/ui: a remote photograph with its headers, or a bundled image. */
export type PictureSource = { uri: string; headers?: Record<string, string> } | number;

/** A credit line, what a screen reader says for it, and the page it opens (none: the line is only read). */
export type Credit = { label: string; spoken: string; link: string | null };

export type Picture = {
  /** null — show the club's own image. */
  source: PictureSource | null;
  credit: Credit | null;
  /** A satellite view is not kept on disk: Mapbox's terms. */
  cache: "disk" | "memory";
};

const NONE: Picture = { source: null, credit: null, cache: "disk" };

/**
 * Wikimedia refuses an anonymous client — the default User-Agent of Android's image loader gets 403 — and asks each one
 * to say who it is and where to reach it. The same words the server uses, with the app's version.
 */
export function wikimediaHeaders(appVersion: string, apiUrl: string): Record<string, string> {
  return { "User-Agent": `BBCClub/${appVersion} (${apiUrl}; app)` };
}

function isWikimedia(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "wikimedia.org" || host.endsWith(".wikimedia.org");
  } catch {
    return false;
  }
}

/** A remote picture, with Wikimedia's headers when it comes from there. */
export function remote(url: string, headers: Record<string, string>): PictureSource {
  return isWikimedia(url) ? { uri: url, headers } : { uri: url };
}

/** Mapbox Static Images: one side at most 1280 pt; zoom 11 holds a city centre (about 12 km across a phone). */
export const SATELLITE_ZOOM = 11;
const MAX_SIDE = 1280;

/**
 * The satellite view centred on a point, drawn at twice the size for the screen's density. Mapbox's own words are left
 * off the image (`attribution=false`, `logo=false`): the app writes them beside it — `SATELLITE_CREDIT` — as the API
 * requires when they are off.
 */
export function satelliteUrl(at: { lat: number; lng: number }, size: { width: number; height: number }, token: string) {
  const side = (n: number) => Math.min(MAX_SIDE, Math.max(1, Math.round(n)));
  const path = `${at.lng.toFixed(5)},${at.lat.toFixed(5)},${SATELLITE_ZOOM},0/${side(size.width)}x${side(size.height)}@2x`;
  const query = new URLSearchParams({ access_token: token, attribution: "false", logo: "false" });
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${path}?${query.toString()}`;
}

export const SATELLITE_CREDIT: Credit = {
  label: "Imagery © Mapbox © OpenStreetMap © Maxar",
  spoken: "Satellite imagery: Mapbox, OpenStreetMap, Maxar",
  link: "https://www.mapbox.com/about/maps/",
};

const SITE: Record<PhotoCreditVM["source"], string | null> = {
  wikimedia: "Wikimedia Commons",
  pexels: "Pexels",
  club: null,
};

/**
 * The credit line: `Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons`, `Photo: Ana Pop · Pexels`, `Photo: Ion Pop`
 * (the club's own photo, as the operator credited it). Null when there is nothing to say.
 */
export function creditFor(credit: PhotoCreditVM | null): Credit | null {
  if (!credit) return null;
  const text = (p: string | null) => (p && p.trim().length > 0 ? p.trim() : null);
  const author = text(credit.author);
  const rest = [credit.source === "pexels" ? null : text(credit.license), SITE[credit.source]].filter(
    (p): p is string => p !== null,
  );
  if (!author && rest.length === 0) return null;
  return {
    label: `Photo: ${[...(author ? [author] : []), ...rest].join(" · ")}`,
    spoken: [author ? `Photo by ${author}` : "Photo", ...rest].join(", "),
    link: credit.link,
  };
}

/** A card: the offer's own picture, else the city's photograph — a card never shows a satellite view — else null. */
export function cardPicture(
  mediaUrl: string | null | undefined,
  photo: PlacePhotoVM | undefined,
  headers: Record<string, string>,
): PictureSource | null {
  if (mediaUrl) return { uri: mediaUrl };
  if (photo?.kind === "photo") return remote(photo.card, headers);
  return null;
}

/**
 * A photo band (a fare's, Profile's): the offer's own picture (it carries no credit of ours), else the city's photograph
 * at full width with its credit, else its satellite view with Mapbox's, else null — the club's own image.
 */
export function bandPicture(
  mediaUrl: string | null | undefined,
  photo: PlacePhotoVM | undefined,
  ctx: { headers: Record<string, string>; mapboxToken: string | undefined; size: { width: number; height: number } },
): Picture {
  if (mediaUrl) return { source: { uri: mediaUrl }, credit: null, cache: "disk" };
  if (photo?.kind === "photo")
    return { source: remote(photo.hero, ctx.headers), credit: creditFor(photo.credit), cache: "disk" };
  if (photo?.kind === "satellite" && ctx.mapboxToken) {
    return {
      source: { uri: satelliteUrl(photo, ctx.size, ctx.mapboxToken) },
      credit: SATELLITE_CREDIT,
      cache: "memory",
    };
  }
  return NONE;
}

import { describe, expect, it } from "bun:test";
import type { PlacePhotoVM } from "@bbc/shared/api/v1/places";

import {
  SATELLITE_CREDIT,
  bandPicture,
  cardPicture,
  creditFor,
  remote,
  satelliteUrl,
  wikimediaHeaders,
} from "./place-photo-logic";

const HEADERS = wikimediaHeaders("1.4.0", "https://api.example.test");
const COMMONS_CARD = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/London.jpg/500px-London.jpg";
const COMMONS_HERO = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/London.jpg/1280px-London.jpg";

const photo: PlacePhotoVM = {
  code: "LHR",
  kind: "photo",
  card: COMMONS_CARD,
  hero: COMMONS_HERO,
  credit: {
    source: "wikimedia",
    author: "Jane Doe",
    license: "CC BY-SA 4.0",
    link: "https://commons.wikimedia.org/wiki/File:London.jpg",
  },
};
const satellite: PlacePhotoVM = { code: "RMO", kind: "satellite", lat: 47.010453, lng: 28.86381 };
const none: PlacePhotoVM = { code: "ZRH", kind: "none" };
const ctx = { headers: HEADERS, mapboxToken: "pk.test", size: { width: 393, height: 340 } };

describe("pictures", () => {
  it("names the app to Wikimedia, and only to Wikimedia", () => {
    expect(HEADERS).toEqual({ "User-Agent": "BBCClub/1.4.0 (https://api.example.test; app)" });
    expect(remote(COMMONS_CARD, HEADERS)).toEqual({ uri: COMMONS_CARD, headers: HEADERS });
    expect(remote("https://thumb.wikimedia.org/x.jpg", HEADERS)).toMatchObject({ headers: HEADERS });
    expect(remote("https://images.pexels.com/photos/1/a.jpeg", HEADERS)).toEqual({
      uri: "https://images.pexels.com/photos/1/a.jpeg",
    });
    expect(remote("https://wikimedia.org.evil.test/x.jpg", HEADERS)).toEqual({
      uri: "https://wikimedia.org.evil.test/x.jpg",
    });
    expect(remote("not a url", HEADERS)).toEqual({ uri: "not a url" });
  });

  it("a card: the offer's picture, else the city's photo, never a satellite view", () => {
    expect(cardPicture("https://cdn.example.test/offer.webp", photo, HEADERS)).toEqual({
      uri: "https://cdn.example.test/offer.webp",
    });
    expect(cardPicture(undefined, photo, HEADERS)).toEqual({ uri: COMMONS_CARD, headers: HEADERS });
    expect(cardPicture(null, satellite, HEADERS)).toBeNull();
    expect(cardPicture(null, none, HEADERS)).toBeNull();
    expect(cardPicture(null, undefined, HEADERS)).toBeNull();
  });

  it("a band: the offer's picture uncredited, the photo at full width with its credit, the satellite view, nothing", () => {
    expect(bandPicture("https://cdn.example.test/offer.webp", photo, ctx)).toEqual({
      source: { uri: "https://cdn.example.test/offer.webp" },
      credit: null,
      cache: "disk",
    });
    expect(bandPicture(null, photo, ctx)).toEqual({
      source: { uri: COMMONS_HERO, headers: HEADERS },
      credit: {
        label: "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
        spoken: "Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons",
        link: "https://commons.wikimedia.org/wiki/File:London.jpg",
      },
      cache: "disk",
    });
    const sat = bandPicture(null, satellite, ctx);
    expect(sat.credit).toEqual(SATELLITE_CREDIT);
    expect(sat.cache).toBe("memory"); // Mapbox's imagery is not kept on disk
    expect(sat.source).toEqual({
      uri: "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/28.86381,47.01045,11,0/393x340@2x?access_token=pk.test&attribution=false&logo=false",
    });
    expect(bandPicture(null, satellite, { ...ctx, mapboxToken: undefined })).toEqual({
      source: null,
      credit: null,
      cache: "disk",
    });
    expect(bandPicture(null, none, ctx).source).toBeNull();
    expect(bandPicture(undefined, undefined, ctx).source).toBeNull();
  });

  it("asks Mapbox for sizes it serves: whole points, 1 to 1280 a side", () => {
    expect(satelliteUrl({ lat: 0, lng: 0 }, { width: 2000.4, height: 0 }, "pk.x")).toContain("/1280x1@2x?");
    expect(satelliteUrl({ lat: -33.8688, lng: 151.2093 }, { width: 344.6, height: 304 }, "pk.x")).toContain(
      "/151.20930,-33.86880,11,0/345x304@2x?",
    );
  });
});

describe("credits", () => {
  it("names the author, the licence and where the photo lives", () => {
    expect(creditFor(photo.kind === "photo" ? photo.credit : null)?.label).toBe(
      "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
    );
    expect(
      creditFor({ source: "wikimedia", author: null, license: "CC0", link: "https://commons.wikimedia.org/x" }),
    ).toEqual({
      label: "Photo: CC0 · Wikimedia Commons",
      spoken: "Photo, CC0, Wikimedia Commons",
      link: "https://commons.wikimedia.org/x",
    });
    const pexels = creditFor({
      source: "pexels",
      author: "Ana Pop",
      license: "Pexels License",
      link: "https://www.pexels.com/photo/4/",
    });
    expect(pexels).toEqual({
      label: "Photo: Ana Pop · Pexels",
      spoken: "Photo by Ana Pop, Pexels",
      link: "https://www.pexels.com/photo/4/",
    });
  });

  it("the club's own photo says what the operator gave, or nothing", () => {
    expect(creditFor({ source: "club", author: "Ion Pop", license: null, link: null })).toEqual({
      label: "Photo: Ion Pop",
      spoken: "Photo by Ion Pop",
      link: null,
    });
    expect(creditFor({ source: "club", author: null, license: null, link: "https://x.test" })).toBeNull();
    expect(creditFor({ source: "club", author: " ", license: null, link: null })).toBeNull();
    expect(creditFor(null)).toBeNull();
  });
});

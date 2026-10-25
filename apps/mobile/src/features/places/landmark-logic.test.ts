import { describe, expect, it } from "bun:test";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import {
  LANDMARK_SHAPE,
  landmarkCredit,
  landmarkPhotoWidth,
  landmarkTiles,
  landmarksToShow,
  photoAddress,
  readLandmarks,
  sameLandmarks,
} from "./landmark-logic";
import { bandPicture, creditFor, wikimediaHeaders } from "./place-photo-logic";

// Made-up files, authors and sizes; the landmarks' names are the places' own.
const HEADERS = wikimediaHeaders("1.4.0", "https://api.example.test");
const thumb = (file: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/1280px-${file}`;
const LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0";
const page = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

function landmark(name: string, file: string, over: Partial<LandmarkVM> = {}): LandmarkVM {
  return {
    name,
    imageUrl: thumb(file),
    width: 1280,
    height: 853,
    credit: {
      text: "Jane Doe · Wikimedia Commons",
      licence: "CC BY-SA 4.0",
      licenceUrl: LICENCE_URL,
      pageUrl: page(file),
    },
    ...over,
  };
}

const tower = landmark("Eiffel Tower", "Tower.jpg");
const louvre = landmark("Louvre", "Louvre.jpg", {
  width: 1280,
  height: 640,
  credit: { text: "Wikimedia Commons", licence: "CC0" },
});
const orsay = landmark("Musée d'Orsay", "Orsay.jpg", { width: 1280, height: 1000 });
const sacre = landmark("Sacré-Cœur", "Sacre.jpg");

describe("readLandmarks — what an app reads of the answer", () => {
  it("reads the server's answer, best first, for the code it asked about", () => {
    expect(readLandmarks({ code: "CDG", landmarks: [tower, louvre] }, "cdg")).toEqual([tower, louvre]);
    expect(readLandmarks({ code: "CDG", landmarks: [] }, "CDG")).toEqual([]);
  });

  it("drops a landmark it cannot read, never the list; ignores fields added later; keeps three", () => {
    const http = { ...orsay, imageUrl: "http://upload.wikimedia.org/x.jpg" };
    const noCredit = { name: "Arc de Triomphe", imageUrl: thumb("Arc.jpg"), width: 1280, height: 800 };
    const later = { ...tower, rank: 1, focus: { x: 0.4 } };
    expect(readLandmarks({ code: "CDG", landmarks: [http, later, noCredit, "x", null, louvre] }, "CDG")).toEqual([
      tower,
      louvre,
    ]);
    expect(readLandmarks({ code: "CDG", landmarks: [tower, louvre, orsay, sacre] }, "CDG")).toEqual([
      tower,
      louvre,
      orsay,
    ]);
  });

  it("drops a landmark whose credit would open anything but an https page (the credit's link), never the list", () => {
    const linked = (over: { pageUrl?: string; licenceUrl?: string }) => ({
      ...tower,
      credit: { ...tower.credit, ...over },
    });
    const landmarks = [
      linked({ pageUrl: "http://commons.wikimedia.org/wiki/File:Tower.jpg" }),
      linked({ pageUrl: "javascript:alert(1)" }),
      linked({ pageUrl: "intent://commons.wikimedia.org#Intent;end" }),
      linked({ licenceUrl: "http://creativecommons.org/licenses/by-sa/4.0" }),
      louvre,
      orsay,
    ];
    expect(readLandmarks({ code: "CDG", landmarks }, "CDG")).toEqual([louvre, orsay]);
  });

  it("a body that is not the contract's shape, or another city's, shows nothing", () => {
    expect(readLandmarks(null, "CDG")).toBeNull();
    expect(readLandmarks("<html>", "CDG")).toBeNull();
    expect(readLandmarks({ code: "CDG" }, "CDG")).toBeNull();
    expect(readLandmarks({ code: "CDG", landmarks: { first: tower } }, "CDG")).toBeNull();
    expect(readLandmarks({ code: "LHR", landmarks: [tower] }, "CDG")).toBeNull();
  });
});

describe("landmarkCredit — the line under each photograph", () => {
  it("reads as the city photo's credit, linked to the photograph's own page on Commons", () => {
    expect(landmarkCredit(tower.credit)).toEqual({
      label: "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
      spoken: "Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons",
      link: page("Tower.jpg"),
    });
    expect(landmarkCredit(tower.credit)).toEqual(
      creditFor({ source: "wikimedia", author: "Jane Doe", license: "CC BY-SA 4.0", link: page("Tower.jpg") }),
    );
  });

  it("a server that sends no page: the licence's page; neither — a line only read", () => {
    expect(landmarkCredit({ ...tower.credit, pageUrl: undefined })?.link).toBe(LICENCE_URL);
    expect(landmarkCredit(louvre.credit)).toEqual({
      label: "Photo: CC0 · Wikimedia Commons",
      spoken: "Photo, CC0, Wikimedia Commons",
      link: null,
    });
  });

  it("a licence that needs no author: Commons and the licence, linked to the page", () => {
    expect(landmarkCredit({ ...louvre.credit, pageUrl: page("Louvre.jpg") })).toEqual({
      label: "Photo: CC0 · Wikimedia Commons",
      spoken: "Photo, CC0, Wikimedia Commons",
      link: page("Louvre.jpg"),
    });
  });

  it("another line (a later server's) is printed as it came, the licence after it", () => {
    expect(landmarkCredit({ text: "A. Photographer · Example Archive", licence: "CC BY 4.0" })).toEqual({
      label: "Photo: A. Photographer · Example Archive · CC BY 4.0",
      spoken: "Photo, A. Photographer, Example Archive, CC BY 4.0",
      link: null,
    });
  });

  it("a credit that names no one or no licence is none", () => {
    expect(landmarkCredit({ text: " ", licence: "CC BY-SA 4.0" })).toBeNull();
    expect(landmarkCredit({ text: "Jane Doe · Wikimedia Commons", licence: "  " })).toBeNull();
  });
});

describe("landmarksToShow — up to three, what exists, never invented", () => {
  it("keeps the server's order and at most three", () => {
    expect(landmarksToShow([tower, louvre, orsay, sacre]).map((l) => l.name)).toEqual([
      "Eiffel Tower",
      "Louvre",
      "Musée d'Orsay",
    ]);
  });

  it("fewer than three: what exists; none: nothing", () => {
    expect(landmarksToShow([louvre]).map((l) => l.name)).toEqual(["Louvre"]);
    expect(landmarksToShow([])).toEqual([]);
  });

  it("leaves out a nameless landmark, one without a credit, a photograph shown twice and one that would not load", () => {
    const nameless = { ...sacre, name: "  " };
    const uncredited = { ...orsay, credit: { text: " ", licence: "CC0" } };
    const twice = { ...louvre, name: "Louvre Pyramid" };
    expect(landmarksToShow([nameless, tower, uncredited, louvre, twice]).map((l) => l.name)).toEqual([
      "Eiffel Tower",
      "Louvre",
    ]);
    expect(landmarksToShow([tower, louvre, orsay], { failed: new Set([louvre.imageUrl]) }).map((l) => l.name)).toEqual([
      "Eiffel Tower",
      "Musée d'Orsay",
    ]);
  });

  it("trims a name", () => {
    expect(landmarksToShow([{ ...tower, name: "  Eiffel Tower " }])[0]?.name).toBe("Eiffel Tower");
  });
});

describe("the city's photograph is a landmark standing in for it (ADR-IMPL-064, amendment 1)", () => {
  // As the server answers a city on its satellite view: its first landmark's 1280-px thumbnail as `hero`, the same file
  // at 500 px as `card`, the photograph's own credit (made-up file and author).
  const standIn = {
    code: "CDG",
    kind: "photo",
    card: tower.imageUrl.replace("/1280px-", "/500px-"),
    hero: tower.imageUrl,
    credit: { source: "wikimedia", author: "Jane Doe", license: "CC BY-SA 4.0", link: page("Tower.jpg") },
  } as const;
  const band = (photo: Parameters<typeof bandPicture>[1]) =>
    bandPicture(undefined, photo, { headers: HEADERS, mapboxToken: "pk.test", size: { width: 393, height: 190 } });

  it("the address a screen draws: a remote photograph's, as the photo band hands it over; none for a bundled one", () => {
    expect(photoAddress(band(standIn).source)).toBe(tower.imageUrl);
    expect(photoAddress({ uri: "https://example.test/a.jpg" })).toBe("https://example.test/a.jpg");
    expect(photoAddress(7)).toBeNull(); // the design's own photograph, bundled
    expect(photoAddress(null)).toBeNull();
    expect(photoAddress(undefined)).toBeNull();
    expect(photoAddress(band({ code: "CDG", kind: "none" }).source)).toBeNull();
  });

  it("leaves that landmark out, before the three are counted: the next one the server sent takes its place", () => {
    const cityPhoto = photoAddress(band(standIn).source);
    expect(landmarksToShow([tower, louvre, orsay], { cityPhoto }).map((l) => l.name)).toEqual([
      "Louvre",
      "Musée d'Orsay",
    ]);
    // A fourth (a later server's) comes up into the third place; the contract keeps three today (PLACE_LANDMARKS_MAX).
    expect(landmarksToShow([tower, louvre, orsay, sacre], { cityPhoto }).map((l) => l.name)).toEqual([
      "Louvre",
      "Musée d'Orsay",
      "Sacré-Cœur",
    ]);
    // Wherever it stands in the list (a phone that has the city photo from before a skip, the list from after).
    expect(landmarksToShow([louvre, orsay, tower], { cityPhoto }).map((l) => l.name)).toEqual([
      "Louvre",
      "Musée d'Orsay",
    ]);
  });

  it("the floor holds: its only landmark left out is nothing at all; the others keep their credits, renumbered", () => {
    const cityPhoto = tower.imageUrl;
    expect(landmarksToShow([tower], { cityPhoto })).toEqual([]);
    expect(landmarkTiles([tower], { headers: HEADERS, photoHeight: 118, cityPhoto })).toEqual([]);
    const tiles = landmarkTiles([tower, louvre, orsay], {
      headers: HEADERS,
      photoHeight: 118,
      cityPhoto,
      failed: new Set([orsay.imageUrl]),
    });
    expect(tiles.map((t) => [t.rank, t.name, t.credit.label])).toEqual([
      [1, "Louvre", "Photo: CC0 · Wikimedia Commons"],
    ]);
  });

  it("a city photo that is no landmark's — its own, the design's, the satellite view, none — leaves the list whole", () => {
    const own = { ...standIn, card: thumb("Paris.jpg").replace("/1280px-", "/500px-"), hero: thumb("Paris.jpg") };
    const satellite = { code: "CDG", kind: "satellite", lat: 48.85, lng: 2.35 } as const;
    for (const cityPhoto of [
      photoAddress(band(own).source),
      photoAddress(7),
      photoAddress(band(satellite).source),
      null,
      undefined,
    ]) {
      expect(landmarksToShow([tower, louvre, orsay], { cityPhoto }).map((l) => l.name)).toEqual([
        "Eiffel Tower",
        "Louvre",
        "Musée d'Orsay",
      ]);
    }
    // The 500-px card is not what the band draws, and no landmark is shown at it.
    expect(landmarksToShow([tower], { cityPhoto: standIn.card })).toEqual([tower]);
  });
});

describe("landmarkPhotoWidth — as wide as the photograph's own shape", () => {
  it("keeps the shape inside ADR-IMPL-064's landscape band", () => {
    expect(landmarkPhotoWidth({ width: 1280, height: 853 }, 118)).toBe(177.1);
    expect(landmarkPhotoWidth({ width: 1280, height: 640 }, 118)).toBe(236);
  });

  it("a shape outside the band fills the nearest one, cropped", () => {
    expect(landmarkPhotoWidth({ width: 3000, height: 1000 }, 118)).toBe(118 * LANDMARK_SHAPE.max);
    expect(landmarkPhotoWidth({ width: 853, height: 1280 }, 118)).toBe(118 * LANDMARK_SHAPE.min);
    expect(landmarkPhotoWidth({ width: 0, height: 0 }, 118)).toBe(118 * LANDMARK_SHAPE.min);
  });
});

describe("landmarkTiles — what the destination draws", () => {
  it("numbers the tiles as shown, says each one's name, sends Wikimedia's headers", () => {
    const tiles = landmarkTiles([{ ...sacre, name: "" }, tower, louvre], { headers: HEADERS, photoHeight: 118 });
    expect(tiles.map((t) => [t.rank, t.name, t.spoken])).toEqual([
      [1, "Eiffel Tower", "Eiffel Tower, photo"],
      [2, "Louvre", "Louvre, photo"],
    ]);
    expect(tiles[0]?.source).toEqual({ uri: tower.imageUrl, headers: HEADERS });
    expect(tiles[1]?.photoWidth).toBe(236);
    expect(tiles[1]?.credit.link).toBeNull();
  });

  it("the floor: every landmark drawn has its name and its credit, with its licence; never the city's photograph", () => {
    const credits = [
      {
        text: "Jane Doe · Wikimedia Commons",
        licence: "CC BY-SA 4.0",
        licenceUrl: LICENCE_URL,
        pageUrl: page("A.jpg"),
      },
      { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0", licenceUrl: LICENCE_URL },
      { text: "Wikimedia Commons", licence: "Public domain" },
      { text: "A. Photographer · Example Archive", licence: "CC BY 4.0" },
      { text: " ", licence: "CC BY-SA 3.0" },
      { text: "Jane Doe · Wikimedia Commons", licence: " " },
    ];
    const names = ["Eiffel Tower", " ", "Louvre", "Musée d'Orsay"];
    const sizes = [
      { width: 1280, height: 853 },
      { width: 853, height: 1280 },
      { width: 4000, height: 1000 },
    ];
    let drawn = 0;
    for (let n = 0; n <= 5; n++) {
      for (let seed = 0; seed < credits.length * names.length * sizes.length; seed++) {
        const list = Array.from({ length: n }, (_, i) =>
          landmark(names[(seed + i) % names.length]!, `File-${(seed * 7 + i) % 9}.jpg`, {
            ...sizes[(seed + 2 * i) % sizes.length]!,
            credit: credits[(seed + 3 * i) % credits.length]!,
          }),
        );
        // No city photograph, or one of the landmarks' standing in for it (amendment 1).
        for (const cityPhoto of [null, list[seed % Math.max(1, n)]?.imageUrl ?? null]) {
          const tiles = landmarkTiles(list, { headers: HEADERS, photoHeight: 118, cityPhoto });
          expect(tiles.length).toBeLessThanOrEqual(Math.min(3, n));
          tiles.forEach((tile, i) => {
            const source = list.find((l) => l.imageUrl === tile.imageUrl)!;
            expect(tile.rank).toBe(i + 1);
            expect(tile.imageUrl).not.toBe(cityPhoto);
            expect(tile.name.length).toBeGreaterThan(0);
            expect(tile.spoken).toBe(`${tile.name}, photo`);
            // A credit that names someone (or Commons) and a licence: never a blank one.
            expect(source.credit.text.trim().length).toBeGreaterThan(0);
            expect(source.credit.licence.trim().length).toBeGreaterThan(0);
            expect(tile.credit.label.startsWith("Photo: ")).toBe(true);
            expect(tile.credit.label).toContain(source.credit.licence.trim());
            expect(tile.credit.spoken.length).toBeGreaterThan(0);
            expect(tile.credit.link).toBe(source.credit.pageUrl ?? source.credit.licenceUrl ?? null);
          });
          drawn += tiles.length;
        }
      }
    }
    expect(drawn).toBeGreaterThan(100);
  });
});

describe("sameLandmarks", () => {
  it("compares what the screen shows", () => {
    expect(sameLandmarks([tower], [{ ...tower }])).toBe(true);
    expect(sameLandmarks([tower], [tower, louvre])).toBe(false);
    expect(sameLandmarks([], [])).toBe(true);
  });
});

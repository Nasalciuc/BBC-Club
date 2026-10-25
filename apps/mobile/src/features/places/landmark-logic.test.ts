import { describe, expect, it } from "bun:test";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import {
  LANDMARK_SHAPE,
  landmarkCredit,
  landmarkPhotoWidth,
  landmarkTiles,
  landmarksToShow,
  readLandmarks,
  sameLandmarks,
} from "./landmark-logic";
import { creditFor, wikimediaHeaders } from "./place-photo-logic";

// Made-up files, authors and sizes; the landmarks' names are the places' own.
const HEADERS = wikimediaHeaders("1.4.0", "https://api.example.test");
const thumb = (file: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/1280px-${file}`;
const LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0";

function landmark(name: string, file: string, over: Partial<LandmarkVM> = {}): LandmarkVM {
  return {
    name,
    imageUrl: thumb(file),
    width: 1280,
    height: 853,
    credit: { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0", licenceUrl: LICENCE_URL },
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

  it("a body that is not the contract's shape, or another city's, shows nothing", () => {
    expect(readLandmarks(null, "CDG")).toBeNull();
    expect(readLandmarks("<html>", "CDG")).toBeNull();
    expect(readLandmarks({ code: "CDG" }, "CDG")).toBeNull();
    expect(readLandmarks({ code: "CDG", landmarks: { first: tower } }, "CDG")).toBeNull();
    expect(readLandmarks({ code: "LHR", landmarks: [tower] }, "CDG")).toBeNull();
  });
});

describe("landmarkCredit — the line under each photograph", () => {
  it("reads as the city photo's credit, linked to the licence", () => {
    expect(landmarkCredit(tower.credit)).toEqual({
      label: "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
      spoken: "Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons",
      link: LICENCE_URL,
    });
    expect(landmarkCredit(tower.credit)).toEqual(
      creditFor({ source: "wikimedia", author: "Jane Doe", license: "CC BY-SA 4.0", link: LICENCE_URL }),
    );
  });

  it("a licence that needs no author: Commons and the licence; no licence page — a line only read", () => {
    expect(landmarkCredit(louvre.credit)).toEqual({
      label: "Photo: CC0 · Wikimedia Commons",
      spoken: "Photo, CC0, Wikimedia Commons",
      link: null,
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
    expect(landmarksToShow([tower, louvre, orsay], new Set([louvre.imageUrl])).map((l) => l.name)).toEqual([
      "Eiffel Tower",
      "Musée d'Orsay",
    ]);
  });

  it("trims a name", () => {
    expect(landmarksToShow([{ ...tower, name: "  Eiffel Tower " }])[0]?.name).toBe("Eiffel Tower");
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

  it("the floor: every landmark drawn has its name and its credit, with its licence", () => {
    const credits = [
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
        const tiles = landmarkTiles(list, { headers: HEADERS, photoHeight: 118 });
        expect(tiles.length).toBeLessThanOrEqual(Math.min(3, n));
        tiles.forEach((tile, i) => {
          const source = list.find((l) => l.imageUrl === tile.imageUrl)!;
          expect(tile.rank).toBe(i + 1);
          expect(tile.name.length).toBeGreaterThan(0);
          expect(tile.spoken).toBe(`${tile.name}, photo`);
          // A credit that names someone (or Commons) and a licence: never a blank one.
          expect(source.credit.text.trim().length).toBeGreaterThan(0);
          expect(source.credit.licence.trim().length).toBeGreaterThan(0);
          expect(tile.credit.label.startsWith("Photo: ")).toBe(true);
          expect(tile.credit.label).toContain(source.credit.licence.trim());
          expect(tile.credit.spoken.length).toBeGreaterThan(0);
          expect(tile.credit.link).toBe(source.credit.licenceUrl ?? null);
        });
        drawn += tiles.length;
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

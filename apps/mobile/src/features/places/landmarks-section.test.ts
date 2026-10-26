/** The section the destination (04) and Explore's route (13) draw (Landmarks.tsx), as React builds it: every landmark
 *  drawn has its photograph, its name and its credit; a photograph that would not load takes them with it, and so does
 *  the one 04 already shows as the city's (a landmark standing in for it); the credit opens the photograph's page. Landmarks holds no state, so its element tree is read straight from the function, with
 *  React Native and the club's components stood in for (bun runs no native renderer); bun test does not resolve the
 *  `@/` alias, so the module holding 04's and 13's measures is handed over as itself (`destination-geometry.test.ts`
 *  pins them to the images). */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import type { DestinationPhoto } from "./landmark-logic";

const opened: string[] = [];
const View = (props: { children?: ReactNode }) => props.children ?? null;
const Text = (props: { children?: ReactNode }) => props.children ?? null;
mock.module("react-native", () => ({
  View,
  Text,
  StyleSheet: { create: <T>(styles: T) => styles },
  Linking: {
    openURL: async (url: string) => {
      opened.push(url);
      return true;
    },
  },
}));
const ui = {
  CAROUSEL_PAD: 8,
  CarouselRow: (props: { children?: ReactNode }) => props.children ?? null,
  Photo: () => null,
  PhotoCredit: () => null,
  baselineOffset: () => 0,
  belowBaseline: () => 0,
  rn: <T>(role: T) => role,
  tokens: { radius: { sm: 10 }, type: { subtitle: { fontSize: 17, lineHeight: 22 } }, colors: { textPrimary: "navy" } },
};
mock.module("@bbc/ui", () => ui);
/** 04's page and 13's sheet, as the flight options above the section are measured: the real module. */
const geometry = await import("../explore/destination-geometry");
mock.module("@/features/explore/destination-geometry", () => geometry);
const HEADERS = { "User-Agent": "BBCClub/test (https://api.example.test)" };
mock.module("./usePlacePhotos", () => ({ PICTURE_HEADERS: HEADERS }));

const { Landmarks } = await import("./Landmarks");
const { destinationPhoto } = await import("./landmark-logic");
const { bandPicture } = await import("./place-photo-logic");

type Element = ReactElement<Record<string, unknown>>;

/** Every element under `node`, depth first, as React would meet them. */
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

// Made-up files, authors and sizes; the landmarks' names are the places' own.
const thumb = (file: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/1280px-${file}`;
const page = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;
function landmark(name: string, file: string, over: Partial<LandmarkVM> = {}): LandmarkVM {
  return {
    name,
    imageUrl: thumb(file),
    width: 1280,
    height: 853,
    credit: { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0", pageUrl: page(file) },
    ...over,
  };
}
const tower = landmark("Eiffel Tower", "Tower.jpg");
const louvre = landmark("Louvre", "Louvre.jpg", { credit: { text: "Wikimedia Commons", licence: "CC0" } });
const orsay = landmark("Musée d'Orsay", "Orsay.jpg", { width: 1280, height: 1000 });

const NONE: ReadonlySet<string> = new Set();

/** 04's photograph as `destinationPhoto` hands it to the section: the server's at `address`, or none drawn. */
function over04At(address: string | null): DestinationPhoto {
  return destinationPhoto(null, {
    source: address ? { uri: address, headers: HEADERS } : null,
    credit: null,
    cache: "disk",
  });
}

function draw(
  landmarks: readonly LandmarkVM[],
  over: {
    failed?: ReadonlySet<string>;
    /** 04's photograph (`look` "page"); none drawn when not given. 13 takes none. */
    photo?: DestinationPhoto;
    look?: "route" | "page";
    onPhotoError?: (url: string) => void;
  } = {},
) {
  const look = over.look ?? "page";
  const prefix = look === "route" ? "explore" : "destination";
  const shared = {
    landmarks,
    failed: over.failed ?? NONE,
    onPhotoError: over.onPhotoError ?? (() => undefined),
  };
  if (look === "route" && over.photo) throw new Error("13 draws no city photograph");
  const tree =
    look === "route"
      ? Landmarks({ ...shared, look, testIDPrefix: "explore" })
      : Landmarks({ ...shared, look, testIDPrefix: "destination", photo: over.photo ?? over04At(null) });
  const all = elements(tree);
  const tileRe = new RegExp(`^${prefix}\\.landmark\\.(\\d+)$`);
  return {
    tree,
    all,
    tiles: all.filter((e) => typeof e.props.testID === "string" && tileRe.test(e.props.testID)),
    photos: all.filter((e) => e.type === ui.Photo),
    credits: all.filter((e) => e.type === ui.PhotoCredit),
    row: all.find((e) => e.type === ui.CarouselRow),
    prefix,
  };
}

beforeEach(() => {
  opened.length = 0;
});

describe("Landmarks — what the destination draws", () => {
  it("each landmark: its photograph and name as one image for a screen reader, then its credit", () => {
    const { tiles, photos, credits } = draw([tower, louvre, orsay]);
    expect(tiles.map((t) => [t.props.testID, t.props.accessibilityLabel, t.props.accessible])).toEqual([
      ["destination.landmark.1", "Eiffel Tower, photo", true],
      ["destination.landmark.2", "Louvre, photo", true],
      ["destination.landmark.3", "Musée d'Orsay, photo", true],
    ]);
    expect(tiles.every((t) => t.props.accessibilityRole === "image")).toBe(true);
    expect(photos.map((p) => p.props.source)).toEqual([
      { uri: tower.imageUrl, headers: HEADERS },
      { uri: louvre.imageUrl, headers: HEADERS },
      { uri: orsay.imageUrl, headers: HEADERS },
    ]);
    expect(credits.map((c) => [c.props.testID, c.props.label, c.props.accessibilityLabel])).toEqual([
      [
        "destination.landmark.1.credit",
        "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
        "Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons",
      ],
      ["destination.landmark.2.credit", "Photo: CC0 · Wikimedia Commons", "Photo, CC0, Wikimedia Commons"],
      [
        "destination.landmark.3.credit",
        "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons",
        "Photo by Jane Doe, CC BY-SA 4.0, Wikimedia Commons",
      ],
    ]);
  });

  it("the floor: every landmark drawn has its credit, whatever the server sends (ADR-IMPL-064)", () => {
    const credits = [
      { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0", pageUrl: page("A.jpg") },
      { text: "Wikimedia Commons", licence: "Public domain" },
      { text: "A. Photographer · Example Archive", licence: "CC BY 4.0" },
      { text: " ", licence: "CC BY-SA 3.0" },
      { text: "Jane Doe · Wikimedia Commons", licence: " " },
    ];
    const names = ["Eiffel Tower", " ", "Louvre", "Musée d'Orsay"];
    let drawn = 0;
    for (let n = 0; n <= 5; n++) {
      for (let seed = 0; seed < credits.length * names.length; seed++) {
        const list = Array.from({ length: n }, (_, i) =>
          landmark(names[(seed + i) % names.length]!, `File-${(seed * 7 + i) % 9}.jpg`, {
            credit: credits[(seed + 3 * i) % credits.length]!,
          }),
        );
        // 04 with no city photograph or with one of these landmarks' standing in for it; 13, which draws none.
        const standIn = list[seed % Math.max(1, n)]?.imageUrl ?? null;
        for (const [look, photo] of [
          ["page", over04At(null)],
          ["page", over04At(standIn)],
          ["route", undefined],
        ] as const) {
          const cityPhoto = photo?.cityPhoto ?? null;
          const { tree, tiles, photos, credits: shown, prefix } = draw(list, { look, photo });
          if (tiles.length === 0) {
            expect(tree).toBeNull();
            continue;
          }
          expect(photos).toHaveLength(tiles.length);
          expect(shown).toHaveLength(tiles.length);
          tiles.forEach((tile, i) => {
            const credit = shown[i]!;
            expect(tile.props.testID).toBe(`${prefix}.landmark.${i + 1}`);
            expect(credit.props.testID).toBe(`${prefix}.landmark.${i + 1}.credit`);
            expect(String(credit.props.label)).toStartWith("Photo: ");
            expect(String(credit.props.accessibilityLabel).length).toBeGreaterThan(0);
            expect(typeof photos[i]!.props.onError).toBe("function");
            expect((photos[i]!.props.source as { uri: string }).uri).not.toBe(cityPhoto);
          });
          drawn += tiles.length;
        }
      }
    }
    expect(drawn).toBeGreaterThan(100);
  });

  it("none, or none that loads: nothing at all — no title, no empty frame", () => {
    expect(draw([]).tree).toBeNull();
    expect(draw([tower], { failed: new Set([tower.imageUrl]) }).tree).toBeNull();
    // The city's only landmark, already over 04 as its photograph: nothing either.
    expect(draw([tower], { photo: over04At(tower.imageUrl) }).tree).toBeNull();
  });

  it("04 leaves out the landmark its photograph already is; 13, which draws the globe, keeps it (amendment 1)", () => {
    // A city on its satellite view, as the server answers it with its first landmark standing in (made-up file).
    const standIn = {
      code: "CDG",
      kind: "photo",
      card: tower.imageUrl.replace("/1280px-", "/500px-"),
      hero: tower.imageUrl,
      credit: { source: "wikimedia", author: "Jane Doe", license: "CC BY-SA 4.0", link: page("Tower.jpg") },
    } as const;
    const band = bandPicture(undefined, standIn, {
      headers: HEADERS,
      mapboxToken: undefined,
      size: { width: 393, height: 190 },
    });
    // What 04 hands over (`app/destination/[code].tsx`, `destinationPhoto`): the photograph over the page — the
    // design's own when it has one (bundled, a number), else the server's — as `Photo` draws it.
    const over04 = (bundled: number | null) => destinationPhoto(bundled, band);
    const page04 = draw([tower, louvre, orsay], { look: "page", photo: over04(null) });
    expect(page04.tiles.map((t) => [t.props.testID, t.props.accessibilityLabel])).toEqual([
      ["destination.landmark.1", "Louvre, photo"],
      ["destination.landmark.2", "Musée d'Orsay, photo"],
    ]);
    expect(page04.photos.map((p) => (p.props.source as { uri: string }).uri)).toEqual([
      louvre.imageUrl,
      orsay.imageUrl,
    ]);
    expect(page04.credits.map((c) => [c.props.testID, c.props.label])).toEqual([
      ["destination.landmark.1.credit", "Photo: CC0 · Wikimedia Commons"],
      ["destination.landmark.2.credit", "Photo: Jane Doe · CC BY-SA 4.0 · Wikimedia Commons"],
    ]);
    // The design's own photograph of the city over 04: the stand-in is not drawn, so its landmark is.
    expect(draw([tower, louvre, orsay], { look: "page", photo: over04(7) }).tiles).toHaveLength(3);
    // The satellite view over 04: no landmark's photograph, all three.
    const satellite = bandPicture(undefined, { code: "CDG", kind: "satellite", lat: 48.85, lng: 2.35 } as const, {
      headers: HEADERS,
      mapboxToken: "pk.test",
      size: { width: 393, height: 190 },
    });
    const sky = draw([tower, louvre, orsay], { look: "page", photo: destinationPhoto(null, satellite) });
    expect(sky.tiles.map((t) => t.props.accessibilityLabel)).toEqual([
      "Eiffel Tower, photo",
      "Louvre, photo",
      "Musée d'Orsay, photo",
    ]);
    // 13 (`app/(tabs)/explore.tsx`) has none to pass: all three, the stand-in's first.
    const route13 = draw([tower, louvre, orsay], { look: "route" });
    expect(route13.tiles.map((t) => [t.props.testID, t.props.accessibilityLabel])).toEqual([
      ["explore.landmark.1", "Eiffel Tower, photo"],
      ["explore.landmark.2", "Louvre, photo"],
      ["explore.landmark.3", "Musée d'Orsay, photo"],
    ]);
  });

  it("each screen says what is over the section, or does not compile: 04 its photograph, 13 none", () => {
    // Held by the app's typecheck (`tsc -p tsconfig.test.json`) as much as by this run: 04 hands the section the
    // photograph it draws, as `destinationPhoto` chose it — never none, never left unsaid, never a bare address — and 13,
    // over the globe, has none to hand. A screen that drops it is a type error, not a landmark shown twice.
    const shared = { landmarks: [tower, louvre], failed: NONE, onPhotoError: () => undefined };
    const hero = over04At(tower.imageUrl);
    const screens = [
      () => Landmarks({ ...shared, look: "page", testIDPrefix: "destination", photo: hero }),
      () => Landmarks({ ...shared, look: "route", testIDPrefix: "explore" }),
      // @ts-expect-error 04 hands the photograph over the page, never none
      () => Landmarks({ ...shared, look: "page", testIDPrefix: "destination", photo: null }),
      // @ts-expect-error nor leaves it unsaid
      () => Landmarks({ ...shared, look: "page", testIDPrefix: "destination" }),
      // @ts-expect-error nor an address in its place
      () => Landmarks({ ...shared, look: "page", testIDPrefix: "destination", photo: hero.cityPhoto }),
      // @ts-expect-error 13 draws the globe: it has no photograph to hand
      () => Landmarks({ ...shared, look: "route", testIDPrefix: "explore", photo: hero }),
    ];
    const label = (tree: unknown) =>
      elements(tree)
        .map((e) => e.props.accessibilityLabel)
        .filter((l) => typeof l === "string" && l.endsWith(", photo"));
    expect(label(screens[0]!())).toEqual(["Louvre, photo"]);
    expect(label(screens[1]!())).toEqual(["Eiffel Tower, photo", "Louvre, photo"]);
  });

  it("a photograph that would not load leaves with its name and credit; the others close up", () => {
    const failedNow: string[] = [];
    const first = draw([tower, louvre, orsay], { onPhotoError: (url) => failedNow.push(url) });
    (first.photos[1]!.props.onError as () => void)();
    expect(failedNow).toEqual([louvre.imageUrl]);

    const after = draw([tower, louvre, orsay], { failed: new Set(failedNow) });
    expect(after.tiles.map((t) => t.props.accessibilityLabel)).toEqual(["Eiffel Tower, photo", "Musée d'Orsay, photo"]);
    expect(after.credits.map((c) => c.props.testID)).toEqual([
      "destination.landmark.1.credit",
      "destination.landmark.2.credit",
    ]);
    expect(after.photos).toHaveLength(2);
  });

  it("the credit opens the photograph's own page; one with no page is only read", async () => {
    const { credits } = draw([tower, louvre]);
    (credits[0]!.props.onPress as () => void)();
    await Promise.resolve();
    expect(opened).toEqual([page("Tower.jpg")]);
    expect(credits[1]!.props.onPress).toBeUndefined();
  });

  it("lines up under the flight options of its look: 04's page, 13's sheet over its gutter", () => {
    // Where the title's pen stands inside the component, and how far its photographs are under its baseline: 04 and 13.
    const drawn = { page: { pen: 17.93, toCards: 9.5 }, route: { pen: 20.4 - 15, toCards: 13.5 } };
    for (const look of ["page", "route"] as const) {
      const { all, row } = draw([tower], { look });
      const column = geometry.optionsColumn(look);
      const title = all.find((e) => e.props.accessibilityRole === "header");
      expect(title?.props.children).toBe("Landmarks");
      expect(title?.props.style).toContainEqual(geometry.FLIGHT_OPTIONS[look].title.type);
      const pen = (title?.props.style as object[]).find((s) => "marginLeft" in s) as { marginLeft: number };
      expect(pen.marginLeft).toBeCloseTo(drawn[look].pen, 9);
      // `baselineOffset` and `belowBaseline` stand in as 0: the row's pad is all that comes off the drop.
      const above = all.find((e) => e.props.children === row) as Element;
      expect((above.props.style as { marginTop: number }).marginTop).toBeCloseTo(
        drawn[look].toCards - ui.CAROUSEL_PAD,
        9,
      );
      expect(row?.props).toMatchObject({ bleed: column.inset, inset: column.cardsLeft, gap: 8.55 });
    }
  });
});

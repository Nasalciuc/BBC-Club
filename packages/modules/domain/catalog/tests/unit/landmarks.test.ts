/**
 * Landmarks (ADR-IMPL-064): the question to WDQS, reading its answer, D7's filters through Commons, and what the app
 * receives. Paris and Chișinău are WDQS's and Commons' own answers of 25 Oct 2026 (`wikimedia/landmarks-*.json`, built
 * from the saved evidence): sizes, types, licences and restrictions as Commons gave them; authors made up
 * ("Photographer N"), files whose name credits a person renamed, addresses rebuilt from the names; the night and aerial
 * views come from a second question about the same items, their thumbnail fields filled in the way Commons fills them.
 */
import { describe, expect, it } from "bun:test";

import { PlaceLandmarksVM } from "@bbc/shared/api/v1/places";
import {
  LANDMARK_FILES_MAX,
  LANDMARK_MIN_WIDTH,
  acceptLandmarkPhoto,
  askLandmarkFiles,
  commonsPage,
  landmarkFiles,
  landmarkSparql,
  pickLandmarks,
  readLandmarks,
} from "../../src/application/landmark-sources";
import { readLandmarksFlag, toPlaceLandmarksVM } from "../../src/application/place-landmarks";
import type { Binding, ImageInfo } from "../../src/application/place-photo-sources";
import { fakeSources } from "./place-photos.fixture";
import parisAnswer from "./wikimedia/landmarks-paris.json";
import chisinauAnswer from "./wikimedia/landmarks-chisinau.json";

type Saved = { wdqs: { results: { bindings: unknown[] } }; commons: Record<string, unknown> };
const bindingsOf = (a: Saved) => a.wdqs.results.bindings as Binding[];
const infosOf = (a: Saved) => new Map(Object.entries(a.commons) as [string, ImageInfo][]);
const paris = parisAnswer as Saved;
const chisinau = chisinauAnswer as Saved;

/** A row of the job's question, as WDQS writes it. */
function row(qid: string, name: string, sitelinks: number, view: string, file: string): Binding {
  return {
    item: { type: "uri", value: `http://www.wikidata.org/entity/${qid}` },
    itemLabel: { type: "literal", "xml:lang": "en", value: name },
    sitelinks: { type: "literal", value: String(sitelinks) },
    view: { type: "literal", value: view },
    file: { type: "uri", value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` },
  };
}

/** Commons' imageinfo at 1280 px: a large landscape JPEG under CC BY-SA 4.0 by a made-up author unless told. */
function info(
  o: Partial<ImageInfo> & {
    name?: string;
    license?: string;
    artist?: string | null;
    licenseUrl?: string;
    restrictions?: string;
  } = {},
): ImageInfo {
  const { name = "Sight.jpg", license = "CC BY-SA 4.0", artist = "Ana Pop", licenseUrl, restrictions, ...rest } = o;
  const width = rest.width ?? 4000;
  const height = rest.height ?? 2667;
  const under = encodeURIComponent(name.replace(/ /g, "_"));
  const ext: Record<string, { value: unknown }> = { LicenseShortName: { value: license } };
  if (artist !== null) ext.Artist = { value: artist };
  if (licenseUrl) ext.LicenseUrl = { value: licenseUrl };
  if (restrictions) ext.Restrictions = { value: restrictions };
  return {
    width,
    height,
    mime: "image/jpeg",
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${under}/1280px-${under}`,
    thumbwidth: 1280,
    thumbheight: Math.round((1280 * height) / width),
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${under}`,
    extmetadata: ext,
    ...rest,
  };
}

describe("the question", () => {
  it("asks for sights within 20 km of the city item, with the hint WDQS needs, and never the city itself", () => {
    const q = landmarkSparql("Q90");
    expect(q).toContain("wd:Q90 wdt:P625 ?centre .");
    expect(q).toContain('wikibase:radius "20"');
    expect(q).toContain('hint:Query hint:optimizer "None"');
    expect(q).toContain("FILTER(?item != wd:Q90)");
    // Sights (tourist attraction, landmark, museum) or heritage; no populated place.
    expect(q).toContain("VALUES ?root { wd:Q570116 wd:Q2319498 wd:Q33506 }");
    expect(q).toContain("?item wdt:P1435 []");
    expect(q).toContain("FILTER NOT EXISTS { ?item wdt:P1082 [] . }");
    // Not excluded: subclasses of administrative entity (the Eiffel Tower) and items with P576 (Hagia Sophia).
    expect(q).not.toContain("Q56061");
    expect(q).not.toContain("P576");
    // Each item's main, night and aerial views; the city's own photographs.
    expect(q).toContain('?item wdt:P18 ?file . BIND("image" AS ?view)');
    expect(q).toContain('?item wdt:P3451 ?file . BIND("night" AS ?view)');
    expect(q).toContain('?item wdt:P8592 ?file . BIND("aerial" AS ?view)');
    expect(q).toContain('wd:Q90 wdt:P18|wdt:P3451 ?file . BIND("city" AS ?view)');
    expect(q).toContain("LIMIT 40");
    expect(() => landmarkSparql("Q90 . ?x ?y ?z")).toThrow();
    expect(() => landmarkSparql("Q0")).toThrow();
    expect(() => landmarkSparql("P31")).toThrow();
  });

  it("asks WDQS once and Commons at 1280 px with the licence's address", async () => {
    const f = fakeSources({
      commons: { "Sight.jpg": { licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" } },
    });
    const sources = {
      fetch: f.fetch,
      userAgent: "BBCClub/1.0 (test; landmarks)",
      signal: new AbortController().signal,
    };
    const infos = await askLandmarkFiles(sources, ["Sight.jpg"]);
    const params = new URL(f.calls[0]!.url).searchParams;
    expect(params.get("iiurlwidth")).toBe("1280");
    expect(params.get("iiextmetadatafilter")).toContain("LicenseUrl");
    expect(acceptLandmarkPhoto(infos.get("Sight.jpg"))?.licenceUrl).toBe(
      "https://creativecommons.org/licenses/by-sa/4.0",
    );
  });
});

describe("reading the answer", () => {
  it("ranks Paris's sights by sitelinks and keeps the city's own photographs apart", () => {
    const read = readLandmarks(bindingsOf(paris), "Q90");
    expect(read.candidates.slice(0, 5).map((c) => c.name)).toEqual([
      "Eiffel Tower",
      "Louvre Museum",
      "Notre-Dame de Paris",
      "Musée d'Orsay",
      "Palace of Versailles",
    ]);
    // The Eiffel Tower's main image, then its night view, then its aerial view.
    expect(read.candidates[0]?.files).toEqual([
      "Tour Eiffel Wikimedia Commons.jpg",
      "Eiffel tower night illumination.jpg",
      "Eiffel Tower at night 20150801-2.jpg",
    ]);
    expect(read.cityFiles.has("La Tour Eiffel vue de la Tour Saint-Jacques, Paris août 2014 (2).jpg")).toBe(true);
  });

  it("never the city's own item, an item the operator keeps out, or one without a name", () => {
    const answer = [
      row("Q90", "Paris", 300, "image", "Paris skyline.jpg"),
      row("Q243", "Eiffel Tower", 191, "image", "Tower.jpg"),
      row("Q19675", "Louvre Museum", 170, "image", "Louvre.jpg"),
      { ...row("Q5", "nameless", 500, "image", "Nameless.jpg"), itemLabel: undefined } as unknown as Binding,
    ];
    expect(readLandmarks(answer, "Q90").candidates.map((c) => c.qid)).toEqual(["Q243", "Q19675"]);
    expect(readLandmarks(answer, "Q90", new Set(["Q243"])).candidates.map((c) => c.qid)).toEqual(["Q19675"]);
  });

  it("asks Commons only about views: no map, logo, flag, coat of arms or SVG, nor the city's own photographs", () => {
    const answer = [
      row("Q1", "Fort", 50, "image", "Map of the fort.jpg"),
      row("Q1", "Fort", 50, "image", "Fort logo.png"),
      row("Q1", "Fort", 50, "image", "Fort.svg"),
      row("Q1", "Fort", 50, "image", "Escudo del fuerte.jpg"),
      row("Q1", "Fort", 50, "night", "Fort at night.jpg"),
      row("Q2", "Gate", 40, "image", "City view.jpg"),
      { view: { type: "literal", value: "city" }, file: row("Q9", "", 0, "", "City_view.jpg").file } as Binding,
    ];
    const read = readLandmarks(answer, "Q9");
    expect(landmarkFiles(read)).toEqual(["Fort at night.jpg"]);
  });

  it("asks Commons twice at most for a city: a hundred files, best first (made-up items with six views each)", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      Array.from({ length: 6 }, (_, j) =>
        row(`Q${100 + i}`, `Sight ${i}`, 100 - i, "image", `Sight ${i} view ${j}.jpg`),
      ),
    ).flat();
    const files = landmarkFiles(readLandmarks(many, "Q9"));
    expect(LANDMARK_FILES_MAX).toBe(100);
    expect(files).toHaveLength(LANDMARK_FILES_MAX);
    expect(files[0]).toBe("Sight 0 view 0.jpg");
    expect(files.at(-1)).toBe("Sight 16 view 3.jpg");
  });
});

describe("D7's filters through Commons", () => {
  it("Paris: the Eiffel Tower by its aerial view (main and night views are portraits), no Louvre (2.5 wide for 1)", () => {
    const picked = pickLandmarks(readLandmarks(bindingsOf(paris), "Q90"), infosOf(paris));
    expect(picked.map((p) => [p.name, p.file])).toEqual([
      ["Eiffel Tower", "Eiffel Tower at night 20150801-2.jpg"],
      ["Musée d'Orsay", "Gare d'Orsay (49570190081).jpg"],
      ["Palace of Versailles", "Vue aérienne du domaine de Versailles - 083.jpg"],
    ]);
    const [eiffel] = picked;
    expect(eiffel).toMatchObject({
      qid: "Q243",
      width: 1280,
      height: 853,
      licence: "CC BY-SA 4.0",
      licenceUrl: null, // the saved answers did not ask for it
    });
    expect(eiffel?.imageUrl).toStartWith("https://upload.wikimedia.org/wikipedia/commons/thumb/");
    expect(eiffel?.credit).toMatch(/^Photographer \d+ · Wikimedia Commons$/);
  });

  it("Chișinău: the water tower by its aerial view; a cathedral photographed at 848 px is passed over", () => {
    const picked = pickLandmarks(readLandmarks(bindingsOf(chisinau), "Q21197"), infosOf(chisinau));
    expect(picked.map((p) => [p.qid, p.name, p.licence])).toEqual([
      ["Q6974468", "National Museum of Fine Arts", "CC0"],
      ["Q12736098", "National Museum of History of Moldova", "CC BY 2.0"],
      ["Q2501338", "Water Tower of Chișinău", "CC BY-SA 4.0"],
    ]);
    expect(picked[2]?.file).toBe("Clădirea fostului castel de apă cu foișor de foc. Foto 6.jpg");
  });

  it("no duplicate photograph: two items showing one file, a redirect to one page, or the city's own photo", () => {
    const answer = [
      row("Q1", "Museum", 30, "image", "Shared.jpg"),
      row("Q2", "Museum building", 20, "image", "Shared.jpg"),
      row("Q2", "Museum building", 20, "night", "Building at night.jpg"),
      row("Q3", "Old gate", 10, "image", "Gate old name.jpg"),
      row("Q4", "Square", 5, "image", "City.jpg"),
      { view: { type: "literal", value: "city" }, file: row("Q9", "", 0, "", "City.jpg").file } as Binding,
    ];
    const infos = new Map([
      ["Shared.jpg", info({ name: "Shared.jpg" })],
      ["Building at night.jpg", info({ name: "Building at night.jpg" })],
      // Renamed on Commons: the old name answers with the page of the file already picked.
      [
        "Gate old name.jpg",
        { ...info({ name: "Gate.jpg" }), descriptionurl: info({ name: "Shared.jpg" }).descriptionurl },
      ],
      ["City.jpg", info({ name: "City.jpg" })],
    ]);
    const picked = pickLandmarks(readLandmarks(answer, "Q9"), infos);
    expect(picked.map((p) => [p.qid, p.file])).toEqual([
      ["Q1", "Shared.jpg"],
      ["Q2", "Building at night.jpg"],
    ]);
  });

  it("at most three, fewer when fewer qualify — never invented", () => {
    const answer = Array.from({ length: 6 }, (_, i) =>
      row(`Q${i + 1}`, `Sight ${i + 1}`, 60 - i, "image", `S${i + 1}.jpg`),
    );
    const all = new Map(answer.map((_, i) => [`S${i + 1}.jpg`, info({ name: `S${i + 1}.jpg` })]));
    expect(pickLandmarks(readLandmarks(answer, "Q99"), all)).toHaveLength(3);
    const one = new Map([["S4.jpg", info({ name: "S4.jpg" })]]);
    expect(pickLandmarks(readLandmarks(answer, "Q99"), one).map((p) => p.qid)).toEqual(["Q4"]);
    expect(pickLandmarks(readLandmarks(answer, "Q99"), new Map())).toEqual([]);
  });

  it("refuses what D7 and the city photo's credit rules refuse", () => {
    expect(acceptLandmarkPhoto(info())).not.toBeNull();
    expect(acceptLandmarkPhoto(undefined)).toBeNull();
    expect(acceptLandmarkPhoto(info({ mime: "image/svg+xml" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ mime: "image/png" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ width: LANDMARK_MIN_WIDTH - 1, height: 1000 }))).toBeNull(); // Burj Khalifa's 1558
    expect(acceptLandmarkPhoto(info({ width: LANDMARK_MIN_WIDTH, height: 1000 }))).not.toBeNull();
    expect(acceptLandmarkPhoto(info({ width: 2900, height: 5367 }))).toBeNull(); // a portrait
    expect(acceptLandmarkPhoto(info({ width: 3048, height: 1209 }))).toBeNull(); // 2.52 wide for 1
    expect(acceptLandmarkPhoto(info({ thumbwidth: 1000 }))).toBeNull(); // not a real 1280-px thumbnail
    expect(acceptLandmarkPhoto(info({ thumburl: "http://upload.wikimedia.org/x.jpg" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ restrictions: "ita-mibac" }))).toBeNull(); // the Colosseum's
    expect(acceptLandmarkPhoto(info({ restrictions: "personality" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ license: "FAL" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ license: "Attribution" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ license: "GFDL" }))).toBeNull();
    expect(acceptLandmarkPhoto(info({ artist: null }))).toBeNull(); // CC BY-SA asks for an author
    expect(acceptLandmarkPhoto(info({ license: "CC0", artist: null }))).toMatchObject({ credit: "Wikimedia Commons" });
    expect(acceptLandmarkPhoto(info({ licenseUrl: "http://creativecommons.org/licenses/by/2.0" }))?.licenceUrl).toBe(
      "https://creativecommons.org/licenses/by/2.0",
    );
    expect(acceptLandmarkPhoto(info({ licenseUrl: "ftp://example.org/licence" }))?.licenceUrl).toBeNull();
  });
});

describe("what the app receives", () => {
  const rows = [1, 2, 3].map((rank) => ({
    rank,
    landmarkQid: `Q${rank}`,
    name: `Sight ${rank}`,
    file: `S${rank}.jpg`,
    imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/S${rank}.jpg/1280px-S${rank}.jpg`,
    width: 1280,
    height: 853,
    licence: "CC BY-SA 4.0",
    licenceUrl: rank === 1 ? "https://creativecommons.org/licenses/by-sa/4.0" : null,
    credit: "Ana Pop · Wikimedia Commons",
  }));

  it("the landmarks best first, without those an operator keeps out; the contract reads them", () => {
    const vm = toPlaceLandmarksVM("CDG", rows, new Set(["Q2"]));
    expect(vm).toEqual({
      code: "CDG",
      landmarks: [
        {
          name: "Sight 1",
          imageUrl: rows[0]!.imageUrl,
          width: 1280,
          height: 853,
          credit: {
            text: "Ana Pop · Wikimedia Commons",
            licence: "CC BY-SA 4.0",
            licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
            pageUrl: "https://commons.wikimedia.org/wiki/File:S1.jpg",
          },
        },
        {
          name: "Sight 3",
          imageUrl: rows[2]!.imageUrl,
          width: 1280,
          height: 853,
          credit: {
            text: "Ana Pop · Wikimedia Commons",
            licence: "CC BY-SA 4.0",
            pageUrl: "https://commons.wikimedia.org/wiki/File:S3.jpg",
          },
        },
      ],
    });
    expect(PlaceLandmarksVM.parse(vm)).toEqual(vm);
  });

  it("each credit links its photograph's own page on Commons, the page Commons gave for it (ADR-IMPL-043)", () => {
    const title = (url: string) => decodeURIComponent(new URL(url).pathname);
    for (const [saved, city] of [
      [paris, "Q90"],
      [chisinau, "Q21197"],
    ] as const) {
      const picked = pickLandmarks(readLandmarks(bindingsOf(saved), city), infosOf(saved));
      expect(picked.length).toBeGreaterThan(0);
      for (const p of picked) expect(title(commonsPage(p.file))).toBe(title(p.page));
    }
    // As MediaWiki writes a page's address (made-up names): an apostrophe encoded, brackets and commas kept.
    expect(commonsPage("Gare d'Orsay (1).jpg")).toBe("https://commons.wikimedia.org/wiki/File:Gare_d%27Orsay_(1).jpg");
    expect(commonsPage("old house, river_bank.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Old_house,_river_bank.jpg",
    );
    expect(commonsPage("Vue aérienne? #2.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Vue_a%C3%A9rienne%3F_%232.jpg",
    );
  });

  it("a landmark an older app cannot read is dropped, never the whole answer; three at most", () => {
    const good = toPlaceLandmarksVM("CDG", rows, new Set()).landmarks[0];
    const parsed = PlaceLandmarksVM.parse({
      code: "CDG",
      landmarks: [good, { ...good, imageUrl: "http://x.test/a.jpg" }, { ...good, width: 0 }, good, good, good],
    });
    expect(parsed.landmarks).toHaveLength(3);
    expect(PlaceLandmarksVM.safeParse({ code: "cdg", landmarks: [] }).success).toBe(false);
  });

  it("the flag: off unless on; skip holds Wikidata items only", () => {
    expect(readLandmarksFlag(null)).toEqual({ enabled: false, skip: new Set() });
    expect(readLandmarksFlag({ enabled: true, skip: ["Q177174", "x", 3, "Q0"] })).toEqual({
      enabled: true,
      skip: new Set(["Q177174"]),
    });
    expect(readLandmarksFlag({ enabled: "yes" }).enabled).toBe(false);
  });
});

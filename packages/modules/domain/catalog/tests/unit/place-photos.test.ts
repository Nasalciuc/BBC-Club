/** Place photos (ADR-IMPL-043): reading the three sources, choosing a photo, and what the app receives. */
import { describe, expect, it } from "bun:test";

import { PlacePhotosVM, type PlacePhotoVM } from "@bbc/shared/api/v1/places";
import {
  COMMONS_API,
  DEFAULT_RETRY_AFTER_S,
  MAX_RETRY_AFTER_S,
  REQUEST_TIMEOUT_MS,
  SourceError,
  acceptCommons,
  cityByNameSparql,
  cityFacts,
  cityFactsByName,
  citySparql,
  commonsFileName,
  commonsPage,
  commonsThumbAt,
  metadataText,
  parsePoint,
  pickPexels,
  retryAfterSeconds,
  searchName,
  sparqlString,
  type Binding,
  type Fetch,
  type ImageInfo,
} from "../../src/application/place-photo-sources";
import {
  CITY_SEARCHES_PER_RUN,
  PEXELS_PER_RUN,
  PLACE_PHOTOS_REQUESTS_MS,
  decidePlaces,
  landmarkAsPhoto,
  parseCodes,
  toPlacePhotoVM,
  withLandmarkPhotos,
  withoutOutcome,
  type Outcome,
  type Place,
} from "../../src/application/place-photos";
import type { LandmarkStandIn } from "../../src/infrastructure/place-landmarks.repo";
import { binding, commonsThumb, fakeSources, pexelsPhoto } from "./place-photos.fixture";
// WDQS's own answers, 25 Oct 2026 (no person in them): the airports' question for RMO and KIV, and the search by a
// city's name for Chișinău, for Kishinev (with the search's order) and for Springfield.
import rmoKiv from "./wikimedia/wdqs-city-rmo-kiv.json";
import byNameChisinau from "./wikimedia/wdqs-city-by-name-chisinau.json";
import byNameKishinev from "./wikimedia/wdqs-city-by-name-kishinev.json";
import byNameSpringfield from "./wikimedia/wdqs-city-by-name-springfield.json";

const rows = (answer: { results: { bindings: unknown[] } }) => answer.results.bindings as Binding[];
/** The search's order as WDQS writes it. */
const rank = (n: number) => ({ type: "literal", datatype: "http://www.w3.org/2001/XMLSchema#int", value: String(n) });

const LONDON: Place = { code: "LHR", city: "London", lat: 51.470748, lng: -0.459909 };
const PARIS: Place = { code: "CDG", city: "Paris", lat: 49.00896, lng: 2.554117 };
const CHISINAU: Place = { code: "RMO", city: "Chișinău", lat: 46.92774, lng: 28.931704 };
const ZURICH: Place = { code: "ZRH", city: "Zurich", lat: 47.458056, lng: 8.548056 };
const TOKYO: Place = { code: "NRT", city: "Tokyo", lat: 35.76858, lng: 140.388714 };

const quiet = { warn: () => {}, error: () => {} };
const sources = (fetch: ReturnType<typeof fakeSources>["fetch"]) => ({
  fetch,
  userAgent: "BBCClub/1.0 (https://api.example.test; place photos)",
  signal: new AbortController().signal,
});

const heathrow = (extra: Partial<Parameters<typeof binding>[0]> = {}) =>
  binding({
    iata: "LHR",
    airport: "Q8691",
    airportCoord: [-0.461389, 51.4775],
    city: "Q84",
    cityLabel: "London",
    cityCoord: [-0.1275, 51.507222],
    ...extra,
  });

describe("parseCodes", () => {
  it("upper-cases, trims and de-duplicates; 1 to 20 IATA codes or null", () => {
    expect(parseCodes("LHR,cdg, LHR")).toEqual(["LHR", "CDG"]);
    expect(parseCodes("")).toBeNull();
    expect(parseCodes(undefined)).toBeNull();
    expect(parseCodes(",,")).toBeNull();
    expect(parseCodes("LH1")).toBeNull();
    expect(parseCodes("LHRX")).toBeNull();
    const many = Array.from(
      { length: 21 },
      (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`,
    );
    expect(parseCodes(many.slice(0, 20).join(","))).toHaveLength(20);
    expect(parseCodes(many.join(","))).toBeNull();
  });
});

describe("Wikidata", () => {
  it("asks for IATA codes only — anything else cannot reach the query", () => {
    const q = citySparql(["LHR", "CDG"]);
    expect(q).toContain('VALUES ?iata { "LHR" "CDG" }');
    // Any rank: `wdt:` reads the best one only, and a code kept beside a newer one (KIV, now RMO) would find nothing.
    expect(q).toContain("?airport p:P238/ps:P238 ?iata .");
    expect(q).not.toContain("wdt:P238");
    expect(q).toContain("wdt:P931");
    expect(q).toContain("wdt:P3451");
    expect(q).toContain("wdt:P18");
    expect(() => citySparql(['LH" } . ?x ?y ?z . { "'])).toThrow();
  });

  it("reads points longitude first, and refuses a point on another globe", () => {
    expect(parsePoint("Point(-0.1275 51.507222)")).toEqual({ lat: 51.507222, lng: -0.1275 });
    expect(parsePoint("Point(2.3522 4.88e1)")).toEqual({ lat: 48.8, lng: 2.3522 });
    expect(parsePoint("<http://www.wikidata.org/entity/Q405> Point(10 20)")).toBeNull();
    expect(parsePoint("Point(200 10)")).toBeNull();
    expect(parsePoint(undefined)).toBeNull();
  });

  it("reads Commons file names from Special:FilePath", () => {
    expect(
      commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/London%20Skyline%20%28night%29.jpg"),
    ).toBe("London Skyline (night).jpg");
    expect(commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/St_Paul%27s.jpg")).toBe("St Paul's.jpg");
    expect(commonsFileName("http://example.com/wiki/Special:FilePath/x.jpg")).toBeNull();
    expect(commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/a%7Cb.jpg")).toBeNull();
    expect(commonsFileName("http://commons.wikimedia.org/wiki/Special:FilePath/%E0%A4%A.jpg")).toBeNull();
  });

  it("takes the airport within 50 km of ours when a code names several items", () => {
    const far = binding({
      iata: "LHR",
      airport: "Q1",
      airportCoord: [10, 10],
      city: "Q2",
      cityLabel: "London",
      image: "Elsewhere.jpg",
    });
    expect(cityFacts([far, heathrow({ image: "London Skyline.jpg" })], LONDON).files).toEqual(["London Skyline.jpg"]);
    expect(cityFacts([far], LONDON)).toEqual({ qid: null, files: [], centre: null });
    expect(cityFacts([heathrow({ airportCoord: undefined, image: "x.jpg" })], LONDON)).toEqual({
      qid: null,
      files: [],
      centre: null,
    });
    expect(cityFacts([], LONDON)).toEqual({ qid: null, files: [], centre: null });
  });

  it("puts night views first, drops montages, maps and flags, keeps three", () => {
    const rows = [
      heathrow({ night: "London at night.jpg", image: "London Montage.jpg" }),
      heathrow({ night: "Thames by night.jpg", image: "Flag of London.jpg" }),
      heathrow({ night: "Map of London.png", image: "City of London skyline.jpg" }),
      heathrow({ image: "Westminster.jpg" }),
    ];
    expect(cityFacts(rows, LONDON)).toEqual({
      qid: "Q84",
      files: ["London at night.jpg", "Thames by night.jpg", "City of London skyline.jpg"],
      centre: { lat: 51.507222, lng: -0.1275 },
    });
  });

  it("chooses the city we show among several served, else the oldest item; the centre only within 150 km", () => {
    const basel = (city: string, label: string, image: string, coord: [number, number]) =>
      binding({
        iata: "BSL",
        airport: "Q9",
        airportCoord: [7.529, 47.59],
        city,
        cityLabel: label,
        image,
        cityCoord: coord,
      });
    const place = { code: "BSL", city: "Mulhouse", lat: 47.59, lng: 7.529 };
    const rows = [
      basel("Q78", "Basel", "Basel.jpg", [7.5886, 47.5596]),
      basel("Q79815", "Mulhouse", "Mulhouse.jpg", [7.3389, 47.7508]),
    ];
    expect(cityFacts(rows, place).files).toEqual(["Mulhouse.jpg"]);
    expect(cityFacts(rows, { ...place, city: "Freiburg" }).files).toEqual(["Basel.jpg"]); // Q78 is older
    const far = [basel("Q78", "Mulhouse", "Mulhouse.jpg", [20, 50])];
    expect(cityFacts(far, place).centre).toBeNull();
    expect(cityFacts([heathrow({ cityLabel: "london" })], LONDON).centre).toEqual({ lat: 51.507222, lng: -0.1275 });
    expect(
      cityFacts(
        [
          binding({
            iata: "RMO",
            airport: "Q5",
            airportCoord: [28.93, 46.93],
            city: "Q21197",
            cityLabel: "Chisinau",
            image: "Chisinau.jpg",
          }),
        ],
        CHISINAU,
      ).files,
    ).toEqual(["Chisinau.jpg"]);
  });

  it("finds Chișinău by RMO and by KIV, the code Wikidata keeps at normal rank since 2024 (WDQS's answer)", () => {
    const answer = rows(rmoKiv);
    expect(answer.map((b) => b.iata?.value).sort()).toEqual(["KIV", "RMO"]);
    const cathedral = "Ansamblul Catedralei „Nașterea Domnului” 3.jpg";
    const arch = "Arch of Triumph, Chisinau, Republic of Moldova (51160304626 cropped).jpg";
    for (const code of ["RMO", "KIV"]) {
      expect(cityFacts(answer, { ...CHISINAU, code })).toEqual({
        qid: "Q21197",
        files: [cathedral, arch], // the night view first
        centre: { lat: 47.022777777, lng: 28.835277777 },
      });
    }
  });

  it("finds a city by its own name near the airport: ours by its name, else the search's first, never a namesake far off", () => {
    // "Chisinau" also finds the Chișinău Ghetto (Q4222668), nearer the airport than the city's centre: the name wins.
    expect(cityFactsByName(rows(byNameChisinau), CHISINAU)).toMatchObject({
      qid: "Q21197",
      centre: { lat: 47.022777777, lng: 28.835277777 },
    });
    // "Kishinev" is no settlement's English name: the search puts Chișinău first (its alias) and the Ghetto third —
    // the order wins over the Ghetto's being nearer the airport.
    const kishinev = { ...CHISINAU, city: "Kishinev" };
    expect(rows(byNameKishinev).map((b) => [b.city?.value.split("/").pop(), b.rank?.value])).toEqual([
      ["Q21197", "0"],
      ["Q4222668", "2"],
    ]);
    expect(cityFactsByName(rows(byNameKishinev), kishinev)).toEqual(cityFactsByName(rows(byNameChisinau), CHISINAU));
    // Made up: two settlements none of whose names is ours — the search's first, though farther; no order: the nearest.
    const near = binding({ code: "RMO", city: "Q8", cityLabel: "Near", cityCoord: [28.93, 46.93] });
    const far = binding({ code: "RMO", city: "Q9", cityLabel: "Far", cityCoord: [28.83, 47.02] });
    expect(
      cityFactsByName(
        [
          { ...near, rank: rank(3) },
          { ...far, rank: rank(0) },
        ],
        kishinev,
      ).qid,
    ).toBe("Q9");
    expect(cityFactsByName([near, far], kishinev).qid).toBe("Q8");
    // Six Springfields; only Missouri's lies within 150 km of Springfield–Branson (SGF).
    const sgf = { code: "SGF", city: "Springfield", lat: 37.245667, lng: -93.388639 };
    expect(cityFactsByName(rows(byNameSpringfield), sgf)).toEqual({
      qid: "Q135615",
      files: ["ParkCentralSquarefountainbyCVBCS.jpg"],
      centre: { lat: 37.195, lng: -93.286111111 },
    });
    expect(cityFactsByName(rows(byNameSpringfield), { ...sgf, lat: 10, lng: 10 })).toEqual({
      qid: null,
      files: [],
      centre: null,
    });
    expect(cityFactsByName(rows(byNameChisinau), sgf)).toEqual({ qid: null, files: [], centre: null }); // RMO's rows
  });

  it("asks for a city by name with the name as a quoted literal", () => {
    const q = cityByNameSparql({ code: "RMO", city: "Chișinău" });
    expect(q).toContain('VALUES (?code ?name) { ("RMO" "Chișinău") }');
    expect(q).toContain('wikibase:api "EntitySearch"');
    expect(q).toContain("?rank wikibase:apiOrdinal true .");
    expect(q).toContain("wdt:P31/wdt:P279* wd:Q486972");
    expect(sparqlString('Say "hi" \\ bye')).toBe('"Say \\"hi\\" \\\\ bye"');
    expect(() => sparqlString("two\nlines")).toThrow();
    expect(() => cityByNameSparql({ code: "R1O", city: "x" })).toThrow();
  });

  it("searches a name by its words: a tab or a line break the import kept is a space, never a refused question", () => {
    // The airports' import trims a city's name but keeps a tab inside it (a made-up name).
    expect(searchName("Saint\tTown")).toBe("Saint Town");
    expect(searchName(" Saint \r\n\u0085 Town\u007f")).toBe("Saint Town");
    expect(searchName("\u0001\u0002")).toBe("");
    expect(searchName("Chișinău")).toBe("Chișinău");
    expect(cityByNameSparql({ code: "AAQ", city: "Saint\tTown" })).toContain(
      'VALUES (?code ?name) { ("AAQ" "Saint Town") }',
    );
  });

  it("reads Retry-After as seconds or a date; five minutes when it is neither; a day at most", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(retryAfterSeconds("1000", now)).toBe(1000);
    expect(retryAfterSeconds("0", now)).toBe(1);
    expect(retryAfterSeconds("Sun, 25 Oct 2026 12:02:00 GMT", now)).toBe(120);
    expect(retryAfterSeconds(null, now)).toBe(DEFAULT_RETRY_AFTER_S);
    expect(retryAfterSeconds("soon", now)).toBe(DEFAULT_RETRY_AFTER_S);
    expect(retryAfterSeconds("9999999", now)).toBe(MAX_RETRY_AFTER_S);
  });
});

describe("Commons", () => {
  const info = (o: Partial<ImageInfo> & { license?: string; artist?: string | null; restrictions?: string } = {}) => {
    const { license, artist, restrictions, ...rest } = o;
    const extmetadata: Record<string, { value: unknown }> = { LicenseShortName: { value: license ?? "CC BY-SA 4.0" } };
    if (artist !== null) extmetadata.Artist = { value: artist ?? "<a href='//x'>Jane&nbsp;Doe</a>" };
    if (restrictions) extmetadata.Restrictions = { value: restrictions };
    return {
      hero: {
        thumburl: commonsThumb("London.jpg", 1280),
        thumbwidth: 1280,
        descriptionurl: "https://commons.wikimedia.org/wiki/File:London.jpg",
        width: 4000,
        height: 2250,
        mime: "image/jpeg",
        extmetadata,
        ...rest,
      } satisfies ImageInfo,
      card: { thumburl: commonsThumb("London.jpg", 500), thumbwidth: 500 } satisfies ImageInfo,
    };
  };

  it("accepts a large landscape JPEG under a free licence, with its credit", () => {
    const { hero, card } = info();
    expect(acceptCommons(hero, card)).toEqual({
      cardUrl: commonsThumb("London.jpg", 500),
      heroUrl: commonsThumb("London.jpg", 1280),
      author: "Jane Doe",
      license: "CC BY-SA 4.0",
      link: "https://commons.wikimedia.org/wiki/File:London.jpg",
    });
    const cc0 = info({ license: "CC0", artist: null });
    expect(acceptCommons(cc0.hero, cc0.card)?.author).toBeNull();
    const de = info({ license: "CC BY-SA 3.0 de" });
    expect(acceptCommons(de.hero, de.card)?.license).toBe("CC BY-SA 3.0 de");
    const thumbHost = info({ thumburl: "https://thumb.wikimedia.org/x/1280px-London.jpg" });
    expect(acceptCommons(thumbHost.hero, thumbHost.card)?.heroUrl).toBe(
      "https://thumb.wikimedia.org/x/1280px-London.jpg",
    );
  });

  it("refuses what the app should not show", () => {
    const refused = [
      info({ mime: "image/png" }),
      info({ width: 1280, height: 720 }), // the full width would be the original
      info({ width: 2000, height: 3000 }), // portrait
      info({ width: 6000, height: 1500 }), // a panorama
      info({ license: "GFDL" }),
      info({ license: "Attribution" }),
      info({ restrictions: "personality" }),
      info({ artist: null }), // CC BY-SA without an author
      info({ thumbwidth: 960 }),
      info({ thumburl: "https://example.com/1280px-London.jpg" }),
      info({ thumburl: commonsThumb("London.jpg", 1280).replace("https:", "http:") }),
      info({ descriptionurl: "https://en.wikipedia.org/wiki/File:London.jpg" }),
    ];
    for (const { hero, card } of refused) expect(acceptCommons(hero, card)).toBeNull();
    expect(acceptCommons(undefined, info().card)).toBeNull();
    expect(acceptCommons(info().hero, undefined)).toBeNull();
  });

  it("accepts the Free Art License as CC BY-SA is accepted: with an author, never without (ADR-IMPL-064, amendment 2)", () => {
    // Commons calls it "FAL" (LicenseShortName), sometimes with its version or its full name.
    for (const license of ["FAL", "FAL 1.3", "Free Art License", "Free Art License 1.3", "free art licence 1.3"]) {
      const { hero, card } = info({ license });
      expect(acceptCommons(hero, card)).toMatchObject({ author: "Jane Doe", license });
    }
    const anonymous = info({ license: "FAL", artist: null });
    expect(acceptCommons(anonymous.hero, anonymous.card)).toBeNull();
    for (const license of ["FAL or GFDL", "Free Art", "FAL-like"]) {
      const { hero, card } = info({ license });
      expect(acceptCommons(hero, card)).toBeNull();
    }
  });

  it("refuses a TIFF even when Commons serves its thumbnails as JPEG, and PNG, SVG and GIF (amendment 3, withdrawn)", () => {
    // Shaped as Commons answers for a one-page TIFF original (25 Oct 2026): the thumbnails on its newer host, page 1, as
    // JPEG, with its tracking query. The one a site city had was a satellite image of its lagoon, not a photograph
    // taken there; the file name and the author here are made up.
    const thumb = (width: number) =>
      `https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Lagoon_from_orbit.tif/lossy-page1-${width}px-Lagoon_from_orbit.tif.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`;
    const { hero } = info({
      mime: "image/tiff",
      width: 5172,
      height: 3084,
      pagecount: 1,
      thumburl: thumb(1280),
      thumbheight: 763,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Lagoon_from_orbit.tif",
      license: "CC BY-SA 3.0 igo",
    });
    const card = { thumburl: thumb(500), thumbwidth: 500, thumbheight: 298 } satisfies ImageInfo;
    expect(acceptCommons(hero, card)).toBeNull();
    // The same answer as a JPEG would pass: the type alone refuses it.
    expect(acceptCommons({ ...hero, mime: "image/jpeg" }, card)).not.toBeNull();
    for (const mime of ["image/png", "image/gif", "image/svg+xml", undefined]) {
      const other = info({ mime });
      expect(acceptCommons(other.hero, other.card)).toBeNull();
    }
  });

  it("names a file's page, and the same thumbnail at another standard width (its host and query kept)", () => {
    expect(commonsPage("Notre-Dame de Paris (1).jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Notre-Dame_de_Paris_(1).jpg",
    );
    expect(commonsPage("Chișinău water tower.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Chi%C8%99in%C4%83u_water_tower.jpg",
    );
    expect(commonsThumbAt(commonsThumb("London.jpg", 1280), 500)).toBe(commonsThumb("London.jpg", 500));
    expect(
      commonsThumbAt(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/A_b.jpg/1280px-A_b.jpg?utm_source=commons.wikimedia.org",
        500,
      ),
    ).toBe(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/A_b.jpg/500px-A_b.jpg?utm_source=commons.wikimedia.org",
    );
    for (const url of [
      "https://upload.wikimedia.org/wikipedia/commons/6/69/A_b.jpg", // the original
      "https://example.com/wikipedia/commons/thumb/6/69/A_b.jpg/1280px-A_b.jpg", // not Wikimedia
      "http://upload.wikimedia.org/wikipedia/commons/thumb/6/69/A_b.jpg/1280px-A_b.jpg", // not https
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/A_b.tif/lossy-page1-1280px-A_b.tif.jpg", // a page
      "not a url",
    ]) {
      expect(commonsThumbAt(url, 500)).toBeNull();
    }
  });

  it("reads metadata as text: tags out, entities once, spaces collapsed, long credits cut", () => {
    const text = (value: unknown) => metadataText({ extmetadata: { Artist: { value } } }, "Artist");
    expect(text("<span>Ana &amp; <b>Ion</b></span>")).toBe("Ana & Ion");
    expect(text("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(text("Jean&#160;Dupont &#x2014; Ana&#39;s &#xD800;&#0;")).toBe("Jean Dupont — Ana's");
    expect(text("&amp;#160;")).toBe("&#160;");
    expect(text("  ")).toBeNull();
    expect(text(42)).toBe("42");
    expect(text({ a: 1 })).toBeNull();
    const long = info({ artist: "A".repeat(200) });
    const author = acceptCommons(long.hero, long.card)?.author ?? "";
    expect(author.length).toBe(80);
    expect(author.endsWith("…")).toBe(true);
  });
});

describe("Pexels", () => {
  it("takes the first landscape photo that names the city and no person", () => {
    const answer = {
      photos: [
        pexelsPhoto({ id: 1, alt: "Aerial view of Paris skyline" }),
        pexelsPhoto({ id: 2, alt: "Skyline of London at dusk", width: 3000, height: 4000 }), // portrait
        pexelsPhoto({ id: 3, alt: "Woman walking in London" }),
        pexelsPhoto({ id: 4, alt: "London skyline at dusk", photographer: "Ana Pop" }),
      ],
    };
    expect(pickPexels(answer, "London")).toEqual({
      cardUrl: "https://images.pexels.com/photos/4/pexels-photo-4.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
      heroUrl: "https://images.pexels.com/photos/4/pexels-photo-4.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      author: "Ana Pop",
      license: "Pexels License",
      link: "https://www.pexels.com/photo/4/",
    });
    expect(pickPexels({ photos: [pexelsPhoto({ id: 5, alt: "Night in Chisinau" })] }, "Chișinău")?.link).toBe(
      "https://www.pexels.com/photo/5/",
    );
    expect(pickPexels({ photos: [pexelsPhoto({ id: 6, alt: "Londonderry walls" })] }, "London")).toBeNull();
    expect(pickPexels({ photos: [] }, "London")).toBeNull();
    expect(() => pickPexels({ error: "x" }, "London")).toThrow(SourceError);
  });
});

describe("what the app receives", () => {
  const row = {
    code: "LHR",
    status: "photo" as const,
    source: "wikimedia" as const,
    cardUrl: "https://upload.wikimedia.org/c.jpg",
    heroUrl: "https://upload.wikimedia.org/h.jpg",
    author: "Jane Doe",
    license: "CC BY-SA 4.0",
    link: "https://commons.wikimedia.org/wiki/File:London.jpg",
    lat: "51.507222",
    lng: "-0.127500",
  };

  it("a photo with its credit, an operator's photo, a satellite view, nothing yet", () => {
    expect(toPlacePhotoVM(row)).toEqual({
      code: "LHR",
      kind: "photo",
      card: row.cardUrl,
      hero: row.heroUrl,
      credit: { source: "wikimedia", author: "Jane Doe", license: "CC BY-SA 4.0", link: row.link },
    });
    const club = { ...row, source: "override" as const, author: null, license: null, link: null };
    expect(toPlacePhotoVM(club)).toMatchObject({ kind: "photo", credit: null });
    expect(toPlacePhotoVM({ ...club, author: "Ion Pop" })).toMatchObject({
      credit: { source: "club", author: "Ion Pop", license: null, link: null },
    });
    const satellite = { ...row, status: "satellite" as const, source: null, cardUrl: null, heroUrl: null };
    expect(toPlacePhotoVM(satellite)).toEqual({ code: "LHR", kind: "satellite", lat: 51.507222, lng: -0.1275 });
    expect(toPlacePhotoVM({ ...satellite, status: "pending" as const, lat: null, lng: null })).toEqual({
      code: "LHR",
      kind: "none",
    });
    expect(toPlacePhotoVM({ ...row, cardUrl: null })).toEqual({ code: "LHR", kind: "none" });
  });

  it("an item an older app cannot read is dropped, never the whole answer", () => {
    const parsed = PlacePhotosVM.parse({
      items: [
        { code: "LHR", kind: "photo", card: "https://a/c.jpg", hero: "https://a/h.jpg", credit: null },
        { code: "CDG", kind: "video", url: "https://a/v.mp4" },
        { code: "ZRH", kind: "photo", card: "http://a/c.jpg", hero: "https://a/h.jpg", credit: null },
        { code: "NRT", kind: "satellite", lat: 35.7, lng: 140.4 },
        { code: "RMO", kind: "none" },
        "junk",
      ],
    });
    expect(parsed.items.map((i) => i.code)).toEqual(["LHR", "NRT", "RMO"]);
    expect(() => PlacePhotosVM.parse({ items: "x" })).toThrow();
  });
});

describe("a landmark stands in for a city without a photograph (ADR-IMPL-064, amendment 1)", () => {
  // A landmark row as resolve-place-landmarks writes it (the file and the author made up).
  const tower: LandmarkStandIn = {
    file: "Water tower from the air.jpg",
    imageUrl: commonsThumb("Water tower from the air.jpg", 1280),
    licence: "CC BY-SA 4.0",
    credit: "Ana Pop · Wikimedia Commons",
  };
  const asPhoto = {
    code: "RMO",
    kind: "photo",
    card: commonsThumb("Water tower from the air.jpg", 500),
    hero: commonsThumb("Water tower from the air.jpg", 1280),
    credit: {
      source: "wikimedia",
      author: "Ana Pop",
      license: "CC BY-SA 4.0",
      link: "https://commons.wikimedia.org/wiki/File:Water_tower_from_the_air.jpg",
    },
  } as const;

  it("its photograph as the city's photo: full width at 1280 px, the card at 500, its own credit and page", () => {
    expect(landmarkAsPhoto("RMO", tower)).toEqual(asPhoto);
    // Public domain or CC0 without an author: Commons alone.
    const cc0 = landmarkAsPhoto("RMO", { ...tower, licence: "CC0", credit: "Wikimedia Commons" });
    expect(cc0?.kind === "photo" ? cc0.credit : null).toEqual({
      ...asPhoto.credit,
      author: null,
      license: "CC0",
    });
    // An address that is no standard thumbnail: the card shows the full-width one.
    const odd = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Water_tower.jpg";
    expect(landmarkAsPhoto("RMO", { ...tower, imageUrl: odd })).toMatchObject({ card: odd, hero: odd });
    // Something the app could not read: no stand-in.
    expect(landmarkAsPhoto("RMO", { ...tower, imageUrl: "http://upload.wikimedia.org/x.jpg" })).toBeNull();
  });

  it("only where the city has its satellite view or nothing yet: any photo of its own stays first", () => {
    const commons: PlacePhotoVM = {
      code: "LHR",
      kind: "photo",
      card: "https://upload.wikimedia.org/c.jpg",
      hero: "https://upload.wikimedia.org/h.jpg",
      credit: {
        source: "wikimedia",
        author: "Jane Doe",
        license: "CC BY-SA 4.0",
        link: "https://commons.wikimedia.org/wiki/File:L.jpg",
      },
    };
    const club: PlacePhotoVM = {
      code: "ZRH",
      kind: "photo",
      card: "https://cdn.test/c.jpg",
      hero: "https://cdn.test/h.jpg",
      credit: null,
    };
    const items: PlacePhotoVM[] = [
      commons,
      club,
      { code: "RMO", kind: "satellite", lat: 47.0105, lng: 28.8638 },
      { code: "CDG", kind: "none" },
      { code: "NRT", kind: "satellite", lat: 35.7, lng: 140.4 },
    ];
    const standIns = new Map(["LHR", "ZRH", "RMO", "CDG"].map((code) => [code, tower]));
    const out = withLandmarkPhotos(items, standIns);
    expect(out).toEqual([commons, club, asPhoto, { ...asPhoto, code: "CDG" }, items[4]!]);
    expect(PlacePhotosVM.parse({ items: out }).items).toEqual(out);
    // No landmark (the flag off, none found, all kept out): the answer as it was.
    expect(withLandmarkPhotos(items, new Map())).toEqual(items);
    // A landmark the app could not read leaves the satellite view.
    const unreadable = new Map([["RMO", { ...tower, imageUrl: "http://x.test/a.jpg" }]]);
    expect(withLandmarkPhotos(items, unreadable)[2]).toEqual(items[2]!);
  });
});

describe("decidePlaces", () => {
  const london = heathrow({ night: "London at night.jpg" });
  const paris = binding({
    iata: "CDG",
    airport: "Q46400",
    airportCoord: [2.55, 49.009722],
    city: "Q90",
    cityLabel: "Paris",
    cityCoord: [2.351388888, 48.856944444],
    image: "Paris Montage.jpg",
  });

  it("a Commons photo when there is one; else the satellite view centred on the city — one question each", async () => {
    const f = fakeSources({ wikidata: [london, paris], commons: { "London at night.jpg": {} } });
    const out = await decidePlaces([LONDON, PARIS], { sources: sources(f.fetch), pexelsKey: undefined, logger: quiet });
    expect(out.get("LHR")).toMatchObject({
      kind: "photo",
      source: "wikimedia",
      photo: { heroUrl: commonsThumb("London at night.jpg", 1280), author: "Jane Doe" },
      centre: { lat: 51.507222, lng: -0.1275 },
    });
    expect(out.get("CDG")).toEqual({ kind: "satellite", centre: { lat: 48.856944444, lng: 2.351388888 } });
    expect(f.calls.map((c) => `${c.method} ${new URL(c.url).hostname}`)).toEqual([
      "POST query.wikidata.org",
      "GET commons.wikimedia.org",
      "GET commons.wikimedia.org",
    ]);
    for (const c of f.calls)
      expect(c.headers["user-agent"]).toBe("BBCClub/1.0 (https://api.example.test; place photos)");
    expect(f.calls[0]?.body).toContain("format=json");
  });

  it("no Wikidata airport near ours and no city by its name: the satellite view on our airport", async () => {
    const f = fakeSources({ wikidata: [] });
    const out = await decidePlaces([ZURICH], { sources: sources(f.fetch), pexelsKey: undefined, logger: quiet });
    expect(out.get("ZRH")).toEqual({ kind: "satellite", centre: { lat: ZURICH.lat, lng: ZURICH.lng } });
    expect(f.calls).toHaveLength(2); // the airports' question, the search by name; no file, no Commons question
    expect(new URLSearchParams(f.calls[1]?.body ?? "").get("query")).toContain('("ZRH" "Zurich")');
  });

  it("no Wikidata airport near ours: the city by its own name, with the same tiers and credit rules", async () => {
    const f = fakeSources({
      wikidata: [],
      cities: [
        binding({
          code: "ZRH",
          city: "Q72",
          cityLabel: "Zürich",
          cityCoord: [8.540556, 47.374444],
          image: "Zurich old town.jpg",
        }),
      ],
      commons: { "Zurich old town.jpg": {} },
    });
    const out = await decidePlaces([ZURICH], { sources: sources(f.fetch), pexelsKey: undefined, logger: quiet });
    expect(out.get("ZRH")).toMatchObject({
      kind: "photo",
      source: "wikimedia",
      photo: { heroUrl: commonsThumb("Zurich old town.jpg", 1280), author: "Jane Doe", license: "CC BY-SA 4.0" },
      centre: { lat: 47.374444, lng: 8.540556 },
    });

    // Two searches a run: a third city waits for the next run, its look not counted.
    const many = fakeSources({ wikidata: [] });
    const three = await decidePlaces([ZURICH, PARIS, TOKYO], {
      sources: sources(many.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect(CITY_SEARCHES_PER_RUN).toBe(2);
    expect(three.get("NRT")).toEqual({ kind: "deferred" });
    expect(many.calls).toHaveLength(1 + CITY_SEARCHES_PER_RUN);
  });

  it("a city whose name holds a control character is searched by its words; one of control characters alone, never", async () => {
    // Made-up airports and names: the import keeps a tab inside a city's name.
    const saint: Place = { code: "AAQ", city: "Saint\tTown", lat: 45, lng: 10 };
    const blank: Place = { code: "AAR", city: "\u0001", lat: 46, lng: 11 };
    const f = fakeSources({ wikidata: [london], cities: [], commons: { "London at night.jpg": {} } });
    const out = await decidePlaces([saint, blank, LONDON], {
      sources: sources(f.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect(out.get("AAQ")).toEqual({ kind: "satellite", centre: { lat: 45, lng: 10 } });
    expect(out.get("AAR")).toEqual({ kind: "satellite", centre: { lat: 46, lng: 11 } });
    expect(out.get("LHR")).toMatchObject({ kind: "photo", source: "wikimedia" });
    const searches = f.calls.filter((c) => (c.body ?? "").includes("EntitySearch"));
    expect(searches).toHaveLength(1); // AAQ's; AAR leaves nothing to search for
    expect(new URLSearchParams(searches[0]?.body ?? "").get("query")).toContain('("AAQ" "Saint Town")');
  });

  it("a search by name that fails is its own city's: the others keep their answers, the rest wait uncounted", async () => {
    const warned: object[] = [];
    // London is found by its airport; Zurich's search answers 500; Paris would need a search too.
    const f = fakeSources({ wikidata: [london], cityStatus: { ZRH: 500 }, commons: { "London at night.jpg": {} } });
    const out = await decidePlaces([LONDON, ZURICH, PARIS], {
      sources: sources(f.fetch),
      pexelsKey: undefined,
      logger: { warn: (o) => warned.push(o), error: (o) => warned.push(o) },
    });
    expect(out.get("LHR")).toMatchObject({ kind: "photo", source: "wikimedia" });
    expect(out.get("ZRH")).toEqual({ kind: "retry", stage: "wikidata" });
    expect(out.get("CDG")).toEqual({ kind: "deferred" }); // the search is not asked again this run
    expect(warned).toEqual([{ stage: "wikidata", err: "wikidata: HTTP 500" }]);
    expect(f.calls.map((c) => `${c.method} ${new URL(c.url).hostname}`)).toEqual([
      "POST query.wikidata.org",
      "POST query.wikidata.org",
      "GET commons.wikimedia.org",
      "GET commons.wikimedia.org",
    ]);

    // A 429 from a search still holds the whole run: every city waits for its Retry-After.
    const limited = fakeSources({ wikidata: [london], cityStatus: { ZRH: 429 }, retryAfter: "60" });
    const held = await decidePlaces([LONDON, ZURICH], {
      sources: sources(limited.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect([...held.values()]).toEqual([
      { kind: "deferred", afterS: 60, heldBy: "wikidata" },
      { kind: "deferred", afterS: 60, heldBy: "wikidata" },
    ]);
  });

  it("a 429 asks the club to wait: the places wait for its Retry-After, nothing is counted as failed", async () => {
    const warned: object[] = [];
    const logger = { warn: (o: object) => warned.push(o), error: (o: object) => warned.push(o) };
    const wikidata = fakeSources({ wikidata: 429, retryAfter: "1000" });
    const out = await decidePlaces([LONDON, PARIS], { sources: sources(wikidata.fetch), pexelsKey: undefined, logger });
    expect([...out.values()]).toEqual([
      { kind: "deferred", afterS: 1000, heldBy: "wikidata" },
      { kind: "deferred", afterS: 1000, heldBy: "wikidata" },
    ]);
    expect(warned).toEqual([{ stage: "wikidata", retryAfterS: 1000 }]);

    const commons = fakeSources({ wikidata: [london, paris], commons: 429, retryAfter: "57" });
    const out2 = await decidePlaces([LONDON, PARIS], {
      sources: sources(commons.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect(out2.get("LHR")).toEqual({ kind: "deferred", afterS: 57, heldBy: "commons" });
    expect(out2.get("CDG")).toMatchObject({ kind: "satellite" }); // nothing to ask Commons about
  });

  it("a source that fails leaves the places to a later run — never a downgrade", async () => {
    const down = fakeSources({ wikidata: 503 });
    const warned: object[] = [];
    const out = await decidePlaces([LONDON, PARIS], {
      sources: sources(down.fetch),
      pexelsKey: "k".repeat(56),
      logger: { warn: (o) => warned.push(o), error: (o) => warned.push(o) },
    });
    expect([...out.values()]).toEqual([
      { kind: "retry", stage: "wikidata" },
      { kind: "retry", stage: "wikidata" },
    ]);
    expect(warned).toEqual([{ stage: "wikidata", err: "wikidata: HTTP 503" }]);

    const commonsDown = fakeSources({ wikidata: [london, paris], commons: 500 });
    const out2 = await decidePlaces([LONDON, PARIS, ZURICH], {
      sources: sources(commonsDown.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect(out2.get("LHR")).toEqual({ kind: "retry", stage: "commons" });
    expect(out2.get("CDG")).toMatchObject({ kind: "satellite" }); // its only file was a montage: nothing to ask
    expect(out2.get("ZRH")).toMatchObject({ kind: "satellite" });
  });

  it("Pexels with a key: three questions a run, the rest deferred; a failure stops it for the run", async () => {
    const key = "test".repeat(10); // a stand-in, not a key
    const f = fakeSources({
      wikidata: [paris],
      pexels: {
        Paris: [pexelsPhoto({ id: 7, alt: "Paris skyline at night" })],
        Zurich: [pexelsPhoto({ id: 8, alt: "Lake in Geneva" })],
        Tokyo: [pexelsPhoto({ id: 9, alt: "Tokyo skyline" })],
      },
    });
    const out = await decidePlaces([PARIS, ZURICH, TOKYO, CHISINAU], {
      sources: sources(f.fetch),
      pexelsKey: key,
      logger: quiet,
    });
    expect(out.get("CDG")).toMatchObject({ kind: "photo", source: "pexels", photo: { license: "Pexels License" } });
    expect(out.get("ZRH")).toMatchObject({ kind: "satellite" }); // Pexels' photo is somewhere else
    expect(out.get("NRT")).toMatchObject({ kind: "photo", source: "pexels" });
    expect(out.get("RMO")).toEqual({ kind: "deferred" });
    const asked = f.calls.filter((c) => c.url.includes("pexels"));
    expect(asked).toHaveLength(PEXELS_PER_RUN);
    for (const c of asked) expect(c.headers.authorization).toBe(key);
    expect(new URL(asked[0]!.url).searchParams.get("query")).toBe("Paris skyline");

    const limited = fakeSources({ wikidata: [], pexels: { Paris: 429 } });
    const warned: object[] = [];
    const out2 = await decidePlaces([PARIS, ZURICH], {
      sources: sources(limited.fetch),
      pexelsKey: key,
      logger: { warn: (o) => warned.push(o), error: (o) => warned.push(o) },
    });
    expect([...out2.values()]).toEqual([
      { kind: "retry", stage: "pexels" },
      { kind: "retry", stage: "pexels" },
    ]);
    expect(limited.calls.filter((c) => c.url.includes("pexels"))).toHaveLength(1);
    expect(JSON.stringify(warned)).not.toContain(key);
  });

  it("Commons' own errors come with HTTP 200: still a failure, never a city without a photo", async () => {
    const answers = [
      { error: { code: "internal_api_error_DBQueryError", info: "Database query error." }, servedby: "mw1" },
      { batchcomplete: true },
    ];
    for (const commonsBody of answers) {
      const f = fakeSources({ wikidata: [london], commonsBody });
      const warned: object[] = [];
      const out = await decidePlaces([LONDON], {
        sources: sources(f.fetch),
        pexelsKey: undefined,
        logger: { warn: (o) => warned.push(o), error: (o) => warned.push(o) },
      });
      expect(out.get("LHR")).toEqual({ kind: "retry", stage: "commons" });
      expect(warned).toHaveLength(1);
    }
  });

  it("a key Pexels refuses (401): photos kept, a day of satellite view for the rest, the operator told", async () => {
    const key = "test".repeat(10); // a stand-in, not a key
    // Narita names Tokyo, which has no photo of its own; Paris and Zurich are found by name, with none either.
    const narita = binding({ iata: "NRT", airport: "Q7", airportCoord: [140.386, 35.765], city: "Q1490" });
    const f = fakeSources({ wikidata: [narita], pexels: { Paris: 401 } });
    const errors: object[] = [];
    const out = await decidePlaces([PARIS, ZURICH, TOKYO], {
      sources: sources(f.fetch),
      pexelsKey: key,
      logger: { warn: () => {}, error: (o) => errors.push(o) },
      holding: new Set(["ZRH"]), // Zurich shows a photo already
    });
    expect(out.get("CDG")).toEqual({ kind: "satellite", centre: { lat: PARIS.lat, lng: PARIS.lng }, soon: true });
    expect(out.get("ZRH")).toEqual({ kind: "retry", stage: "pexels" });
    expect(out.get("NRT")).toEqual({ kind: "satellite", centre: { lat: TOKYO.lat, lng: TOKYO.lng }, soon: true });
    expect(f.calls.filter((c) => c.url.includes("pexels"))).toHaveLength(1);
    expect(errors).toEqual([{ stage: "pexels", status: 401 }]);
    expect(JSON.stringify(errors)).not.toContain(key);
  });

  it("a 403 may come from the network in front of Pexels: down, not refused", async () => {
    const f = fakeSources({ wikidata: [], pexels: { Paris: 403 } });
    const out = await decidePlaces([PARIS, ZURICH], {
      sources: sources(f.fetch),
      pexelsKey: "test".repeat(10),
      logger: quiet,
    });
    expect([...out.values()]).toEqual([
      { kind: "retry", stage: "pexels" },
      { kind: "retry", stage: "pexels" },
    ]);
  });

  it("an airport whose code is not IATA gets its satellite view without a question", async () => {
    const f = fakeSources({});
    const out = await decidePlaces([{ code: "X1Y", city: "Nowhere", lat: 1, lng: 2 }], {
      sources: sources(f.fetch),
      pexelsKey: undefined,
      logger: quiet,
    });
    expect(out.get("X1Y")).toEqual({ kind: "satellite", centre: { lat: 1, lng: 2 } });
    expect(f.calls).toHaveLength(0);
  });

  it("no request starts that could end past the run's budget: the cities that needed one wait, uncounted", async () => {
    const key = "test".repeat(10); // a stand-in, not a key
    // The slowest run: every answer takes the eight seconds a request may (Commons' two at once, eight together).
    const slowly = (f: ReturnType<typeof fakeSources>) => {
      const clock = { now: 0 };
      const fetch: Fetch = async (url, init) => {
        clock.now += url.startsWith(COMMONS_API) ? REQUEST_TIMEOUT_MS / 2 : REQUEST_TIMEOUT_MS;
        return f.fetch(url, init);
      };
      return { clock, fetch };
    };
    const f = fakeSources({
      wikidata: [london],
      cities: [],
      pexels: { London: [pexelsPhoto({ id: 1, alt: "London skyline" })] },
    });
    const slow = slowly(f);
    const out = await decidePlaces([LONDON, ZURICH, PARIS, TOKYO], {
      sources: sources(slow.fetch),
      pexelsKey: key,
      logger: quiet,
      deadline: PLACE_PHOTOS_REQUESTS_MS,
      now: () => slow.clock.now,
    });
    // The airports' question (8 s), two searches (24 s), Commons for London's night view (32 s), one Pexels question
    // (40 s): a second would end at 48 s.
    expect(out.get("LHR")).toMatchObject({ kind: "photo", source: "pexels" });
    expect(out.get("ZRH")).toEqual({ kind: "deferred" });
    expect(out.get("CDG")).toEqual({ kind: "deferred" });
    expect(out.get("NRT")).toEqual({ kind: "deferred" }); // past the run's two searches
    expect(f.calls.filter((c) => c.url.includes("pexels"))).toHaveLength(1);
    expect(slow.clock.now).toBe(PLACE_PHOTOS_REQUESTS_MS);

    // Less time still: no Commons question (London waits for it), Zurich's search alone; Paris, past the budget, waits.
    const g = fakeSources({ wikidata: [london], cities: [] });
    const tight = slowly(g);
    const out2 = await decidePlaces([LONDON, ZURICH, PARIS], {
      sources: sources(tight.fetch),
      pexelsKey: undefined,
      logger: quiet,
      deadline: 2 * REQUEST_TIMEOUT_MS + 1,
      now: () => tight.clock.now,
    });
    expect(out2.get("LHR")).toEqual({ kind: "deferred" });
    expect(out2.get("ZRH")).toEqual({ kind: "satellite", centre: { lat: ZURICH.lat, lng: ZURICH.lng } });
    expect(out2.get("CDG")).toEqual({ kind: "deferred" });
    expect(g.calls).toHaveLength(2);

    // No time at all: nothing asked, every city waits.
    const none = fakeSources({});
    const out3 = await decidePlaces([LONDON], {
      sources: sources(none.fetch),
      pexelsKey: undefined,
      logger: quiet,
      deadline: REQUEST_TIMEOUT_MS - 1,
      now: () => 0,
    });
    expect(out3.get("LHR")).toEqual({ kind: "deferred" });
    expect(none.calls).toHaveLength(0);
  });

  it("Commons' capitalised titles still answer for the name asked", async () => {
    const f = fakeSources({
      wikidata: [heathrow({ image: "london eye at dusk.jpg" })],
      commons: { "London eye at dusk.jpg": {} },
    });
    const out = await decidePlaces([LONDON], { sources: sources(f.fetch), pexelsKey: undefined, logger: quiet });
    expect(out.get("LHR")).toMatchObject({ kind: "photo", source: "wikimedia" });
  });
});

describe("withoutOutcome — a claimed city is never left without an answer", () => {
  it("a claimed code whose airport did not come back is tried again later; codes compare trimmed, once each", () => {
    const outcomes = new Map<string, Outcome>([
      ["LHR", { kind: "satellite", centre: { lat: 51.47, lng: -0.46 } }],
      ["CDG", { kind: "deferred" }],
    ]);
    expect(withoutOutcome([{ code: "LHR" }, { code: "CDG " }, { code: "XYZ" }, { code: "XYZ " }], outcomes)).toEqual([
      "XYZ",
    ]);
    expect(withoutOutcome([{ code: "LHR" }], outcomes)).toEqual([]);
  });
});

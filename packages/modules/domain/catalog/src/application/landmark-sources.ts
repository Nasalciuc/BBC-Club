/**
 * Where a city's landmarks come from (ADR-IMPL-064, decision D7 as the evidence refined it): Wikidata's items around the
 * city's own item that are sights — tourist attractions, landmarks, museums — or heritage, ranked by how many Wikipedias
 * write about them; Wikimedia Commons says how large each one's photograph is, who took it and under which licence, and
 * serves it at 1280 px. Each function here builds a question or reads an answer — the job (place-landmarks.ts) decides
 * what to keep.
 */
import {
  HERO_WIDTH,
  askCommons,
  askSparql,
  commonsCredit,
  commonsFileName,
  isLandscape,
  metadataText,
  normalize,
  onWikimedia,
  type Binding,
  type ImageInfo,
  type SourceDeps,
} from "./place-photo-sources";

/** Items within this distance of the city item's own coordinates: 20 km keeps the Colosseum (filed under Roma
 *  Capitale, not Rome) and Buckingham Palace, and brings Versailles into Paris (18 km). */
export const LANDMARK_RADIUS_KM = 20;
/** Items the question ranks; the job judges the first `LANDMARKS_CHECKED` of them through Commons. */
export const LANDMARK_CANDIDATES = 40;
export const LANDMARKS_CHECKED = 20;
/** At most three a place, fewer when fewer qualify: nothing is ever invented. */
export const LANDMARKS_PER_PLACE = 3;
/** A landmark's photograph is at least this wide in its original. */
export const LANDMARK_MIN_WIDTH = 1600;
/** WDQS stops a question at 60 s; one city's took 3–33 s (Paris 25 s) on 25 Oct 2026. */
export const LANDMARK_QUESTION_TIMEOUT_MS = 65_000;
/** Files asked about for one city: two Commons questions (50 titles each) at most. Twenty items with a main image, a
 *  night view and an aerial view are sixty. */
export const LANDMARK_FILES_MAX = 100;
/** The metadata a landmark's photograph is judged and credited by: the city photo's, and its licence's address. */
export const LANDMARK_METADATA = "Artist|LicenseShortName|LicenseUrl|AttributionRequired|Restrictions";

const QID = /^Q[1-9]\d*$/;

/**
 * The sights around a city item, for WDQS (variant C of the evidence): items within 20 km of the city's P625 with an
 * image and at least two sitelinks; an instance of a subclass of tourist attraction (Q570116), landmark (Q2319498) or
 * museum (Q33506), or heritage-designated (P1435); not a populated place (P1082) and never the city itself; the forty
 * with the most sitelinks. Each row is one of an item's views — its main image (P18), its night view (P3451) or its
 * aerial view (P8592) — with its English name; and two rows carry the city's own photographs (`city`), which a landmark
 * may not repeat. No "subclass of administrative entity (Q56061)" exclusion (it drops the Eiffel Tower: observation
 * towers sit under it) and no P576 one (it drops Hagia Sophia, whose earlier churches were demolished). WDQS answers it
 * only with the class closures computed once (named subqueries) and its optimizer off: per-item P279* walks timed out.
 */
export function landmarkSparql(cityQid: string): string {
  if (!QID.test(cityQid)) throw new Error(`not a Wikidata item: ${cityQid}`);
  const city = `wd:${cityQid}`;
  return `SELECT ?item ?itemLabel ?sitelinks ?view ?file
WITH {
  SELECT DISTINCT ?item ?sl WHERE {
    ${city} wdt:P625 ?centre .
    SERVICE wikibase:around {
      ?item wdt:P625 ?where .
      bd:serviceParam wikibase:center ?centre ;
                      wikibase:radius "${LANDMARK_RADIUS_KM}" .
    }
    FILTER(?item != ${city})
    ?item wdt:P18 [] ;
          wikibase:sitelinks ?sl .
    FILTER(?sl >= 2)
  }
} AS %located
WITH { SELECT DISTINCT ?item ?type WHERE { INCLUDE %located . ?item wdt:P31 ?type . } } AS %typed
WITH { SELECT DISTINCT ?type WHERE { VALUES ?root { wd:Q570116 wd:Q2319498 wd:Q33506 } ?type wdt:P279* ?root . } } AS %sightClasses
WITH { SELECT DISTINCT ?item WHERE { INCLUDE %typed . INCLUDE %sightClasses . } } AS %sights
WITH { SELECT DISTINCT ?item WHERE { INCLUDE %located . ?item wdt:P1435 [] . } } AS %heritage
WITH {
  SELECT ?item (MAX(?sl) AS ?sitelinks) WHERE {
    { INCLUDE %sights . } UNION { INCLUDE %heritage . }
    INCLUDE %located .
    FILTER NOT EXISTS { ?item wdt:P1082 [] . }
  }
  GROUP BY ?item
  ORDER BY DESC(?sitelinks) ?item
  LIMIT ${LANDMARK_CANDIDATES}
} AS %ranked
WHERE {
  hint:Query hint:optimizer "None" .
  {
    INCLUDE %ranked .
    { ?item wdt:P18 ?file . BIND("image" AS ?view) }
    UNION { ?item wdt:P3451 ?file . BIND("night" AS ?view) }
    UNION { ?item wdt:P8592 ?file . BIND("aerial" AS ?view) }
    OPTIONAL { ?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) IN ("en", "mul")) }
  }
  UNION
  { ${city} wdt:P18|wdt:P3451 ?file . BIND("city" AS ?view) }
}`;
}

export function askLandmarks(deps: SourceDeps, cityQid: string): Promise<Binding[]> {
  return askSparql(deps, landmarkSparql(cityQid), LANDMARK_QUESTION_TIMEOUT_MS);
}

/** An item's views, in the order they are tried: its main images, then its night views, then its aerial views. */
const VIEW_ORDER = ["image", "night", "aerial"] as const;
type View = (typeof VIEW_ORDER)[number];

export type LandmarkCandidate = { qid: string; name: string; sitelinks: number; files: string[] };

/** Files whose name says they are not a photograph of the place: a map, a logo, a flag, a coat of arms, a plan… —
 *  the city photo's list and the words other languages use for a map or arms. */
const NOT_A_VIEW =
  /\b(montage|collage|composite|mosaic|maps?|mapa|karte|carte|flag|coat of arms|wappen|escudo|blason|stemma|logo|seal|emblem|locator|location|banner|diagram|plan)\b/;

const isView = (file: string) =>
  !/\.svg$/i.test(file) && !NOT_A_VIEW.test(normalize(file.replace(/\.[a-z0-9]+$/i, "")));

/** "London_eye.jpg" and "london eye.jpg" are one file on Commons (spaces for underscores, a capital first letter). */
export function sameFile(name: string): string {
  const spaced = name.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What MediaWiki leaves unencoded in a page's address (`wfUrlencode`) beside what `encodeURIComponent` already does. */
const WIKI_PLAIN: Record<string, string> = { "%3B": ";", "%40": "@", "%24": "$", "%2C": ",", "%2F": "/", "%3A": ":" };

/**
 * A file's own page on Commons — its author, its source and its licence — written as MediaWiki writes a page's address
 * (`https://commons.wikimedia.org/wiki/File:Gare_d%27Orsay_(1).jpg`): the page a landmark's credit links to, as the
 * city photo's credit links Commons' `descriptionurl` (ADR-IMPL-043). The table keeps the file's name, not its page.
 */
export function commonsPage(file: string): string {
  const title = encodeURIComponent(sameFile(file).replace(/ /g, "_"))
    .replace(/'/g, "%27")
    .replace(/%(3B|40|24|2C|2F|3A)/g, (code) => WIKI_PLAIN[code] ?? code);
  return `https://commons.wikimedia.org/wiki/File:${title}`;
}

const qNumber = (qid: string) => Number(qid.slice(1));

/**
 * The answer read: the city's own photographs (`cityFiles`), and its sights best first — most sitelinks, then the
 * oldest item — each with its English name (else its multilingual one) and the files worth asking Commons about, in the
 * order they are tried. Never the city's own item, an item the operator keeps out (`skip`), or one without a name.
 */
export function readLandmarks(
  bindings: readonly Binding[],
  cityQid: string,
  skip: ReadonlySet<string> = new Set(),
): { candidates: LandmarkCandidate[]; cityFiles: Set<string> } {
  const cityFiles = new Set<string>();
  type Item = { names: Map<string, string>; sitelinks: number; views: Record<View, Set<string>> };
  const items = new Map<string, Item>();
  for (const b of bindings) {
    const file = commonsFileName(b.file?.value);
    const view = b.view?.value;
    if (!file) continue;
    if (view === "city") {
      cityFiles.add(sameFile(file));
      continue;
    }
    const qid = b.item?.value.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/)?.[1];
    if (!qid || !VIEW_ORDER.includes(view as View)) continue;
    const item = items.get(qid) ?? {
      names: new Map<string, string>(),
      sitelinks: 0,
      views: { image: new Set<string>(), night: new Set<string>(), aerial: new Set<string>() },
    };
    const lang = b.itemLabel?.["xml:lang"];
    const label = b.itemLabel?.value.trim();
    if (label && typeof lang === "string" && !item.names.has(lang)) item.names.set(lang, label);
    const sitelinks = Number(b.sitelinks?.value);
    if (Number.isInteger(sitelinks)) item.sitelinks = Math.max(item.sitelinks, sitelinks);
    item.views[view as View].add(file);
    items.set(qid, item);
  }
  const candidates = [...items.entries()]
    .flatMap(([qid, item]): LandmarkCandidate[] => {
      const name = item.names.get("en") ?? item.names.get("mul");
      if (qid === cityQid || skip.has(qid) || !name) return [];
      const files = VIEW_ORDER.flatMap((view) => [...item.views[view]].sort().filter(isView));
      return [{ qid, name, sitelinks: item.sitelinks, files: [...new Set(files)] }];
    })
    .sort((a, b) => b.sitelinks - a.sitelinks || qNumber(a.qid) - qNumber(b.qid));
  return { candidates, cityFiles };
}

/** The files to ask Commons about: those of the first twenty candidates that are not the city's own, a hundred at most
 *  (best first). */
export function landmarkFiles(read: { candidates: LandmarkCandidate[]; cityFiles: ReadonlySet<string> }): string[] {
  return [
    ...new Set(
      read.candidates
        .slice(0, LANDMARKS_CHECKED)
        .flatMap((c) => c.files)
        .filter((f) => !read.cityFiles.has(sameFile(f))),
    ),
  ].slice(0, LANDMARK_FILES_MAX);
}

export function askLandmarkFiles(deps: SourceDeps, files: readonly string[]): Promise<Map<string, ImageInfo>> {
  return askCommons(deps, files, HERO_WIDTH, true, LANDMARK_METADATA);
}

/** A landmark photograph the app may show, as it is stored. */
export type LandmarkPhoto = {
  imageUrl: string;
  width: number;
  height: number;
  licence: string;
  licenceUrl: string | null;
  credit: string;
  /** The file's page on Commons: two items showing one photograph are told apart by it. */
  page: string;
};

/** A licence's address as Commons gives it, on https: Creative Commons' own pages answer both ways. */
function licenceAddress(info: ImageInfo): string | null {
  const raw = metadataText(info, "LicenseUrl");
  if (!raw) return null;
  const url = raw.replace(/^http:\/\/creativecommons\.org\//i, "https://creativecommons.org/");
  try {
    return new URL(url).protocol === "https:" && url.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}

/**
 * A Commons file a landmark may be shown with (D7 and ADR-IMPL-043): a JPEG photograph (never an SVG, a PNG map or a
 * logo), at least 1600 px wide in its original, in landscape (1.2 to 2.4 wide for 1 high, the city photo's band), its
 * 1280-px thumbnail a real one, and the city photo's credit rules — a free licence, no restrictions, an author when the
 * licence asks for one. The credit line names the author (else Commons alone) and Wikimedia Commons; the licence goes
 * beside it, linked to its page when Commons gives one.
 */
export function acceptLandmarkPhoto(info: ImageInfo | undefined): LandmarkPhoto | null {
  if (!info || info.mime !== "image/jpeg" || !info.width || !info.height) return null;
  if (info.width < LANDMARK_MIN_WIDTH || !isLandscape(info.width, info.height)) return null;
  if (info.thumbwidth !== HERO_WIDTH || !onWikimedia(info.thumburl) || !info.thumburl) return null;
  const height =
    info.thumbheight !== undefined && info.thumbheight > 0
      ? Math.round(info.thumbheight)
      : Math.round((HERO_WIDTH * info.height) / info.width);
  const credit = commonsCredit(info);
  if (!credit) return null;
  return {
    imageUrl: info.thumburl,
    width: HERO_WIDTH,
    height,
    licence: credit.license,
    licenceUrl: licenceAddress(info),
    credit: credit.author ? `${credit.author} · Wikimedia Commons` : "Wikimedia Commons",
    page: credit.link,
  };
}

export type FoundLandmark = LandmarkPhoto & { qid: string; name: string; file: string };

/**
 * At most three landmarks, best first: for each candidate among the first twenty, the first of its files — main image,
 * else night view, else aerial view — that Commons accepts and that is neither one of the city's own photographs nor
 * already another landmark's (by name or by page: a redirect is the same photograph). Fewer when fewer qualify.
 */
export function pickLandmarks(
  read: { candidates: LandmarkCandidate[]; cityFiles: ReadonlySet<string> },
  infos: ReadonlyMap<string, ImageInfo>,
): FoundLandmark[] {
  const picked: FoundLandmark[] = [];
  const usedFiles = new Set(read.cityFiles);
  const usedPages = new Set<string>();
  for (const candidate of read.candidates.slice(0, LANDMARKS_CHECKED)) {
    if (picked.length === LANDMARKS_PER_PLACE) break;
    for (const file of candidate.files) {
      if (usedFiles.has(sameFile(file))) continue;
      const photo = acceptLandmarkPhoto(infos.get(file));
      if (!photo || usedPages.has(photo.page)) continue;
      picked.push({ ...photo, qid: candidate.qid, name: candidate.name, file: sameFile(file) });
      usedFiles.add(sameFile(file));
      usedPages.add(photo.page);
      break;
    }
  }
  return picked;
}

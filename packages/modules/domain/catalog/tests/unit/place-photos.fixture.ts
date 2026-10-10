/** Wikidata, Commons and Pexels answering from fixtures (ADR-IMPL-043): the shapes their documentation gives. */
import {
  COMMONS_API,
  PEXELS_SEARCH,
  WIKIDATA_SPARQL,
  type Binding,
  type Fetch,
} from "../../src/application/place-photo-sources";

export type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };

/** One row of a SPARQL answer. Coordinates are [lng, lat], as Wikidata writes them. */
export function binding(o: {
  iata: string;
  airport: string;
  airportCoord?: [number, number];
  city?: string;
  cityLabel?: string;
  cityCoord?: [number, number];
  night?: string;
  image?: string;
}): Binding {
  const b: Binding = {
    iata: { type: "literal", value: o.iata },
    airport: { type: "uri", value: `http://www.wikidata.org/entity/${o.airport}` },
  };
  const point = ([lng, lat]: [number, number]) => ({
    type: "literal",
    datatype: "http://www.opengis.net/ont/geosparql#wktLiteral",
    value: `Point(${lng} ${lat})`,
  });
  const file = (name: string) => ({
    type: "uri",
    value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`,
  });
  if (o.airportCoord) b.airportCoord = point(o.airportCoord);
  if (o.city) b.city = { type: "uri", value: `http://www.wikidata.org/entity/${o.city}` };
  if (o.cityLabel) b.cityLabel = { type: "literal", "xml:lang": "en", value: o.cityLabel };
  if (o.cityCoord) b.cityCoord = point(o.cityCoord);
  if (o.night) b.night = file(o.night);
  if (o.image) b.image = file(o.image);
  return b;
}

/** What Commons knows about a file. Defaults: a large landscape JPEG under CC BY-SA 4.0 by "Jane Doe". */
export type CommonsFile = {
  width?: number;
  height?: number;
  mime?: string;
  license?: string;
  artist?: string | null;
  restrictions?: string;
};

const under = (name: string) => encodeURIComponent(name.replace(/ /g, "_"));

export function commonsThumb(name: string, width: number): string {
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${under(name)}/${width}px-${under(name)}`;
}

function imageinfo(name: string, f: CommonsFile, width: number, metadata: boolean) {
  const w = f.width ?? 4000;
  const h = f.height ?? 2250;
  const info: Record<string, unknown> = {
    thumburl:
      w > width ? commonsThumb(name, width) : `https://upload.wikimedia.org/wikipedia/commons/a/ab/${under(name)}`,
    thumbwidth: Math.min(w, width),
    thumbheight: Math.round((Math.min(w, width) * h) / w),
    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${under(name)}`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${under(name)}`,
  };
  if (metadata) {
    info.width = w;
    info.height = h;
    info.mime = f.mime ?? "image/jpeg";
    const ext: Record<string, { value: string; source: string }> = {
      LicenseShortName: { value: f.license ?? "CC BY-SA 4.0", source: "commons-desc-page" },
    };
    if (f.artist !== null) {
      ext.Artist = {
        value: f.artist ?? '<a href="//commons.wikimedia.org/wiki/User:Jane_Doe" title="User:Jane Doe">Jane Doe</a>',
        source: "commons-desc-page",
      };
    }
    if (f.restrictions) ext.Restrictions = { value: f.restrictions, source: "commons-desc-page" };
    info.extmetadata = ext;
  }
  return info;
}

/** A Pexels photo as the search returns it. */
export function pexelsPhoto(o: { id: number; alt: string; photographer?: string; width?: number; height?: number }) {
  const base = `https://images.pexels.com/photos/${o.id}/pexels-photo-${o.id}.jpeg`;
  return {
    id: o.id,
    width: o.width ?? 6000,
    height: o.height ?? 4000,
    url: `https://www.pexels.com/photo/${o.id}/`,
    photographer: o.photographer ?? "John Doe",
    photographer_url: "https://www.pexels.com/@john-doe",
    photographer_id: 1,
    avg_color: "#2C3E50",
    alt: o.alt,
    src: {
      original: base,
      large2x: `${base}?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940`,
      large: `${base}?auto=compress&cs=tinysrgb&h=650&w=940`,
      medium: `${base}?auto=compress&cs=tinysrgb&h=350`,
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * A fetch that answers as the three services do. A number in place of an answer is an HTTP status; `pexels` maps a city
 * to its photos (or a status); `commonsBody` is what Commons answers with HTTP 200 instead (its own errors look so).
 */
export function fakeSources(o: {
  wikidata?: Binding[] | number;
  commons?: Record<string, CommonsFile> | number;
  commonsBody?: unknown;
  pexels?: Record<string, ReturnType<typeof pexelsPhoto>[] | number>;
}) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (url === WIKIDATA_SPARQL) {
      if (typeof o.wikidata === "number") return json({ error: "x" }, o.wikidata);
      const codes = [...(new URLSearchParams(init?.body as string).get("query") ?? "").matchAll(/"([A-Z]{3})"/g)].map(
        (m) => m[1],
      );
      const bindings = (o.wikidata ?? []).filter((b) => codes.includes(b.iata?.value ?? ""));
      return json({ head: { vars: [] }, results: { bindings } });
    }
    if (url.startsWith(`${COMMONS_API}?`)) {
      if (typeof o.commons === "number") return json({ error: "x" }, o.commons);
      if (o.commonsBody !== undefined) return json(o.commonsBody);
      const known: Record<string, CommonsFile> = o.commons ?? {};
      const params = new URL(url).searchParams;
      const width = Number(params.get("iiurlwidth"));
      const metadata = (params.get("iiprop") ?? "").includes("extmetadata");
      const titles = (params.get("titles") ?? "").split("|");
      const normalized: { from: string; to: string }[] = [];
      const pages = titles.map((title) => {
        // Commons capitalises the first letter of a title.
        const to = title.replace(/^File:(.)/, (_, c: string) => `File:${c.toUpperCase()}`);
        if (to !== title) normalized.push({ from: title, to });
        const name = to.replace(/^File:/, "");
        const file = known[name];
        if (!file) return { ns: 6, title: to, missing: true };
        return { ns: 6, title: to, imagerepository: "local", imageinfo: [imageinfo(name, file, width, metadata)] };
      });
      return json({ batchcomplete: true, query: { ...(normalized.length ? { normalized } : {}), pages } });
    }
    if (url.startsWith(`${PEXELS_SEARCH}?`)) {
      const query = new URL(url).searchParams.get("query") ?? "";
      const city = query.replace(/ skyline$/, "");
      const answer = o.pexels?.[city] ?? [];
      if (typeof answer === "number") return json({ error: "x" }, answer);
      return json({ page: 1, per_page: 15, photos: answer, total_results: answer.length });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  return { fetch, calls };
}

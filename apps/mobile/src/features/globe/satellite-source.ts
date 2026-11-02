/**
 * Where the globe's satellite imagery comes from (ADR-IMPL-085): Mapbox's `satellite-v9`, asked for as tiles of the
 * style — the Static Tiles API, `styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x` — not as the raster tileset the
 * style itself names (`mapbox://mapbox.satellite`, the Raster Tiles API). The club's Mapbox account, on demo access,
 * is refused every raster tileset tile (429) and served every tile of the style (200), the same imagery. The phone
 * (MapboxGlobe.tsx), the web (MapboxGlobe.web.tsx) and the tile probe (mapbox-ready-logic.ts) all ask the same place.
 *
 * Over the imagery, as 02 draws the Earth (the owner's ask): the seas a lighter blue than the photographs' near-navy
 * water, and the clouds — one picture of the whole sky, laid on the sphere so they turn with it
 * (`assets/images/club/globe/clouds.webp`, made by `scripts/globe-clouds.py`).
 *
 * No imports from the app or @bbc/ui: the unit tests run from the repository's root (ADR-IMPL-083).
 */

const STATIC_TILES = "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512";

/** A tile of the style is 512 points across, served at twice that for the phones' screens (`@2x`). */
export const SATELLITE_TILE_SIZE = 512;

/** What the imagery's source credits — `satellite-v9`'s own (Mapbox, OpenStreetMap, Maxar), as Mapbox's terms ask. */
export const SATELLITE_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/">© Mapbox</a> ' +
  '<a href="https://www.openstreetmap.org/copyright/">© OpenStreetMap</a> ' +
  '<a href="https://www.mapbox.com/contribute/">Improve this map</a> ' +
  '<a href="https://www.maxar.com/">© Maxar</a>';

/** One tile of the imagery, or (without a tile) the template Mapbox fills in. The token is encoded, never logged. */
export function satelliteTileUrl(token: string, tile?: { z: number; x: number; y: number }): string {
  const at = tile ? `${tile.z}/${tile.x}/${tile.y}` : "{z}/{x}/{y}";
  return `${STATIC_TILES}/${at}@2x?access_token=${encodeURIComponent(token)}`;
}

/** How much of the imagery's water the lighter sea covers: enough for 02's blue, little enough to keep its shading. */
export const SEA_OPACITY = 0.8;

/** The colours the style takes from the tokens: the background's and the seas'. */
export type GlobeColours = { ocean: string; sea: string };

/** Web Mercator's last latitude: the cloud picture spans the whole map, edge to edge, pole to pole as far as it goes. */
const MERCATOR_MAX_LAT = 85.0511287798066;

/** The cloud picture's corners — top left, top right, bottom right, bottom left — as Mapbox's image source takes them. */
export const CLOUDS_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MERCATOR_MAX_LAT],
  [180, MERCATOR_MAX_LAT],
  [180, -MERCATOR_MAX_LAT],
  [-180, -MERCATOR_MAX_LAT],
];

/** The layer the clouds lie on, over the seas and under the route. */
export const CLOUDS_LAYER = { id: "clouds", above: "sea" } as const;

/**
 * The globe's style: `satellite-v9`'s two layers — its background and the imagery — with the imagery from the style's
 * tiles, then the seas, then (given the picture's URL, as on the web) the clouds. The background is the drawn globe's
 * deep ocean (ADR-IMPL-068): where a tile is missing, the sea, never near-black. The seas are Mapbox Streets' water (the
 * Vector Tiles API, served on demo access), filled with the drawn globe's ocean. The phone adds the clouds itself, as
 * an ImageSource that resolves the bundled picture (MapboxGlobe.tsx). No glyphs, no sprite: the pins and their labels
 * are the app's own views, the route a line layer added over all of it.
 */
export function satelliteStyle(token: string, colours: GlobeColours, cloudsUrl?: string) {
  return {
    version: 8 as const,
    name: "BBC Club satellite",
    sources: {
      satellite: {
        type: "raster" as const,
        tiles: [satelliteTileUrl(token)],
        tileSize: SATELLITE_TILE_SIZE,
        minzoom: 0,
        maxzoom: 22,
        attribution: SATELLITE_ATTRIBUTION,
      },
      streets: { type: "vector" as const, url: "mapbox://mapbox.mapbox-streets-v8" },
      ...(cloudsUrl ? { clouds: { type: "image" as const, url: cloudsUrl, coordinates: CLOUDS_COORDINATES } } : {}),
    },
    layers: [
      { id: "background", type: "background" as const, paint: { "background-color": colours.ocean } },
      { id: "satellite", type: "raster" as const, source: "satellite" },
      {
        id: "sea",
        type: "fill" as const,
        source: "streets",
        "source-layer": "water",
        paint: { "fill-color": colours.sea, "fill-opacity": SEA_OPACITY, "fill-antialias": false },
      },
      ...(cloudsUrl
        ? [
            {
              id: CLOUDS_LAYER.id,
              type: "raster" as const,
              source: "clouds",
              paint: { "raster-fade-duration": 0 },
            },
          ]
        : []),
    ],
  };
}

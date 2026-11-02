/**
 * Where the globe's satellite imagery comes from (ADR-IMPL-085): Mapbox's `satellite-v9`, asked for as tiles of the
 * style — the Static Tiles API, `styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x` — not as the raster tileset the
 * style itself names (`mapbox://mapbox.satellite`, the Raster Tiles API). The club's Mapbox account, on demo access,
 * is refused every raster tileset tile (429) and served every tile of the style (200), the same imagery. The phone
 * (MapboxGlobe.tsx), the web (MapboxGlobe.web.tsx) and the tile probe (mapbox-ready-logic.ts) all ask the same place.
 *
 * No imports: the unit tests run from the repository's root (ADR-IMPL-083).
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

/**
 * The globe's style: `satellite-v9`'s two layers — its background and the imagery — with the imagery from the style's
 * tiles. The background is the drawn globe's deep ocean (ADR-IMPL-068): where a tile is missing, the sea, never
 * near-black. No glyphs, no sprite: the pins and their labels are the app's own views, the route a line layer.
 */
export function satelliteStyle(token: string, ocean: string) {
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
    },
    layers: [
      { id: "background", type: "background" as const, paint: { "background-color": ocean } },
      { id: "satellite", type: "raster" as const, source: "satellite" },
    ],
  };
}

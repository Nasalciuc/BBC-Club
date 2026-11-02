import { describe, expect, it } from "bun:test";

import { SATELLITE_TILE_SIZE, satelliteStyle, satelliteTileUrl } from "./satellite-source";
import { tileProbeUrl } from "./mapbox-ready-logic";

/** Any colour: the style takes the drawn globe's ocean from the caller (tokens.colors.globeOceanDeep). */
const OCEAN = "ocean";

describe("the satellite imagery comes from the style's tiles (ADR-IMPL-085)", () => {
  it("asks the Static Tiles API for satellite-v9, never the raster tileset the account is refused", () => {
    const template = satelliteTileUrl("pk.a+b");
    expect(template).toBe(
      "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}@2x?access_token=pk.a%2Bb",
    );
    expect(template).not.toContain("/v4/");
    expect(satelliteTileUrl("pk.x", { z: 3, x: 4, y: 2 })).toBe(
      "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/3/4/2@2x?access_token=pk.x",
    );
  });

  it("the probe asks one of the map's own tiles", () => {
    const style = satelliteStyle("pk.x", OCEAN);
    const template = style.sources.satellite.tiles[0];
    expect(tileProbeUrl("pk.x")).toBe(template.replace("{z}/{x}/{y}", "0/0/0"));
  });

  it("keeps satellite-v9's two layers, the background as the drawn globe's ocean, and its credits", () => {
    const style = satelliteStyle("pk.x", OCEAN);
    expect(style.version).toBe(8);
    expect(style.layers.map((l) => `${l.id}:${l.type}`)).toEqual(["background:background", "satellite:raster"]);
    expect(style.layers[0]).toEqual({ id: "background", type: "background", paint: { "background-color": OCEAN } });
    expect(style.sources.satellite.tileSize).toBe(SATELLITE_TILE_SIZE);
    for (const credit of ["© Mapbox", "© OpenStreetMap", "© Maxar"]) {
      expect(style.sources.satellite.attribution).toContain(credit);
    }
  });
});

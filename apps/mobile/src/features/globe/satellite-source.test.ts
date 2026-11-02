import { describe, expect, it } from "bun:test";

import { tileProbeUrl } from "./mapbox-ready-logic";
import {
  CLOUDS_COORDINATES,
  CLOUDS_LAYER,
  SATELLITE_TILE_SIZE,
  SEA_OPACITY,
  satelliteStyle,
  satelliteTileUrl,
} from "./satellite-source";

/** Any colours: the style takes them from the caller (the tokens). */
const COLOURS = { ocean: "ocean", sea: "sea" };

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
    const template = satelliteStyle("pk.x", COLOURS).sources.satellite.tiles[0];
    expect(tileProbeUrl("pk.x")).toBe(template.replace("{z}/{x}/{y}", "0/0/0"));
  });

  it("keeps satellite-v9's two layers under the seas, the background as the drawn globe's ocean, and its credits", () => {
    const style = satelliteStyle("pk.x", COLOURS);
    expect(style.version).toBe(8);
    expect(style.layers.map((l) => `${l.id}:${l.type}`)).toEqual([
      "background:background",
      "satellite:raster",
      "sea:fill",
    ]);
    expect(style.layers[0]).toEqual({ id: "background", type: "background", paint: { "background-color": "ocean" } });
    expect(style.sources.satellite.tileSize).toBe(SATELLITE_TILE_SIZE);
    for (const credit of ["© Mapbox", "© OpenStreetMap", "© Maxar"]) {
      expect(style.sources.satellite.attribution).toContain(credit);
    }
  });

  it("fills Mapbox Streets' water with the sea's colour, over the imagery, keeping some of its shading", () => {
    const style = satelliteStyle("pk.x", COLOURS);
    expect(style.sources.streets).toEqual({ type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" });
    const sea = style.layers.find((l) => l.id === "sea");
    expect(sea).toMatchObject({ source: "streets", "source-layer": "water", paint: { "fill-color": "sea" } });
    expect(SEA_OPACITY).toBeGreaterThan(0.5);
    expect(SEA_OPACITY).toBeLessThan(1);
  });
});

describe("the clouds: one picture of the whole sky, on the sphere (ADR-IMPL-085)", () => {
  it("spans Web Mercator's whole map, corner to corner, as Mapbox's image source takes it", () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = CLOUDS_COORDINATES;
    expect(topLeft[0]).toBe(-180);
    expect(topRight[0]).toBe(180);
    expect(bottomRight).toEqual([180, -topLeft[1]]);
    expect(bottomLeft).toEqual([-180, -topLeft[1]]);
    expect(topLeft[1]).toBeCloseTo(85.0511, 4);
  });

  it("on the web the style carries the picture over the seas; on the phone the map adds it there itself", () => {
    const web = satelliteStyle("pk.x", COLOURS, "/assets/clouds.webp");
    expect(web.sources).toMatchObject({
      clouds: { type: "image", url: "/assets/clouds.webp", coordinates: CLOUDS_COORDINATES },
    });
    expect(web.layers.map((l) => l.id)).toEqual(["background", "satellite", CLOUDS_LAYER.above, CLOUDS_LAYER.id]);
    const phone = satelliteStyle("pk.x", COLOURS);
    expect("clouds" in phone.sources).toBe(false);
    expect(phone.layers.map((l) => l.id)).toContain(CLOUDS_LAYER.above);
  });
});

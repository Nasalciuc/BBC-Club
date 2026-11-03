import { describe, expect, it } from "bun:test";

import { tileProbeUrl } from "./mapbox-ready-logic";
import { cloudLayers } from "./cloud-drift";
import {
  CLOUDS_ABOVE,
  SATELLITE_PAINT,
  SATELLITE_TILE_SIZE,
  satelliteStyle,
  satelliteTileUrl,
} from "./satellite-source";

/** Any colours: the style takes them from the caller (the tokens). */
const COLOURS = { ocean: "ocean" };

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

  it("keeps satellite-v9's two layers, the background as the drawn globe's ocean, the imagery livelier", () => {
    const style = satelliteStyle("pk.x", COLOURS);
    expect(style.version).toBe(8);
    expect(style.layers.map((l) => `${l.id}:${l.type}`)).toEqual(["background:background", "satellite:raster"]);
    expect(style.layers[0]).toEqual({ id: "background", type: "background", paint: { "background-color": "ocean" } });
    expect(style.layers[1]).toMatchObject({ paint: SATELLITE_PAINT });
    expect(SATELLITE_PAINT["raster-saturation"]).toBeGreaterThan(0);
    expect(style.sources.satellite.tileSize).toBe(SATELLITE_TILE_SIZE);
    for (const credit of ["© Mapbox", "© OpenStreetMap", "© Maxar"]) {
      expect(style.sources.satellite.attribution).toContain(credit);
    }
  });
});

describe("the clouds in the style (ADR-IMPL-085)", () => {
  it("on the web the style carries every cloud picture over the imagery, where it lies and how much it shows", () => {
    const clouds = cloudLayers(0).map((c) => ({ ...c, url: `/assets/${c.id}.webp` }));
    const web = satelliteStyle("pk.x", COLOURS, clouds);
    for (const c of clouds) {
      expect(web.sources).toMatchObject({ [c.id]: { type: "image", url: c.url, coordinates: c.coordinates } });
    }
    const ids = web.layers.map((l) => l.id);
    expect(ids.slice(0, 2)).toEqual(["background", CLOUDS_ABOVE]);
    expect(ids.slice(2)).toEqual(clouds.map((c) => c.id));
    expect(web.layers[2]).toMatchObject({ type: "raster", paint: { "raster-opacity": clouds[0].opacity } });
  });

  it("on the phone the style has none: the map adds them over the imagery itself", () => {
    const phone = satelliteStyle("pk.x", COLOURS);
    expect(Object.keys(phone.sources)).toEqual(["satellite"]);
    expect(phone.layers.map((l) => l.id)).toContain(CLOUDS_ABOVE);
  });
});

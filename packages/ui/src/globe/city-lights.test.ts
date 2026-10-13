import { describe, expect, it } from "bun:test";

import { CITY_LIGHTS, cityLightFeatures } from "./city-lights";
import data from "./city-lights/places.json";

describe("city lights data", () => {
  it("is Natural Earth's places of 100,000 people or more, largest first", () => {
    expect(data.source).toContain("Natural Earth v5.1.2");
    expect(data.minPopulation).toBe(100_000);
    expect(data.places).toHaveLength(3089);
    const sizes = data.places.map((p) => p[2]!);
    expect(sizes.every((p, i) => i === 0 || p <= sizes[i - 1]!)).toBe(true);
    expect(Math.min(...sizes)).toBe(0);
    for (const [lng = NaN, lat = NaN] of data.places) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });

  it("has the cities a member flies to", () => {
    const near = (lng: number, lat: number) =>
      data.places.some(([x = 0, y = 0]) => Math.abs(x - lng) < 0.3 && Math.abs(y - lat) < 0.3);
    expect(near(-0.12, 51.5)).toBe(true); // London
    expect(near(-74.0, 40.72)).toBe(true); // New York
    expect(near(55.3, 25.25)).toBe(true); // Dubai
    expect(near(139.75, 35.69)).toBe(true); // Tokyo
    expect(near(28.86, 47.0)).toBe(true); // Chișinău
  });
});

describe("cityLightFeatures", () => {
  it("carries what the dusk needs and a light that grows with the city, within its bounds", () => {
    const fc = cityLightFeatures();
    expect(fc.features).toHaveLength(data.places.length);
    const tokyo = fc.features[0]!;
    expect(tokyo.geometry.coordinates).toEqual([139.75, 35.69]);
    expect(tokyo.properties.s).toBeCloseTo(Math.sin((35.69 * Math.PI) / 180), 4);
    expect(tokyo.properties.c).toBeCloseTo(Math.cos((35.69 * Math.PI) / 180), 4);
    expect(tokyo.properties.l).toBeCloseTo((139.75 * Math.PI) / 180, 4);
    expect(tokyo.properties.w).toBe(CITY_LIGHTS.weight.max);
    expect(tokyo.properties.r).toBe(CITY_LIGHTS.radius.max);
    const smallest = fc.features.at(-1)!;
    expect(smallest.properties.w).toBe(CITY_LIGHTS.weight.min);
    expect(smallest.properties.r).toBe(CITY_LIGHTS.radius.min);
  });

  it("is built once: the map gets the same object on every render", () => {
    expect(cityLightFeatures()).toBe(cityLightFeatures());
  });
});

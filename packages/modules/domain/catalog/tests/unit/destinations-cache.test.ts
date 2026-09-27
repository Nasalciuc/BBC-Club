import { expect, test } from "bun:test";
import { createDestinationsCache } from "../../src/application/destinations-cache";
import type { DestinationPin } from "../../src/api";

const pin = (code: string, fromPrice: number): DestinationPin => ({
  code,
  name: code,
  city: code,
  countryCode: "US",
  region: "americas",
  lat: 0,
  lng: 0,
  fromPrice,
});

test("two concurrent misses call load once", async () => {
  const cache = createDestinationsCache();
  let calls = 0;
  const load = () => {
    calls++;
    return new Promise<DestinationPin[]>((resolve) => setTimeout(() => resolve([pin("LHR", 4200)]), 20));
  };
  const [a, b] = await Promise.all([cache.get("jfk", load), cache.get("JFK", load)]);
  expect(calls).toBe(1);
  expect(a).toEqual(b);
  expect(await cache.get("jfk", load)).toEqual([pin("LHR", 4200)]);
  expect(calls).toBe(1);
});

test("clear drops the cached value", async () => {
  const cache = createDestinationsCache();
  let price = 4200;
  const load = async () => [pin("LHR", price)];
  expect((await cache.get("JFK", load))[0]?.fromPrice).toBe(4200);
  price = 1000;
  expect((await cache.get("JFK", load))[0]?.fromPrice).toBe(4200);
  cache.clear();
  expect((await cache.get("JFK", load))[0]?.fromPrice).toBe(1000);
});

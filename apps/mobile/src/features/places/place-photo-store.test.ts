import { describe, expect, it } from "bun:test";
import type { PlacePhotoVM } from "@bbc/shared/api/v1/places";

import { FRESH_MS, POLL_MS, createPlacePhotoStore, isFresh, photoIn, type PhotoAnswer } from "./place-photo-store";

const photo = (code: string): PlacePhotoVM => ({
  code,
  kind: "photo",
  card: `https://images.pexels.com/${code}-card.jpeg`,
  hero: `https://images.pexels.com/${code}-hero.jpeg`,
  credit: null,
});
const none = (code: string): PlacePhotoVM => ({ code, kind: "none" });

/** A server that answers from a table, and the questions it was asked. */
function server(table: Record<string, PlacePhotoVM>, opts: { fail?: boolean; latency?: () => void } = {}) {
  const asked: string[][] = [];
  const ask = async (codes: string[]): Promise<PhotoAnswer> => {
    asked.push(codes);
    opts.latency?.();
    if (opts.fail) return { ok: false };
    return { ok: true, data: codes.flatMap((c) => (table[c] ? [table[c]] : [])) };
  };
  return { ask, asked };
}

describe("isFresh", () => {
  it("a photo for twelve hours, a city not looked up yet until the next look, a code left out for an hour", () => {
    const at = 1_000_000;
    expect(isFresh(undefined, at)).toBe(false);
    expect(isFresh({ vm: photo("LHR"), at }, at + FRESH_MS.found - 1)).toBe(true);
    expect(isFresh({ vm: photo("LHR"), at }, at + FRESH_MS.found)).toBe(false);
    expect(isFresh({ vm: none("LHR"), at }, at + FRESH_MS.pending - 1)).toBe(true);
    expect(isFresh({ vm: none("LHR"), at }, at + FRESH_MS.pending)).toBe(false);
    expect(isFresh({ vm: null, at }, at + FRESH_MS.unknown - 1)).toBe(true);
    expect(isFresh({ vm: null, at }, at + FRESH_MS.unknown)).toBe(false);
    expect(FRESH_MS.pending).toBeLessThan(POLL_MS); // each look finds it due
  });
});

describe("the photo store", () => {
  it("asks once for the cities it does not know, upper-cased, IATA only; then answers from memory", async () => {
    let now = 0;
    const s = server({ LHR: photo("LHR"), CDG: none("CDG") });
    const store = createPlacePhotoStore(s.ask, () => now);
    let told = 0;
    store.subscribe(() => (told += 1));

    await store.want(["lhr", "CDG", "LHR", "QQQ", "L1R", ""]);
    expect(s.asked).toEqual([["LHR", "CDG", "QQQ"]]);
    expect(photoIn(store.snapshot(), "lhr")).toEqual(photo("LHR"));
    expect(photoIn(store.snapshot(), "CDG")).toEqual(none("CDG"));
    expect(photoIn(store.snapshot(), "QQQ")).toBeUndefined(); // left out by the server
    expect(photoIn(store.snapshot(), null)).toBeUndefined();
    expect(told).toBe(1);

    await store.want(["LHR", "CDG", "QQQ"]);
    expect(s.asked).toHaveLength(1);

    // At the next look, only the city the server had not looked up is asked again.
    now = POLL_MS;
    await store.want(["LHR", "CDG", "QQQ"]);
    expect(s.asked[1]).toEqual(["CDG"]);
  });

  it("dates what it learns from the question, so a slow answer is not fresh at the next look", async () => {
    let now = 0;
    const s = server({ CDG: none("CDG") }, { latency: () => (now += 5_000) });
    const store = createPlacePhotoStore(s.ask, () => now);
    await store.want(["CDG"]);
    now = POLL_MS;
    await store.want(["CDG"]);
    expect(s.asked).toEqual([["CDG"], ["CDG"]]);
  });

  it("a new snapshot on each answer, the same one otherwise", async () => {
    const s = server({ LHR: photo("LHR") });
    const store = createPlacePhotoStore(s.ask, () => 0);
    const before = store.snapshot();
    expect(store.snapshot()).toBe(before);
    await store.want(["LHR"]);
    const after = store.snapshot();
    expect(after).not.toBe(before);
    expect(before.size).toBe(0); // an old snapshot never changes
    await store.want(["LHR"]); // fresh: nothing asked, nothing replaced
    expect(store.snapshot()).toBe(after);
  });

  it("twenty codes a question", async () => {
    const codes = Array.from(
      { length: 45 },
      (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`,
    );
    const s = server({});
    const store = createPlacePhotoStore(s.ask, () => 0);
    await store.want(codes);
    expect(s.asked.map((q) => q.length)).toEqual([20, 20, 5]);
  });

  it("a failed question changes nothing and tells no one; the next one asks again", async () => {
    const down = server({ LHR: photo("LHR") }, { fail: true });
    const store = createPlacePhotoStore(down.ask, () => 0);
    const before = store.snapshot();
    let told = 0;
    store.subscribe(() => (told += 1));
    await store.want(["LHR"]);
    expect(store.snapshot()).toBe(before);
    expect(told).toBe(0);
    await store.want(["LHR"]);
    expect(down.asked).toEqual([["LHR"], ["LHR"]]);
  });

  it("a city already being asked about is not asked twice; a listener that left hears nothing", async () => {
    const answers: ((a: PhotoAnswer) => void)[] = [];
    const asked: string[][] = [];
    const store = createPlacePhotoStore(
      (codes) =>
        new Promise<PhotoAnswer>((resolve) => {
          asked.push(codes);
          answers.push(resolve);
        }),
      () => 0,
    );
    let told = 0;
    const leave = store.subscribe(() => (told += 1));
    const first = store.want(["LHR", "CDG"]);
    const second = store.want(["LHR", "CDG", "ZRH"]);
    expect(asked).toEqual([["LHR", "CDG"], ["ZRH"]]);
    leave();
    answers[0]?.({ ok: true, data: [photo("LHR")] });
    answers[1]?.({ ok: true, data: [] });
    await Promise.all([first, second]);
    expect(photoIn(store.snapshot(), "LHR")).toEqual(photo("LHR"));
    expect(told).toBe(0);
  });
});

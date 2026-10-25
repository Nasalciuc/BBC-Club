import { beforeEach, describe, expect, it } from "bun:test";

import {
  REPROBE_MIN_GAP_MS,
  TILE_PROBE_TIMEOUT_MS,
  cameBack,
  probeSatelliteTile,
  readTileProbe,
  resetTileProbe,
  satelliteTileProbe,
  shouldReprobe,
  shouldShowMapbox,
  tileProbeUrl,
} from "./mapbox-ready-logic";

const answer = (status: number, type: string | null) => ({
  status,
  headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? type : null) },
});

beforeEach(() => resetTileProbe());

describe("the satellite globe fades in only over imagery (F107)", () => {
  it("a style that loaded but whose imagery never came keeps the drawn globe — never a black sphere", () => {
    expect(shouldShowMapbox({ styleLoaded: true, tileProbe: "failed" })).toBe(false);
    expect(shouldShowMapbox({ styleLoaded: true, tileProbe: "pending" })).toBe(false);
    expect(shouldShowMapbox({ styleLoaded: false, tileProbe: "ok" })).toBe(false);
    expect(shouldShowMapbox({ styleLoaded: true, tileProbe: "ok" })).toBe(true);
  });

  it("a tile answers 200 with an image, or it failed", () => {
    expect(readTileProbe(answer(200, "image/jpeg"))).toBe("ok");
    expect(readTileProbe(answer(200, "image/webp; charset=binary"))).toBe("ok");
    expect(readTileProbe(answer(401, "application/json"))).toBe("failed");
    expect(readTileProbe(answer(200, "application/json"))).toBe("failed");
    expect(readTileProbe(answer(200, null))).toBe("failed");
  });

  it("asks for one tile of the satellite raster with the token, encoded", () => {
    expect(tileProbeUrl("pk.a+b")).toBe(
      "https://api.mapbox.com/v4/mapbox.satellite/0/0/0@2x.jpg90?access_token=pk.a%2Bb",
    );
  });

  it("a timeout, a network error or no token is a failed probe", async () => {
    expect(TILE_PROBE_TIMEOUT_MS).toBe(5000);
    const hang = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await probeSatelliteTile("pk.x", { fetch: hang, timeoutMs: 10 })).toBe("failed");
    const offline = () => Promise.reject(new TypeError("Network request failed"));
    expect(await probeSatelliteTile("pk.x", { fetch: offline })).toBe("failed");
    expect(await probeSatelliteTile(undefined, { fetch: async () => answer(200, "image/jpeg") })).toBe("failed");
    expect(await probeSatelliteTile("pk.x", { fetch: async () => answer(200, "image/jpeg") })).toBe("ok");
  });

  it("asks once per session, however many globes mount", async () => {
    let asked = 0;
    const fetch = async () => {
      asked += 1;
      return answer(200, "image/jpeg");
    };
    const [a, b] = await Promise.all([satelliteTileProbe("pk.x", { fetch }), satelliteTileProbe("pk.x", { fetch })]);
    expect([a, b]).toEqual(["ok", "ok"]);
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("ok");
    expect(asked).toBe(1);
  });
});

describe("the imagery is asked again on return and on reconnect (ADR-IMPL-068)", () => {
  it("the app coming back to the foreground, or the phone back online, is a reason; nothing else is", () => {
    const at = (active: boolean, offline: boolean) => ({ active, offline });
    expect(cameBack(at(false, false), at(true, false))).toBe("foreground");
    expect(cameBack(at(true, true), at(true, false))).toBe("online");
    expect(cameBack(at(true, false), at(true, true))).toBeNull(); // going offline: nothing to ask
    expect(cameBack(at(true, false), at(false, false))).toBeNull(); // leaving
    expect(cameBack(at(true, false), at(true, false))).toBeNull();
  });

  it("only while the satellite globe is shown and has not failed, at most once a minute", () => {
    const base = { came: "foreground" as const, mapboxShown: true, failed: false, lastAskedAt: null, now: 100_000 };
    expect(shouldReprobe(base)).toBe(true);
    expect(shouldReprobe({ ...base, came: null })).toBe(false);
    expect(shouldReprobe({ ...base, mapboxShown: false })).toBe(false); // the drawn globe stands: no black sphere
    expect(shouldReprobe({ ...base, failed: true })).toBe(false); // handed back for the session
    expect(shouldReprobe({ ...base, lastAskedAt: base.now - REPROBE_MIN_GAP_MS + 1 })).toBe(false);
    expect(shouldReprobe({ ...base, came: "online", lastAskedAt: base.now - REPROBE_MIN_GAP_MS })).toBe(true);
  });

  it("asked again, the answer replaces the session's", async () => {
    let tile = answer(200, "image/jpeg");
    let asked = 0;
    const fetch = async () => {
      asked += 1;
      return tile;
    };
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("ok");
    tile = answer(401, "application/json"); // the token revoked meanwhile
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("ok"); // the session's answer
    expect(await satelliteTileProbe("pk.x", { fetch }, { fresh: true })).toBe("failed");
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("failed");
    expect(asked).toBe(2);
  });
});

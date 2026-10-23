import { beforeEach, describe, expect, it } from "bun:test";

import {
  TILE_PROBE_TIMEOUT_MS,
  probeSatelliteTile,
  readTileProbe,
  resetTileProbe,
  satelliteTileProbe,
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

import { beforeEach, describe, expect, it } from "bun:test";

import {
  REPROBE_MIN_GAP_MS,
  TILE_PROBE_TIMEOUT_MS,
  cameBack,
  probeSatelliteTile,
  readReprobe,
  readTileProbe,
  reprobeSatelliteTile,
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

  it("only while the satellite globe is shown, online and not handed back, at most once a minute", () => {
    const base = {
      came: "foreground" as const,
      offline: false,
      mapboxShown: true,
      failed: false,
      lastAskedAt: null,
      now: 100_000,
    };
    expect(shouldReprobe(base)).toBe(true);
    expect(shouldReprobe({ ...base, came: null })).toBe(false);
    expect(shouldReprobe({ ...base, mapboxShown: false })).toBe(false); // the drawn globe stands: no black sphere
    expect(shouldReprobe({ ...base, failed: true })).toBe(false); // handed back for the session
    expect(shouldReprobe({ ...base, lastAskedAt: base.now - REPROBE_MIN_GAP_MS + 1 })).toBe(false);
    expect(shouldReprobe({ ...base, came: "online", lastAskedAt: base.now - REPROBE_MIN_GAP_MS })).toBe(true);
  });

  it("back in the foreground while offline asks nothing; coming back online then does", () => {
    // The member opens the app on the subway: it comes to the foreground, the phone still offline.
    const offlineReturn = cameBack({ active: false, offline: true }, { active: true, offline: true });
    expect(offlineReturn).toBe("foreground");
    const state = { offline: true, mapboxShown: true, failed: false, lastAskedAt: null, now: 100_000 };
    expect(shouldReprobe({ ...state, came: offlineReturn })).toBe(false);
    // The train surfaces: online again, nothing asked meanwhile — the question goes now.
    const online = cameBack({ active: true, offline: true }, { active: true, offline: false });
    expect(online).toBe("online");
    expect(shouldReprobe({ ...state, offline: false, came: online, now: 110_000 })).toBe(true);
  });

  it("asked again: only Mapbox refusing the token is a refusal; no answer, or another, is nothing learnt", () => {
    expect(readReprobe(answer(200, "image/jpeg"))).toBe("ok");
    expect(readReprobe(answer(401, "application/json"))).toBe("refused");
    expect(readReprobe(answer(403, "application/json"))).toBe("refused");
    expect(readReprobe(answer(503, "text/plain"))).toBe("unknown"); // the server's own trouble
    expect(readReprobe(answer(429, "application/json"))).toBe("unknown");
    expect(readReprobe(answer(200, "text/html"))).toBe("unknown"); // a captive portal's page
  });

  it("asked again, a refusal replaces the session's answer; no answer leaves it — the satellite globe stays", async () => {
    let tile: ReturnType<typeof answer> | null = answer(200, "image/jpeg");
    let asked = 0;
    const fetch = async () => {
      asked += 1;
      if (!tile) throw new TypeError("Network request failed");
      return tile;
    };
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("ok");
    // Offline, or a timeout: nothing learnt, and a globe mounted later still finds the session's answer.
    tile = null;
    expect(await reprobeSatelliteTile("pk.x", { fetch })).toBe("unknown");
    const hang = (_url: string, init: { signal: AbortSignal }) =>
      new Promise<never>((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await reprobeSatelliteTile("pk.x", { fetch: hang, timeoutMs: 10 })).toBe("unknown");
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("ok");
    // The token revoked meanwhile: refused, and the session's answer with it.
    tile = answer(401, "application/json");
    expect(await reprobeSatelliteTile("pk.x", { fetch })).toBe("refused");
    expect(await satelliteTileProbe("pk.x", { fetch })).toBe("failed");
    expect(asked).toBe(3);
  });
});

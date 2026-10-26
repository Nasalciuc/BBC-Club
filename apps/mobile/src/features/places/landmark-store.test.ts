import { describe, expect, it } from "bun:test";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

import { landmarkTiles } from "./landmark-logic";
import {
  LANDMARKS_FRESH_MS,
  createLandmarkStore,
  createLoadFailures,
  landmarksAnswerOf,
  landmarksIn,
  type LandmarksAnswer,
} from "./landmark-store";

// Made-up files, authors and tags.
const tower: LandmarkVM = {
  name: "Eiffel Tower",
  imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tower.jpg/1280px-Tower.jpg",
  width: 1280,
  height: 853,
  credit: { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0" },
};
const louvre: LandmarkVM = { ...tower, name: "Louvre", imageUrl: tower.imageUrl.replaceAll("Tower", "Louvre") };

function harness(answers: LandmarksAnswer[]) {
  let t = 1_000_000;
  const asked: { code: string; etag: string | null }[] = [];
  const store = createLandmarkStore(
    async (code, etag) => {
      asked.push({ code, etag });
      const answer = answers.shift();
      if (!answer) throw new Error("no answer left");
      return answer;
    },
    () => t,
  );
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  return {
    store,
    asked,
    notified: () => notified,
    later: (ms: number) => {
      t += ms;
    },
  };
}

const found = (landmarks: LandmarkVM[], etag: string | null = '"a"'): LandmarksAnswer => ({
  ok: true,
  notModified: false,
  landmarks,
  etag,
});

describe("the landmark store", () => {
  it("asks once, then again with its ETag only once the landmarks have aged; a 304 changes nothing on screen", async () => {
    const h = harness([found([tower, louvre]), { ok: true, notModified: true, etag: '"a"' }]);
    await h.store.want("cdg");
    expect(h.asked).toEqual([{ code: "CDG", etag: null }]);
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([tower, louvre]);
    expect(h.notified()).toBe(1);

    const shown = h.store.snapshot();
    h.later(LANDMARKS_FRESH_MS.found - 1);
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(1);

    h.later(1);
    await h.store.want("CDG");
    expect(h.asked[1]).toEqual({ code: "CDG", etag: '"a"' });
    expect(h.store.snapshot()).toBe(shown);
    expect(h.notified()).toBe(1);

    // Fresh again from the 304.
    h.later(LANDMARKS_FRESH_MS.found - 1);
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(2);
  });

  it("none yet is asked about again after five minutes, and shows what comes", async () => {
    const h = harness([found([], '"e"'), found([louvre], '"b"')]);
    await h.store.want("CDG");
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([]);
    h.later(LANDMARKS_FRESH_MS.none - 1);
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(1);
    h.later(1);
    await h.store.want("CDG");
    expect(h.asked[1]?.etag).toBe('"e"');
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([louvre]);
    expect(h.notified()).toBe(2);
  });

  it("a new answer showing the same landmarks leaves the screen alone", async () => {
    const h = harness([found([tower], '"a"'), found([{ ...tower }], '"a2"')]);
    await h.store.want("CDG");
    const shown = h.store.snapshot();
    h.later(LANDMARKS_FRESH_MS.found);
    await h.store.want("CDG");
    expect(h.store.snapshot()).toBe(shown);
    expect(h.notified()).toBe(1);
  });

  it("a failed question changes nothing and the next view asks again", async () => {
    const h = harness([found([tower]), { ok: false, reason: "failed" }, { ok: false, reason: "failed" }]);
    await h.store.want("CDG");
    h.later(LANDMARKS_FRESH_MS.found);
    await h.store.want("CDG");
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(3);
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([tower]);
    expect(h.notified()).toBe(1);
  });

  it("no such airport, or an answer it cannot read: nothing shown, not asked again for an hour", async () => {
    const h = harness([found([tower]), { ok: false, reason: "unreadable" }, { ok: false, reason: "unknown" }]);
    await h.store.want("CDG");
    h.later(LANDMARKS_FRESH_MS.found);
    await h.store.want("CDG");
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([]);
    h.later(LANDMARKS_FRESH_MS.unknown - 1);
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(2);
    h.later(1);
    await h.store.want("CDG");
    // Asked without an ETag: the unreadable answer's tag is not kept.
    expect(h.asked[2]).toEqual({ code: "CDG", etag: null });
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([]);
  });

  it("one question at a time for a city; nothing for what is not a code", async () => {
    const h = harness([found([tower])]);
    await Promise.all([h.store.want("CDG"), h.store.want("cdg"), h.store.want(" CDG ")]);
    await h.store.want("");
    await h.store.want("PARIS");
    expect(h.asked).toEqual([{ code: "CDG", etag: null }]);
  });

  it("a 304 to a question without an ETag tells nothing", async () => {
    const h = harness([{ ok: true, notModified: true, etag: '"a"' }, found([tower])]);
    await h.store.want("CDG");
    await h.store.want("CDG");
    expect(h.asked).toHaveLength(2);
    expect(landmarksIn(h.store.snapshot(), "CDG")).toEqual([tower]);
  });

  it("reads a city's landmarks by its code in any case; none for a city not asked about", async () => {
    const h = harness([found([tower])]);
    await h.store.want("CDG");
    expect(landmarksIn(h.store.snapshot(), " cdg ")).toEqual([tower]);
    expect(landmarksIn(h.store.snapshot(), "LHR")).toEqual([]);
    expect(landmarksIn(h.store.snapshot(), null)).toEqual([]);
    // The same empty list each time, so a screen that reads none twice draws nothing new.
    expect(landmarksIn(h.store.snapshot(), "LHR")).toBe(landmarksIn(h.store.snapshot(), undefined));
  });
});

describe("landmarksAnswerOf — the API's answer as the store reads it", () => {
  it("passes an answer through; 404 is no airport; a body it cannot read; anything else failed", () => {
    expect(landmarksAnswerOf({ ok: true, data: { notModified: true, etag: '"a"' } })).toEqual({
      ok: true,
      notModified: true,
      etag: '"a"',
    });
    expect(landmarksAnswerOf({ ok: true, data: { notModified: false, landmarks: [tower], etag: null } })).toEqual(
      found([tower], null),
    );
    expect(landmarksAnswerOf({ ok: false, status: 404, code: "NOT_FOUND" })).toEqual({ ok: false, reason: "unknown" });
    expect(landmarksAnswerOf({ ok: false, status: 500, code: "VALIDATION" })).toEqual({
      ok: false,
      reason: "unreadable",
    });
    for (const status of [0, 429, 500, 503]) {
      expect(landmarksAnswerOf({ ok: false, status, code: status === 0 ? "OFFLINE" : "RATE_LIMITED" })).toEqual({
        ok: false,
        reason: "failed",
      });
    }
  });
});

describe("createLoadFailures — a photograph that would not load is never left out for good", () => {
  const tiles = (failed: ReadonlySet<string>) =>
    landmarkTiles([tower, louvre], { headers: {}, photoHeight: 118, failed }).map((t) => t.name);

  it("leaves a photograph out, with its name and credit, until the photographs are tried again", () => {
    const loads = createLoadFailures();
    let notified = 0;
    loads.subscribe(() => {
      notified += 1;
    });
    const none = loads.snapshot();
    expect(tiles(none)).toEqual(["Eiffel Tower", "Louvre"]);

    // Wikimedia timed out on the tower's photograph (a weak connection, a 429): the tower leaves the row.
    loads.fail(tower.imageUrl);
    expect(tiles(loads.snapshot())).toEqual(["Louvre"]);
    // Failing again changes nothing: the same snapshot, no new render.
    const once = loads.snapshot();
    loads.fail(tower.imageUrl);
    expect(loads.snapshot()).toBe(once);
    expect(notified).toBe(1);

    // The screen back in view, or the phone back online: the tower is tried again; failing again, it leaves again.
    loads.retry();
    expect(tiles(loads.snapshot())).toEqual(["Eiffel Tower", "Louvre"]);
    expect(notified).toBe(2);
    loads.fail(tower.imageUrl);
    expect(tiles(loads.snapshot())).toEqual(["Louvre"]);

    // Nothing left out: trying again changes nothing.
    loads.retry();
    const cleared = loads.snapshot();
    loads.retry();
    expect(loads.snapshot()).toBe(cleared);
    expect(notified).toBe(4);
  });

  it("stops telling a screen that has gone", () => {
    const loads = createLoadFailures();
    let notified = 0;
    const stop = loads.subscribe(() => {
      notified += 1;
    });
    stop();
    loads.fail(louvre.imageUrl);
    expect(notified).toBe(0);
    expect(loads.snapshot().has(louvre.imageUrl)).toBe(true);
  });
});

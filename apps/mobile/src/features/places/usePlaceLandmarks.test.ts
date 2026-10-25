/** When a screen asks about its city's landmarks (usePlaceLandmarks, ADR-IMPL-064), render after render. bun runs no
 *  renderer, so the hook is called as a function under a stand-in for the two React hooks it uses — an effect runs after
 *  a render that changed its dependencies, its cleanup before it runs again and on unmount; a snapshot is read as it
 *  stands — with the screen's focus and the API stood in for. Outside these renders React's own hooks answer. */
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { LandmarkVM } from "@bbc/shared/api/v1/places";

type Cleanup = void | (() => void);
type Slot = { deps: readonly unknown[] | undefined; cleanup: Cleanup };

let slots: Slot[] = [];
let cursor: number | null = null;
let queued: (() => void)[] = [];

const React = await import("react");
mock.module("react", () => ({
  ...React,
  useEffect(effect: () => Cleanup, deps?: readonly unknown[]) {
    if (cursor === null) return React.useEffect(effect, deps);
    const i = cursor++;
    const before = slots[i];
    const same = before?.deps && deps && deps.every((d, k) => Object.is(d, before.deps![k]));
    if (same) return;
    queued.push(() => {
      if (typeof before?.cleanup === "function") before.cleanup();
      slots[i] = { deps, cleanup: effect() };
    });
  },
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, snapshot: () => T, server?: () => T): T {
    return cursor === null ? React.useSyncExternalStore(subscribe, snapshot, server) : snapshot();
  },
}));

let focused = true;
mock.module("expo-router", () => ({ useIsFocused: () => focused }));

type Answer =
  | { ok: true; data: { notModified: false; landmarks: LandmarkVM[]; etag: string | null } }
  | { ok: false; status: number; message: string };
const asked: { code: string; etag: string | null | undefined }[] = [];
let answer: () => Answer = () => ({ ok: false, status: 0, message: "No connection." });
mock.module("@/lib/api", () => ({
  fetchPlaceLandmarks: async (code: string, etag?: string | null) => {
    asked.push({ code, etag });
    return answer();
  },
}));

const { usePlaceLandmarks } = await import("./usePlaceLandmarks");

/** One render of a screen showing `code`: the hook, then the effects whose dependencies changed. */
function render(code: string | null, offline: boolean) {
  cursor = 0;
  queued = [];
  try {
    return usePlaceLandmarks(code, offline);
  } finally {
    cursor = null;
    for (const run of queued) run();
  }
}

function unmount() {
  for (const slot of slots) if (typeof slot?.cleanup === "function") slot.cleanup();
  slots = [];
}

/** Lets a question in flight answer: the API's promise, then the store's own bookkeeping. */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const questions = (code: string) => asked.filter((a) => a.code === code);

// Made-up files and authors; the landmarks' names are the places' own.
function landmark(name: string, file: string): LandmarkVM {
  return {
    name,
    imageUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}/1280px-${file}`,
    width: 1280,
    height: 853,
    credit: { text: "Jane Doe · Wikimedia Commons", licence: "CC BY-SA 4.0" },
  };
}
const tower = landmark("Eiffel Tower", "Tower.jpg");
const louvre = landmark("Louvre", "Louvre.jpg");
const found = (landmarks: LandmarkVM[], etag: string | null = '"a"'): Answer => ({
  ok: true,
  data: { notModified: false, landmarks, etag },
});

beforeEach(() => {
  jest.useFakeTimers();
  focused = true;
  asked.length = 0;
});

afterEach(() => {
  unmount();
  jest.useRealTimers();
});

// Each test shows a city of its own: the store is the app's, shared by every screen for the session.
describe("usePlaceLandmarks — when a screen asks about its city", () => {
  it("asks when the screen is in view and the phone online; not out of view, not offline", async () => {
    answer = () => found([tower, louvre]);
    focused = false;
    render("lhr", false);
    expect(asked).toEqual([]);
    focused = true;
    render("lhr", true);
    expect(asked).toEqual([]);
    expect(render("lhr", false).landmarks).toEqual([]);
    expect(asked).toEqual([{ code: "LHR", etag: null }]);
    await settle();
    expect(render("lhr", false).landmarks).toEqual([tower, louvre]);
  });

  it("a question that failed is asked again when the phone comes back online, and its landmarks show", async () => {
    // The first question fails (the network went as the screen opened); NetInfo then says offline.
    answer = () => ({ ok: false, status: 0, message: "No connection." });
    render("cdg", false);
    await settle();
    expect(render("cdg", false).landmarks).toEqual([]);
    render("cdg", true);
    expect(questions("CDG")).toHaveLength(1);

    answer = () => found([tower, louvre]);
    render("cdg", false);
    expect(questions("CDG")).toHaveLength(2);
    await settle();
    expect(render("cdg", false).landmarks).toEqual([tower, louvre]);
  });

  it("back online with what the app knows still fresh, nothing is asked", async () => {
    answer = () => found([tower]);
    render("ams", false);
    await settle();
    render("ams", true);
    render("ams", false);
    await settle();
    expect(questions("AMS")).toHaveLength(1);
    expect(render("ams", false).landmarks).toEqual([tower]);
  });
});

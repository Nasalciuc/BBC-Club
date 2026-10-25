/**
 * Every call button dials EXPO_PUBLIC_SUPPORT_PHONE — the company's general line — and nothing else (brief 3.5, the D1
 * check). The app is read as source: the number is read in one place, a `tel:` link is built in one place, every call
 * button is made by `clubCall` (null without a number, so the button is not drawn), no number is written in the code,
 * and no words ask the member to call when there is none.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { deleteFailureCopy } from "../features/profile/delete-logic";
import { limitedCopy } from "../features/requests/confirmation-logic";
import { listAttention, requestView } from "../features/requests/request-view-logic";
import { errorFrameActions, stateCopy } from "./error-context";
import { callFor, telHref } from "./support-phone-logic";

const ROOT = join(import.meta.dir, "../../../..");
const SOURCES = ["apps/mobile/src", "packages/ui/src"];

/** Every call button of the app: where it is drawn, and its testID. A new one is made with `clubCall` and named here. */
const CALL_SITES = [
  { file: "apps/mobile/src/components/app-gate.tsx", testID: "appGate.update.call" },
  { file: "apps/mobile/src/components/app-gate.tsx", testID: "appGate.maintenance.call" },
  { file: "apps/mobile/src/app/(tabs)/profile.tsx", testID: "profile.call" },
  { file: "apps/mobile/src/app/(tabs)/profile.tsx", testID: "profile.error.call" },
  { file: "apps/mobile/src/app/request/[id].tsx", testID: "request.call" },
  { file: "apps/mobile/src/app/request/[id].tsx", testID: "request.callUs" },
  { file: "apps/mobile/src/app/request/limited.tsx", testID: "request.rateLimited.call" },
] as const;

/** Files that draw a call button's words without making the call themselves: the app gate's page (it is handed
 *  `clubCall`'s answer) and the developer gallery (its buttons do nothing). */
const DRAWS_ONLY = ["apps/mobile/src/components/system-screen.tsx", "apps/mobile/src/app/dev/gallery.tsx"];

/** The copy that may ask the member to call: each takes `canCall`. The Join page's line (otp-send-logic.ts) belongs to
 *  the entry, which stays as it is (ADR-IMPL-047) — left to the owner, not changed here. */
const CALL_COPY = [
  "apps/mobile/src/features/requests/request-view-logic.ts",
  "apps/mobile/src/features/requests/confirmation-logic.ts",
  "apps/mobile/src/features/profile/delete-logic.ts",
  "apps/mobile/src/lib/error-context.ts",
  "apps/mobile/src/features/auth/otp-send-logic.ts",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules") out.push(...walk(p));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The source without its comments: a comment may quote a button's words or a sample number; only code is checked.
 *  A `//` after `:` or a quote is a URL's, not a comment. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const files = SOURCES.flatMap((dir) => walk(join(ROOT, dir))).map((p) => ({
  path: relative(ROOT, p).replace(/\\/g, "/"),
  src: code(readFileSync(p, "utf8")),
}));

/** The files whose code matches `re`. */
function filesWith(re: RegExp): string[] {
  return files.filter((f) => re.test(f.src)).map((f) => f.path);
}

describe("one number: EXPO_PUBLIC_SUPPORT_PHONE", () => {
  test("the variable is read once, by lib/env.ts; only lib/support-phone.ts reads it from there", () => {
    expect(filesWith(/process\.env\.EXPO_PUBLIC_SUPPORT_PHONE/)).toEqual(["apps/mobile/src/lib/env.ts"]);
    expect(filesWith(/(?<!process\.)\benv\.EXPO_PUBLIC_SUPPORT_PHONE\b/)).toEqual([
      "apps/mobile/src/lib/support-phone.ts",
    ]);
    const dialer = files.find((f) => f.path === "apps/mobile/src/lib/support-phone.ts")?.src ?? "";
    // The link comes from that value, and every call is made from that link.
    expect(dialer).toContain("const SUPPORT_TEL: string | null = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);");
    expect(dialer).toContain("return callFor(SUPPORT_TEL, testID,");
    expect(dialer).not.toMatch(/export const SUPPORT_TEL/);
  });

  test("a tel: link is built in one place, from the configured number's digits", () => {
    expect(filesWith(/["'`]tel:/)).toEqual(["apps/mobile/src/lib/support-phone-logic.ts"]);
    const logic = files.find((f) => f.path === "apps/mobile/src/lib/support-phone-logic.ts")?.src ?? "";
    expect(logic.match(/["'`]tel:[^"'`]*["'`]/g)).toEqual(["`tel:${digits}`"]);
  });

  test("no number is written in the code", () => {
    expect(filesWith(/tel:\+?\d/)).toEqual([]);
    // An E.164 number, or a North American one written out: only the gallery's sample of a member's own number (the
    // fictional 555 range), which nothing dials.
    for (const re of [/["'`]\+\d[\d\s().-]{6,}\d["'`]/, /["'`]\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}["'`]/]) {
      for (const file of filesWith(re)) expect(file).toBe("apps/mobile/src/app/dev/gallery.tsx");
    }
    // Nor in the build profiles: the number lives in the EAS environment (docs/release.md).
    for (const config of ["apps/mobile/eas.json", "apps/mobile/app.json"]) {
      expect(readFileSync(join(ROOT, config), "utf8")).not.toContain("EXPO_PUBLIC_SUPPORT_PHONE");
    }
  });

  test("nothing else opens the dialer: every Linking.openURL elsewhere opens a web or store address", () => {
    const opened = files
      .filter((f) => f.path !== "apps/mobile/src/lib/support-phone.ts")
      .flatMap((f) => [...f.src.matchAll(/Linking\.openURL\(([^)]*)\)/g)].map((m) => m[1] ?? ""));
    expect(opened.length).toBeGreaterThan(0);
    for (const url of opened) expect(url).not.toMatch(/tel|call|dial|phone/i);
  });
});

describe("every call button", () => {
  test(`is one of the ${CALL_SITES.length} made by clubCall, each named once in its file`, () => {
    const made = files.flatMap((f) =>
      [...f.src.matchAll(/\bclubCall\(\s*"([^"]+)"\s*\)/g)].map((m) => ({ file: f.path, testID: m[1] })),
    );
    const key = (s: { file: string; testID?: string }) => `${s.file} ${s.testID}`;
    expect(made.map(key).sort()).toEqual(CALL_SITES.map(key).sort());
    for (const site of CALL_SITES) {
      const src = files.find((f) => f.path === site.file)?.src ?? "";
      // Its testID appears only inside clubCall(…): the button gets it from the call, which is null without a number.
      expect(src.split(`"${site.testID}"`).length - 1).toBe(1);
    }
  });

  test("its words are drawn only where a call is made, or by the page and the gallery that draw them", () => {
    const labelled = filesWith(/(["'])Call (us|your specialist|a specialist)\1/);
    const allowed = new Set<string>([...CALL_SITES.map((s) => s.file), ...DRAWS_ONLY]);
    for (const file of labelled) expect(allowed.has(file)).toBe(true);
    // The gallery's buttons dial nothing.
    const gallery = files.find((f) => f.path === "apps/mobile/src/app/dev/gallery.tsx")?.src ?? "";
    expect(gallery).not.toMatch(/Linking|clubCall|support-phone/);
  });

  test("dials exactly the configured number, and is not drawn without one", () => {
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
    };
    for (const site of CALL_SITES) {
      // Unset, empty, or too short to dial: no number, so no button.
      for (const unset of [undefined, "", "123"]) expect(callFor(telHref(unset), site.testID, open)).toBeNull();
      // A made-up number in the fictional 555 range.
      const call = callFor(telHref("+1 (212) 555-0148"), site.testID, open);
      expect(call?.testID).toBe(site.testID);
      call?.onPress();
    }
    expect(opened).toEqual(CALL_SITES.map(() => "tel:+12125550148"));
  });
});

describe("words that ask the member to call", () => {
  test("live only in the copy that takes canCall (and the frozen entry)", () => {
    const asking = filesWith(/["'`][^"'`\n]*\b[Cc]all (us|your specialist)\b[^"'`\n]*["'`]/);
    const allowed = new Set<string>([...CALL_COPY, ...CALL_SITES.map((s) => s.file), ...DRAWS_ONLY]);
    for (const file of asking) expect(allowed.has(file)).toBe(true);
  });

  test("are never said without a number, and are said with one", () => {
    const without = [
      requestView("not_sent").notice?.body,
      requestView("rejected").notice?.body,
      listAttention([{ status: "not_sent" }])?.body,
      stateCopy("deleteFailed").body,
      deleteFailureCopy("RATE_LIMITED").text,
      deleteFailureCopy("UNKNOWN").text,
      limitedCopy({ scope: "ip", minutes: 5, canCall: false }).body,
    ];
    for (const words of without) {
      expect(words).toBeTruthy();
      expect(words?.toLowerCase()).not.toContain("call");
    }
    expect(errorFrameActions("profile", false)).not.toContain("call");

    const withLine = [
      requestView("not_sent", null, undefined, true).notice?.body,
      listAttention([{ status: "not_sent" }], true)?.body,
      stateCopy("deleteFailed", true).body,
      deleteFailureCopy("RATE_LIMITED", false, true).text,
      limitedCopy({ scope: "ip", minutes: 5, canCall: true }).body,
    ];
    for (const words of withLine) expect(words?.toLowerCase()).toContain("call");
    expect(errorFrameActions("profile", true)).toContain("call");
  });
});

/**
 * Every call button dials EXPO_PUBLIC_SUPPORT_PHONE — the company's general line — and nothing else (brief 3.5, the D1
 * check). The app is read as source: the number is read in one place, a `tel:` link is built in one place, every call
 * button is made by `clubCall` (null without a number), its words come only with that call (so a screen cannot draw
 * them without one), no number is written in the code, every copy helper that can ask for a call is handed `CAN_CALL`
 * by the screens that show its words, and no words ask the member to call when there is no number.
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

/** Every call button of the app: where it is made, its testID and its words. A new one is made with `clubCall` and
 *  named here. */
const CALL_SITES = [
  { file: "apps/mobile/src/components/app-gate.tsx", testID: "appGate.update.call", label: "Call a specialist" },
  { file: "apps/mobile/src/components/app-gate.tsx", testID: "appGate.maintenance.call", label: "Call a specialist" },
  { file: "apps/mobile/src/app/(tabs)/profile.tsx", testID: "profile.call", label: "Call us" },
  { file: "apps/mobile/src/app/(tabs)/profile.tsx", testID: "profile.error.call", label: "Call us" },
  { file: "apps/mobile/src/app/request/[id].tsx", testID: "request.call", label: "Call your specialist" },
  { file: "apps/mobile/src/app/request/[id].tsx", testID: "request.callUs", label: "Call us" },
  {
    file: "apps/mobile/src/app/request/limited.tsx",
    testID: "request.rateLimited.call",
    label: "Call your specialist",
  },
] as const;

/** The developer gallery draws the buttons' words on buttons that dial nothing. */
const GALLERY = "apps/mobile/src/app/dev/gallery.tsx";
/** The words' type (`CallLabel`): the only words clubCall takes. */
const WORDS_TYPE = "apps/mobile/src/lib/support-phone-logic.ts";

/** The screens that show words a copy helper words as a call when `canCall` is true: each hands it `CAN_CALL`. */
const SAYS_CALL = [
  { file: "apps/mobile/src/app/request/[id].tsx", fn: "requestView" },
  { file: "apps/mobile/src/app/(tabs)/requests.tsx", fn: "listAttention" },
  { file: "apps/mobile/src/features/profile/DeleteAccountSheet.tsx", fn: "deleteFailureCopy" },
  { file: "apps/mobile/src/app/(tabs)/profile.tsx", fn: "errorFrameActions" },
  { file: "apps/mobile/src/app/request/limited.tsx", fn: "limitedCopy" },
] as const;

/** Each copy helper that takes `canCall`, and where: the argument's position, or the property of its one argument. */
const CAN_CALL_ARG: Record<string, number | "property"> = {
  requestView: 3,
  listAttention: 1,
  notPassedOn: 1,
  deleteFailureCopy: 2,
  deleteRateLimited: 0,
  stateCopy: 1,
  errorFrameActions: 1,
  limitedCopy: "property",
};

/** The Join page's line, `… Check it, or call us.`: it belongs to the entry, which stays as it is (ADR-IMPL-047), so it
 *  asks for a call in every build — left to the owner (ADR-IMPL-065), not changed here. */
const ENTRY_CALL = "apps/mobile/src/features/auth/otp-send-logic.ts";

/** Where the docs say that, without the number, no words ask the member to call — and the ADR that leaves the entry's
 *  line to the owner. Each names that one exception. */
const NO_CALL_PROMISES = [
  "docs/release.md",
  "apps/mobile/.env.example",
  "apps/mobile/src/lib/env.ts",
  "apps/mobile/src/lib/support-phone-logic.ts",
  "docs/adr/ADR-IMPL-065-crm-http-adapter.md",
];

/** The copy that may ask the member to call: each takes `canCall`, but the entry's. */
const CALL_COPY = [
  "apps/mobile/src/features/requests/request-view-logic.ts",
  "apps/mobile/src/features/requests/confirmation-logic.ts",
  "apps/mobile/src/features/profile/delete-logic.ts",
  "apps/mobile/src/lib/error-context.ts",
  ENTRY_CALL,
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

/** A call button made with its testID and its words: `clubCall("<testID>", "<words>")`. */
const CLUB_CALL = /\bclubCall\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;

/** A button's words, as a string of their own. */
const CALL_WORDS = /(["'`])Call (us|your specialist|a specialist)\1/;

/** The arguments of each call to `fn` in `src`, as written: split at the top level, nesting and strings respected. A
 *  definition (`function fn(`) is not a call. */
function callsOf(src: string, fn: string): string[][] {
  const out: string[][] = [];
  for (const m of src.matchAll(new RegExp(`(?<![\\w.])${fn}\\(`, "g"))) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;
    const args: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = m.index + m[0].length;
    let i = start;
    for (; i < src.length; i++) {
      const c = src[i] ?? "";
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) {
        args.push(src.slice(start, i).trim());
        start = i + 1;
      }
    }
    const last = src.slice(start, i).trim();
    if (last) args.push(last);
    out.push(args);
  }
  return out;
}

/** The `canCall` a call hands its helper, as written, or null when it leaves it out (the helper then says no call). */
function canCallOf(fn: string, args: string[]): string | null {
  const at = CAN_CALL_ARG[fn];
  if (at === "property") return args[0]?.match(/\bcanCall\s*:\s*([^,}]+)/)?.[1]?.trim() ?? null;
  return at === undefined ? null : (args[at] ?? null);
}

describe("one number: EXPO_PUBLIC_SUPPORT_PHONE", () => {
  test("the variable is read once, by lib/env.ts; only lib/support-phone.ts reads it from there", () => {
    expect(filesWith(/process\.env\.EXPO_PUBLIC_SUPPORT_PHONE/)).toEqual(["apps/mobile/src/lib/env.ts"]);
    expect(filesWith(/(?<!process\.)\benv\.EXPO_PUBLIC_SUPPORT_PHONE\b/)).toEqual([
      "apps/mobile/src/lib/support-phone.ts",
    ]);
    const dialer = files.find((f) => f.path === "apps/mobile/src/lib/support-phone.ts")?.src ?? "";
    // The link comes from that value, and every call — and whether the app may say "call" — from that link.
    expect(dialer).toContain("const SUPPORT_TEL: string | null = telHref(env.EXPO_PUBLIC_SUPPORT_PHONE);");
    expect(dialer).toContain("return callFor(SUPPORT_TEL, testID, label,");
    expect(dialer).toContain("export const CAN_CALL = SUPPORT_TEL !== null;");
    expect(dialer).not.toMatch(/export const SUPPORT_TEL/);
    // CAN_CALL is that one, imported: no screen makes its own.
    expect(filesWith(/\bCAN_CALL\s*=/)).toEqual(["apps/mobile/src/lib/support-phone.ts"]);
    for (const file of filesWith(/\bCAN_CALL\b/).filter((p) => p !== "apps/mobile/src/lib/support-phone.ts")) {
      expect(files.find((f) => f.path === file)?.src).toMatch(
        /import \{[^}]*\bCAN_CALL\b[^}]*\} from "@\/lib\/support-phone";/,
      );
    }
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
  test(`is one of the ${CALL_SITES.length} made by clubCall with its testID and its words, each named once`, () => {
    const made = files.flatMap((f) =>
      [...f.src.matchAll(CLUB_CALL)].map((m) => ({ file: f.path, testID: m[1], label: m[2] })),
    );
    const key = (s: { file: string; testID?: string; label?: string }) => `${s.file} ${s.testID} ${s.label}`;
    expect(made.map(key).sort()).toEqual(CALL_SITES.map(key).sort());
    // Every clubCall( is one of those: none takes its testID or its words from a variable.
    const calls = files
      .filter((f) => f.path !== "apps/mobile/src/lib/support-phone.ts")
      .flatMap((f) => [...f.src.matchAll(/\bclubCall\(/g)]);
    expect(calls.length).toBe(CALL_SITES.length);
    for (const site of CALL_SITES) {
      const src = files.find((f) => f.path === site.file)?.src ?? "";
      // Its testID appears only inside clubCall(…): the button gets it from the call, which is null without a number.
      expect(src.split(`"${site.testID}"`).length - 1).toBe(1);
    }
  });

  test("its words come only with the call: no screen writes them outside clubCall(…)", () => {
    // With each clubCall("…", "…") taken out, no code holds a button's words: a screen draws them from the call
    // (`call.label`), which is null without a number — so no words without a button, and no button without a number.
    for (const f of files) {
      if (f.path === GALLERY || f.path === WORDS_TYPE) continue;
      expect({ file: f.path, words: f.src.replace(CLUB_CALL, "").match(CALL_WORDS)?.[0] ?? null }).toEqual({
        file: f.path,
        words: null,
      });
    }
    // The gallery's buttons dial nothing.
    const gallery = files.find((f) => f.path === GALLERY)?.src ?? "";
    expect(gallery).not.toMatch(/Linking|clubCall|support-phone/);
  });

  test("dials exactly the configured number, and is not made without one", () => {
    const opened: string[] = [];
    const open = (url: string) => {
      opened.push(url);
    };
    for (const site of CALL_SITES) {
      // Unset, empty, or too short to dial: no number, so no button and no words.
      for (const unset of [undefined, "", "123"]) {
        expect(callFor(telHref(unset), site.testID, site.label, open)).toBeNull();
      }
      // A made-up number in the fictional 555 range.
      const call = callFor(telHref("+1 (212) 555-0148"), site.testID, site.label, open);
      expect([call?.testID, call?.label]).toEqual([site.testID, site.label]);
      call?.onPress();
    }
    expect(opened).toEqual(CALL_SITES.map(() => "tel:+12125550148"));
  });
});

describe("words that ask the member to call", () => {
  test("live only in the copy that takes canCall (and the frozen entry)", () => {
    const asking = files
      .filter((f) =>
        /["'`][^"'`\n]*\b[Cc]all (us|your specialist|a specialist)\b[^"'`\n]*["'`]/.test(f.src.replace(CLUB_CALL, "")),
      )
      .map((f) => f.path);
    const allowed = new Set<string>([...CALL_COPY, GALLERY, WORDS_TYPE]);
    for (const file of asking) expect(allowed.has(file)).toBe(true);
  });

  test("but the entry's Join line, which every doc that says there are none names", () => {
    // It still asks for a call; once the owner changes it, it leaves CALL_COPY and these docs.
    const entry = files.find((f) => f.path === ENTRY_CALL)?.src ?? "";
    expect(entry).toMatch(/["'`][^"'`\n]*\bcall us\b[^"'`\n]*["'`]/);
    for (const doc of NO_CALL_PROMISES) {
      const text = readFileSync(join(ROOT, doc), "utf8");
      expect({ doc, namesTheEntry: text.includes("otp-send-logic.ts") }).toEqual({ doc, namesTheEntry: true });
    }
  });

  test("the screens that show them hand the helper CAN_CALL — never a literal; the helpers pass their own along", () => {
    const handed: string[] = [];
    for (const f of files) {
      for (const fn of Object.keys(CAN_CALL_ARG)) {
        for (const args of callsOf(f.src, fn)) {
          const canCall = canCallOf(fn, args);
          if (canCall === null) continue;
          // Inside the copy, a helper hands on the `canCall` it was given; everywhere else it is the configured line.
          const expected = CALL_COPY.includes(f.path) ? /^(s\.)?canCall$/ : /^CAN_CALL$/;
          expect({ file: f.path, fn, canCall }).toEqual({ file: f.path, fn, canCall: expect.stringMatching(expected) });
          if (!CALL_COPY.includes(f.path)) handed.push(`${f.path} ${fn}`);
        }
      }
    }
    // Each screen that shows the words hands it, so a dropped argument is caught as surely as a literal `true`.
    expect(handed.sort()).toEqual(SAYS_CALL.map((s) => `${s.file} ${s.fn}`).sort());
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

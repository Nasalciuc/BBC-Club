import { describe, it, expect } from "bun:test";

function sliceBalanced(src: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

function fetchCallsWithoutSignal(src: string): number {
  const re = /(?<!\.)\bfetch\s*\(/g;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index);
    const call = sliceBalanced(src, open, "(", ")");
    if (!/\bsignal\s*:/.test(call)) n += 1;
  }
  return n;
}

function jsonParseWithoutSafeParse(src: string): number {
  const lines = src.split(/\r?\n/);
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes("JSON.parse(")) continue;
    const window = lines.slice(Math.max(0, i - 2), i + 16).join("\n");
    if (!window.includes("safeParse")) n += 1;
  }
  return n;
}

describe("check-modules: mobile fetch must pass signal", () => {
  it("flags a bare fetch(", () => {
    expect(fetchCallsWithoutSignal(`fetch(url, { headers: {} })`)).toBe(1);
  });

  it("allows fetch with signal and ignores NetInfo.fetch", () => {
    expect(fetchCallsWithoutSignal(`fetch(url, { signal: own.signal })`)).toBe(0);
    expect(fetchCallsWithoutSignal(`NetInfo.fetch()`)).toBe(0);
  });
});

describe("check-modules: JSON.parse must be followed by safeParse", () => {
  it("flags a raw parse", () => {
    expect(jsonParseWithoutSafeParse(`const x = JSON.parse(raw) as Foo;`)).toBe(1);
  });

  it("allows parse then Zod", () => {
    expect(
      jsonParseWithoutSafeParse(`const parsed = JSON.parse(raw);
const r = QueuedRequestList.safeParse(parsed);`),
    ).toBe(0);
  });
});

/**
 * Every registered route must be *named* in at least one test file.
 * This is deliberately crude string matching — satisfied by a comment that includes the path.
 * It answers “did anyone think of this route?”, not “did a request hit it”.
 * Runtime hit-map coverage (middleware recording c.req.routePath) is a later step.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { routeRegistry } from "../src/middleware/authorize";
import { testApp } from "./helpers/test-app";

function walk(dir: string, pred: (f: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
}

describe("route coverage inventory (thought-of, not exercised)", () => {
  let t: Awaited<ReturnType<typeof testApp>>;
  let corpus: string[];

  beforeAll(async () => {
    t = await testApp({ suite: "route-coverage" });
    const root = join(import.meta.dir, "../../..");
    const apiTests = walk(join(root, "apps/api/test"), (f) => f.endsWith(".test.ts") || f.endsWith(".ts"));
    const moduleTests = walk(join(root, "packages/modules"), (f) => /[/\\]tests[/\\].*\.test\.ts$/.test(f));
    corpus = [...apiTests, ...moduleTests].map((f) => readFileSync(f, "utf8"));
  });

  afterAll(async () => {
    await t.close();
  });

  it("every registered route path appears as a substring in some test file", () => {
    expect(routeRegistry.size).toBeGreaterThan(0);
    const untested = [...routeRegistry.keys()]
      .map((key) => key.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, ""))
      .filter((path) => !corpus.some((src) => src.includes(path)));
    expect(untested).toEqual([]);
  });
});

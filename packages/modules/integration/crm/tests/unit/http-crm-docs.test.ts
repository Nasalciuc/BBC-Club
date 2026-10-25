/**
 * What the docs say about the http adapter is what the code does (AGENTS.md rule 10): the module's MODULE.md, and the
 * ADRs ADR-IMPL-065 amends, which carry its mark where they are amended.
 */
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../../../../..");
const ADRS = join(ROOT, "docs/adr");
const CRM = "packages/modules/integration/crm";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("crm MODULE.md", () => {
  it("does not put out of scope the request the http adapter writes to the CRM", () => {
    // The adapter POSTs each request to the CRM: writing it is in scope.
    expect(read(`${CRM}/src/infrastructure/http-crm.ts`)).toContain('method: "POST"');
    const outOfScope = read(`${CRM}/MODULE.md`)
      .split("\n")
      .find((line) => line.startsWith("**Out of scope:**"));
    expect(outOfScope).toBeDefined();
    expect(outOfScope).not.toMatch(/writing anything to the CRM except activities/);
    expect(outOfScope).toContain("`submitRequest`");
  });
});

/** The ADR file whose number is `n` (`041`). */
function adr(n: string): { file: string; text: string } {
  const file = readdirSync(ADRS).find((name) => name.startsWith(`ADR-IMPL-${n}-`));
  if (!file) throw new Error(`no ADR-IMPL-${n}`);
  return { file, text: readFileSync(join(ADRS, file), "utf8") };
}

/** The mark, as a line may break it. */
const MARK = /amended by\s+ADR-IMPL-065/i;

describe("ADR-IMPL-065's amendments", () => {
  it("names each ADR it amends in its header, and each carries the mark", () => {
    const own = adr("065").text;
    const header = own.slice(own.indexOf("Amends"), own.indexOf("No migration."));
    const amended = [...header.matchAll(/ADR-IMPL-(\d{3})/g)].map((m) => m[1] ?? "");
    expect(amended).toEqual(["023", "042", "041"]);
    for (const n of amended) {
      const { file, text } = adr(n);
      expect({ file, marked: MARK.test(text) }).toEqual({ file, marked: true });
    }
  });

  it("ADR-IMPL-041's request that will not go out by itself: the call only with the club's line", () => {
    const text = adr("041").text;
    const start = text.indexOf("- **A request that will not go out by itself**");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("\n- **", start + 1);
    const bullet = text.slice(start, end);
    expect(bullet).toMatch(MARK);
    expect(bullet).toContain("EXPO_PUBLIC_SUPPORT_PHONE");
  });

  it("no ADR still says `http` is not built or throws without the mark beside it", () => {
    const stale = /`http` (is not built|still throws)/g;
    const unmarked: string[] = [];
    for (const file of readdirSync(ADRS).filter((name) => name.endsWith(".md"))) {
      const text = readFileSync(join(ADRS, file), "utf8");
      for (const m of text.matchAll(stale)) {
        // The mark follows the sentence it amends: within the next few lines.
        if (!MARK.test(text.slice(m.index, m.index + 400))) unmarked.push(`${file}: ${m[0]}`);
      }
    }
    expect(unmarked).toEqual([]);
  });
});

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ranges = readFileSync(`${root}infra/cloudflare-ranges.txt`, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
if (ranges.length < 10) throw new Error("cloudflare-ranges.txt looks truncated");

const out: Record<string, string> = {
  [`${root}infra/caddy/cloudflare_ranges.caddy`]:
    `# GENERATED from infra/cloudflare-ranges.txt by \`bun run cf:gen\` — do not edit.\n` +
    `trusted_proxies static ${ranges.join(" ")}\n`,
  [`${root}packages/shared/src/net/cloudflare-ranges.ts`]:
    `// GENERATED from infra/cloudflare-ranges.txt by \`bun run cf:gen\` — do not edit.\n` +
    `export const CLOUDFLARE_RANGES: readonly string[] = ${JSON.stringify(ranges, null, 2)};\n`,
};

if (process.argv.includes("--check")) {
  const stale = Object.entries(out)
    .filter(([p, c]) => {
      try {
        return readFileSync(p, "utf8") !== c;
      } catch {
        return true;
      }
    })
    .map(([p]) => p);
  if (stale.length) {
    console.error(`stale: ${stale.join(", ")} — run bun run cf:gen`);
    process.exit(1);
  }
  process.exit(0);
}
for (const [p, c] of Object.entries(out)) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, c);
}
console.log(`cf:gen: ${ranges.length} ranges`);

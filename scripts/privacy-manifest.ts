/** Merge Apple required-reason APIs for the iOS production binary into app.json.
 *  Expo SDK PrivacyInfo.xcprivacy files are not reliably parsed by App Store review
 *  (https://docs.expo.dev/guides/apple-privacy/), so the app manifest is the union.
 *  Dev-client pods stay out. Reviewed no-manifest hits live in privacy-supplement.json. */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APP_JSON = join(ROOT, "apps/mobile/app.json");
const SUPPLEMENT = join(ROOT, "apps/mobile/privacy-supplement.json");
const MOBILE_PKG = join(ROOT, "apps/mobile/package.json");

const DEV_ONLY = new Set(["expo-dev-client", "expo-dev-launcher", "expo-dev-menu", "expo-dev-menu-interface"]);

export type Accessed = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };
export type Manifest = {
  NSPrivacyTracking: false;
  NSPrivacyTrackingDomains: [];
  NSPrivacyAccessedAPITypes: Accessed[];
};
export type SourceRow = {
  dependency: string;
  hasManifest: boolean;
  category: string;
  reason: string;
  source: string;
};

type Supplement = {
  entries: { dependency: string; category: string; reasons: string[]; source: string }[];
};

function posix(p: string): string {
  return p.replaceAll("\\", "/");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function resolvePkg(name: string): string | null {
  const candidates = [join(ROOT, "node_modules", name), join(ROOT, "apps/mobile/node_modules", name)];
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  return null;
}

function walkDeps(name: string, seen: Set<string>): void {
  if (seen.has(name) || DEV_ONLY.has(name)) return;
  seen.add(name);
  const dir = resolvePkg(name);
  if (!dir) return;
  const pkg = readJson<{ dependencies?: Record<string, string> }>(join(dir, "package.json"));
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!DEV_ONLY.has(dep)) walkDeps(dep, seen);
  }
}

export function productionIosPackages(): string[] {
  const mobile = readJson<{ dependencies?: Record<string, string> }>(MOBILE_PKG);
  const seen = new Set<string>();
  for (const name of Object.keys(mobile.dependencies ?? {})) {
    walkDeps(name, seen);
  }
  return [...seen].sort();
}

function isIosNative(name: string, dir: string): boolean {
  if (name === "react-native") return true;
  return existsSync(join(dir, "ios"));
}

function walkFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else if (name === "PrivacyInfo.xcprivacy") out.push(full);
  }
}

export function parseAccessedApis(xml: string): { category: string; reasons: string[] }[] {
  const out: { category: string; reasons: string[] }[] = [];
  const re =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const m of xml.matchAll(re)) {
    const category = m[1];
    const reasons = [...(m[2] ?? "").matchAll(/<string>([^<]+)<\/string>/g)].map((r) => r[1]!).sort();
    if (category && reasons.length) out.push({ category, reasons });
  }
  return out;
}

export function mergeReasons(rows: { category: string; reasons: string[] }[]): Accessed[] {
  const byCat = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = byCat.get(row.category) ?? new Set<string>();
    for (const r of row.reasons) set.add(r);
    byCat.set(row.category, set);
  }
  return [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, reasons]) => ({
      NSPrivacyAccessedAPIType: category,
      NSPrivacyAccessedAPITypeReasons: [...reasons].sort(),
    }));
}

export function collect(sourceRows: SourceRow[] = []): Manifest {
  const extras = readJson<Supplement>(SUPPLEMENT);
  const merged: { category: string; reasons: string[] }[] = [];
  for (const name of productionIosPackages()) {
    const dir = resolvePkg(name);
    if (!dir || !isIosNative(name, dir)) continue;
    const files: string[] = [];
    walkFiles(dir, files);
    if (files.length === 0) {
      sourceRows.push({
        dependency: name,
        hasManifest: false,
        category: "",
        reason: "",
        source: "",
      });
      continue;
    }
    for (const file of files) {
      const parsed = parseAccessedApis(readFileSync(file, "utf8"));
      const rel = posix(relative(ROOT, file));
      if (parsed.length === 0) {
        sourceRows.push({
          dependency: name,
          hasManifest: true,
          category: "",
          reason: "",
          source: rel,
        });
      }
      for (const p of parsed) {
        merged.push(p);
        for (const reason of p.reasons) {
          sourceRows.push({
            dependency: name,
            hasManifest: true,
            category: p.category,
            reason,
            source: `copied from ${rel}`,
          });
        }
      }
    }
  }
  for (const e of extras.entries) {
    merged.push({ category: e.category, reasons: e.reasons });
    for (const reason of e.reasons) {
      sourceRows.push({
        dependency: e.dependency,
        hasManifest: false,
        category: e.category,
        reason,
        source: `scan ${e.source}`,
      });
    }
  }
  return {
    NSPrivacyTracking: false,
    NSPrivacyTrackingDomains: [],
    NSPrivacyAccessedAPITypes: mergeReasons(merged),
  };
}

function sameManifest(a: Manifest, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyToAppJson(manifest: Manifest): void {
  const app = readJson<{ expo: { ios: Record<string, unknown> } }>(APP_JSON);
  app.expo.ios.privacyManifests = manifest;
  writeFileSync(APP_JSON, `${JSON.stringify(app, null, 2)}\n`);
}

function check(manifest: Manifest): void {
  const app = readJson<{ expo?: { ios?: { privacyManifests?: unknown } } }>(APP_JSON);
  const current = app.expo?.ios?.privacyManifests;
  if (!sameManifest(manifest, current)) {
    console.error("apps/mobile/app.json ios.privacyManifests is stale. Run: bun run scripts/privacy-manifest.ts");
    console.error("expected:", JSON.stringify(manifest, null, 2));
    process.exit(1);
  }
  console.log("privacy-manifest OK");
}

if (import.meta.main) {
  const rows: SourceRow[] = [];
  const manifest = collect(rows);
  if (process.argv.includes("--check")) check(manifest);
  else {
    applyToAppJson(manifest);
    console.log("wrote apps/mobile/app.json ios.privacyManifests");
    console.log(JSON.stringify(manifest, null, 2));
  }
}

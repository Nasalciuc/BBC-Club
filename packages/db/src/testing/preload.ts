/**
 * Bun test preload. Ensures `bbc_test_tpl` exists and matches the current migrations (by content hash).
 * Seven packages start at once under turbo: the advisory lock makes exactly one of them build; the others
 * wait and find it ready. Also sets the test env every package needs.
 */
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://bbc:bbc@localhost:55432/bbc_test";
process.env.DATABASE_ADMIN_URL ??= process.env.DATABASE_URL;
process.env.APP_ORIGIN ??= "http://localhost:8000";
process.env.MOBILE_SCHEME ??= "bbcclub";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.INTERNAL_API_SECRET ??= "internal-secret-internal-secret-0000";
process.env.POSTMARK_FROM ??= "club@buybusinessclass.com";

const ADMIN_URL = process.env.DATABASE_ADMIN_URL;
if (!/test/i.test(new URL(ADMIN_URL).pathname)) throw new Error("refusing to run tests against a non-test database");

const TEMPLATE = "bbc_test_tpl";
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../../migrations");
const dbPackageDir = join(here, "../..");

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const hash = createHash("sha256");
for (const f of walk(migrationsDir).sort()) hash.update(f).update(readFileSync(f));
const migrationsHash = hash.digest("hex").slice(0, 16);

const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
try {
  await admin`SELECT pg_advisory_lock(hashtext('bbc_test_tpl'))`;
  const [row] = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEMPLATE}`;
  let current: string | null = null;
  if (row) {
    const tpl = postgres(new URL(ADMIN_URL).toString().replace(/\/[^/?]+(\?|$)/, `/${TEMPLATE}$1`), {
      max: 1,
      onnotice: () => {},
    });
    try {
      current = (await tpl`SELECT hash FROM _template_meta LIMIT 1`)[0]?.hash ?? null;
    } catch {
      current = null;
    } finally {
      await tpl.end();
    }
  }
  if (current !== migrationsHash) {
    if (row) {
      await admin.unsafe(`ALTER DATABASE "${TEMPLATE}" IS_TEMPLATE false`);
      await admin.unsafe(`DROP DATABASE "${TEMPLATE}" WITH (FORCE)`);
    }
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE}"`);
    const tplUrl = new URL(ADMIN_URL).toString().replace(/\/[^/?]+(\?|$)/, `/${TEMPLATE}$1`);
    const r = spawnSync("bun", ["run", "scripts/migrate.ts"], {
      cwd: dbPackageDir,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: tplUrl },
    });
    if (r.status !== 0) throw new Error("template migration failed");
    const tpl = postgres(tplUrl, { max: 1, onnotice: () => {} });
    try {
      await tpl.unsafe(
        `CREATE TABLE _template_meta (hash text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await tpl.unsafe(`INSERT INTO _template_meta (hash) VALUES ('${migrationsHash}')`);
    } finally {
      await tpl.end();
    }
    await admin.unsafe(`ALTER DATABASE "${TEMPLATE}" IS_TEMPLATE true`);
    console.log(`[test] template ${TEMPLATE} built (${migrationsHash})`);
  }
  await admin`SELECT pg_advisory_unlock(hashtext('bbc_test_tpl'))`;
} finally {
  await admin.end();
}

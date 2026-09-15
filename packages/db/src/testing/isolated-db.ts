import postgres from "postgres";
import { createDb, type Db } from "../client";

const TEMPLATE = "bbc_test_tpl";

/** Admin URL for CREATE/DROP — never the per-file clone (tests may reassign DATABASE_URL). */
function adminUrl() {
  return process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!;
}

/** Replace the database name in a postgres URL. */
function withDatabase(url: string, name: string) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export type IsolatedDb = { db: Db; url: string; name: string; drop(): Promise<void> };

/**
 * One database per test file. Cloned from the migrated template (`preload.ts` builds it), so there are no
 * shared tables, no TRUNCATE races and no foreign pollers. `fromTemplate: false` gives an EMPTY database —
 * only for tests that exercise migration itself.
 */
export async function isolatedDb(
  name: string,
  opts: { fromTemplate?: boolean; max?: number } = {},
): Promise<IsolatedDb> {
  const root = adminUrl();
  if (!/test/i.test(new URL(root).pathname))
    throw new Error("isolatedDb refuses to run against a non-test DATABASE_URL");
  const safe = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 24);
  const dbName = `bbc_test_${safe}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const admin = postgres(root, { max: 1, onnotice: () => {} });
  try {
    if (opts.fromTemplate === false) await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    else await admin.unsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${TEMPLATE}"`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(root, dbName);
  const db = createDb(url, { max: opts.max ?? 2, applicationName: `test-${safe}` });
  return {
    db,
    url,
    name: dbName,
    async drop() {
      await db.close().catch(() => {});
      const a = postgres(root, { max: 1, onnotice: () => {} });
      try {
        await a.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}

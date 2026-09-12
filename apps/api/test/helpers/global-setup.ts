/** Runs once per `bun test` process (preload). Points the app at the test DB, applies migrations once,
 *  and refuses to run against anything that does not look like a test database. */
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://bbc:bbc@localhost:55432/bbc_test";
process.env.APP_ORIGIN ??= "http://localhost:8000";
process.env.MOBILE_SCHEME ??= "bbcclub";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.INTERNAL_API_SECRET ??= "internal-secret-internal-secret-0000";
process.env.POSTMARK_FROM ??= "club@buybusinessclass.com";

if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error("refusing to run tests against a non-test database");

const migrate = spawnSync("bun", ["run", "--filter", "@bbc/db", "db:migrate"], { stdio: "inherit", env: process.env });
if (migrate.status !== 0) throw new Error("test migrations failed");

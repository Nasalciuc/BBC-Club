/** TRUNCATE every owned schema — tests only. Guarded twice: NODE_ENV and the database name must contain "test". */
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { assertNotProduction } from "../src/helpers";

assertNotProduction("reset-test");
const url = process.env.DATABASE_URL!;
if (!/test/i.test(new URL(url).pathname)) {
  console.error("refusing to reset a non-test database");
  process.exit(1);
}

const db = createDb(url, { max: 1, applicationName: "bbc-reset-test" });
const tables = (
  (await db.execute(sql`
  SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
  WHERE table_type='BASE TABLE' AND table_schema IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')
    AND table_name NOT LIKE 'domain_events_%'`)) as any[]
).map((r) => `"${r.t.split(".")[0]}"."${r.t.split(".")[1]}"`);
if (tables.length) await db.execute(sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
await db.close();
console.log(`reset ${tables.length} tables`);

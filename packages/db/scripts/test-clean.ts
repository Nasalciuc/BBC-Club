/** Drops isolated test databases left behind by crashed runs (older than 1 h). */
import postgres from "postgres";

const admin = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const rows = await admin`
  SELECT datname FROM pg_database
  WHERE datname LIKE 'bbc_test\_%' ESCAPE '\' AND datname <> 'bbc_test_tpl'
    AND (pg_stat_file('base/' || oid || '/PG_VERSION', true)).modification < now() - interval '1 hour'`;
for (const r of rows) {
  await admin.unsafe(`DROP DATABASE IF EXISTS "${r.datname}" WITH (FORCE)`);
  console.log("dropped", r.datname);
}
await admin.end();

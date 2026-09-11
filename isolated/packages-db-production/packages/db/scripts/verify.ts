/** Fitness functions on the LIVE database. Fails CI (exit 1) on any violation. Run after migrate. */
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";

const OWNED_SCHEMAS = ["platform", "auth", "members", "notifications", "proposals", "engagement", "crm", "personalization"];
const db = createDb(process.env.DATABASE_URL!, { max: 1, applicationName: "bbc-verify" });
const problems: string[] = [];
const q = async (s: any) => (await db.execute(s)) as any[];

try {
  // 1. Every owned schema exists
  const schemas = (await q(sql`SELECT nspname FROM pg_namespace`)).map((r) => r.nspname);
  for (const s of OWNED_SCHEMAS) if (!schemas.includes(s)) problems.push(`schema missing: ${s}`);

  // 2. No FK may cross schemas (modular monolith rule)
  const cross = await q(sql`SELECT conname, from_schema, to_schema FROM platform.cross_schema_fks`);
  for (const c of cross) problems.push(`cross-schema FK ${c.conname}: ${c.from_schema} → ${c.to_schema}`);

  // 3. Every column named *_id or *_member_id that is not a PK has an index (DB-design guide §15.1)
  const unindexed = await q(sql`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY(${OWNED_SCHEMAS}) AND a.attnum > 0 AND NOT a.attisdropped
      AND (a.attname LIKE '%\\_id' ESCAPE '\\' OR a.attname = 'member_id')
      AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey))
  `);
  for (const u of unindexed) problems.push(`unindexed reference column ${u.schema}.${u.table}.${u.column}`);

  // 4. Every timestamp column is timestamptz (guide §15.8)
  const naive = await q(sql`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema = ANY(${OWNED_SCHEMAS}) AND data_type = 'timestamp without time zone'`);
  for (const t of naive) problems.push(`naive timestamp ${t.table_schema}.${t.table_name}.${t.column_name}`);

  // 5. Every table has created_at (guide §7) — except pure junction/counter tables listed here
  const exempt = new Set(["platform.event_cursors", "platform.flags", "platform.rate_limits", "members.notification_preferences", "personalization.member_features"]);
  const noCreated = await q(sql`
    SELECT t.table_schema, t.table_name FROM information_schema.tables t
    WHERE t.table_schema = ANY(${OWNED_SCHEMAS}) AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name IN ('created_at','occurred_at','started_at','processed_at','failed_at'))`);
  for (const t of noCreated) if (!exempt.has(`${t.table_schema}.${t.table_name}`) && !t.table_name.startsWith("domain_events_")) problems.push(`no created_at: ${t.table_schema}.${t.table_name}`);

  // 6. updated_at columns have the trigger (raw SQL cannot bypass $onUpdate)
  const missingTrg = await q(sql`
    SELECT c.table_schema, c.table_name FROM information_schema.columns c
    WHERE c.column_name = 'updated_at' AND c.table_schema = ANY(${OWNED_SCHEMAS})
      AND NOT EXISTS (SELECT 1 FROM information_schema.triggers tg WHERE tg.event_object_schema = c.table_schema AND tg.event_object_table = c.table_name AND tg.trigger_name = 'trg_updated_at')`);
  for (const t of missingTrg) problems.push(`updated_at without trigger: ${t.table_schema}.${t.table_name}`);

  // 7. Status-like text columns must be enums (guide §15.6 / ATS Hero lesson)
  const textStatus = await q(sql`
    SELECT table_schema, table_name, column_name FROM information_schema.columns
    WHERE table_schema = ANY(${OWNED_SCHEMAS}) AND data_type = 'text' AND column_name IN ('status','kind','category','platform','targeting','source','response')`);
  for (const t of textStatus) problems.push(`status column is text, not enum: ${t.table_schema}.${t.table_name}.${t.column_name}`);

  // 8. Journal is partitioned
  const part = await q(sql`SELECT 1 FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = 'domain_events'`);
  if (!part.length) problems.push("platform.domain_events is not partitioned");
} catch (e) {
  problems.push(`verify crashed: ${String(e)}`);
} finally {
  await db.close();
}

if (problems.length) { console.error("db:verify FAILED\n  - " + problems.join("\n  - ")); process.exit(1); }
console.log("db:verify OK");

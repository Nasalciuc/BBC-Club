/** Deterministic volume seed for load tests (`--scale=1` = analysis volume). Idempotent ON CONFLICT. */
import { hashPassword } from "@better-auth/utils/password";
import { sql } from "drizzle-orm";
import { createDb } from "../src/client";
import { assertNotProduction } from "../src/helpers";

assertNotProduction("seed-volume");

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function argScale(): number {
  const raw = process.argv.find((a) => a.startsWith("--scale="))?.slice("--scale=".length) ?? "1";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad --scale=${raw}`);
  return n;
}

const scale = argScale();
const members = Math.round(20_000 * scale);
const faresN = Math.round(10_000 * scale);
const offersN = Math.round(5_000 * scale);
const deliveriesN = Math.round(1_000_000 * scale);
const dests = ["LHR", "CDG", "FCO", "DXB", "HND", "SIN", "BCN", "ZRH"] as const;

const db = createDb(process.env.DATABASE_URL!, { max: 1, applicationName: "bbc-seed-volume" });
const rnd = mulberry32(20260928);
const passwordHash = await hashPassword("atlantic2026!");

async function insertChunks(label: string, n: number, chunk: number, fn: (from: number, to: number) => Promise<void>) {
  for (let i = 0; i < n; i += chunk) {
    const to = Math.min(n, i + chunk);
    await fn(i, to);
    if (to % (chunk * 10) === 0 || to === n) console.log(`${label} ${to}/${n}`);
  }
}

try {
  await insertChunks("members", members, 1000, async (from, to) => {
    const users: string[] = [];
    const accounts: string[] = [];
    const profiles: string[] = [];
    for (let i = from; i < to; i++) {
      const id = `vol_${String(i).padStart(8, "0")}`;
      const email = `vol${i}@load.test`;
      users.push(`('${id}','Volume ${i}','${email}',true,now(),now())`);
      accounts.push(`('${id}_cred','${id}','${email}','credential','${passwordHash.replace(/'/g, "''")}',now(),now())`);
      profiles.push(`('${id}',NULL,'Volume ${i}',NULL,'JFK','{}','America/New_York','waitlist',NULL,NULL)`);
    }
    await db.execute(
      sql.raw(`
      INSERT INTO auth."user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ${users.join(",")}
      ON CONFLICT (email) DO NOTHING`),
    );
    await db.execute(
      sql.raw(`
      INSERT INTO auth.account (id, user_id, account_id, provider_id, password, created_at, updated_at)
      VALUES ${accounts.join(",")}
      ON CONFLICT (id) DO NOTHING`),
    );
    await db.execute(
      sql.raw(`
      INSERT INTO members.profile (member_id, crm_client_id, display_name, phone, home_airport, preferences, timezone, status, linked_at, deleted_at)
      VALUES ${profiles.join(",")}
      ON CONFLICT (member_id) DO NOTHING`),
    );
  });

  await db.execute(sql`
    INSERT INTO catalog.airports (code, name, city, country, country_code, region, lat, lng, popularity, tz) VALUES
      ('JFK','John F Kennedy','New York','United States','US','americas',40.6413,-73.7781,100,'America/New_York'),
      ('LHR','Heathrow','London','United Kingdom','GB','europe',51.47,-0.4543,98,'Europe/London'),
      ('CDG','Charles de Gaulle','Paris','France','FR','europe',49.0097,2.5479,95,'Europe/Paris'),
      ('FCO','Fiumicino','Rome','Italy','IT','europe',41.8003,12.2389,80,'Europe/Rome'),
      ('DXB','Dubai International','Dubai','United Arab Emirates','AE','middle_east',25.2532,55.3657,92,'Asia/Dubai'),
      ('HND','Haneda','Tokyo','Japan','JP','asia',35.5494,139.7798,94,'Asia/Tokyo'),
      ('SIN','Changi','Singapore','Singapore','SG','asia',1.3644,103.9915,88,'Asia/Singapore'),
      ('BCN','El Prat','Barcelona','Spain','ES','europe',41.2974,2.0833,82,'Europe/Madrid'),
      ('ZRH','Zurich','Zurich','Switzerland','CH','europe',47.4647,8.5492,78,'Europe/Zurich')
    ON CONFLICT (code) DO NOTHING`);

  await insertChunks("fares", faresN, 1000, async (from, to) => {
    const rows: string[] = [];
    for (let i = from; i < to; i++) {
      const toCode = dests[i % dests.length];
      const carrier = ["BA", "AA", "VS", "AF"][i % 4];
      const price = (2800 + Math.floor(rnd() * 4000)).toFixed(2);
      rows.push(
        `('JFK','${toCode}','business','${carrier}',true,${price},'USD','manual', timestamptz '2026-01-01' + interval '${i} seconds', timestamptz '2028-01-01', true)`,
      );
    }
    await db.execute(
      sql.raw(`
      INSERT INTO catalog.fares (route_from, route_to, cabin, carrier, nonstop, price, currency, source, valid_from, valid_until, published)
      VALUES ${rows.join(",")}
      ON CONFLICT (route_from, route_to, cabin, carrier, valid_from) DO NOTHING`),
    );
  });

  await insertChunks("offers", offersN, 1000, async (from, to) => {
    const rows: string[] = [];
    for (let i = from; i < to; i++) {
      const targeted = rnd() < 0.9;
      const member = targeted ? `vol_${String(Math.floor(rnd() * members)).padStart(8, "0")}` : null;
      const targeting = targeted ? "user" : "broadcast";
      const toCode = dests[i % dests.length];
      rows.push(
        `('vol-offer-${i}','${targeted ? "crm_agent" : "marketing_campaign"}','${targeting}',${member ? `'${member}'` : "NULL"},'JFK','${toCode}','business','4200.00','7800.00','USD','Volume offer ${i}',now() + interval '30 days','active')`,
      );
    }
    await db.execute(
      sql.raw(`
      INSERT INTO proposals.offers (idempotency_key, source, targeting, target_member_id, route_from, route_to, cabin, price, published_price, currency, title, valid_until, status)
      VALUES ${rows.join(",")}
      ON CONFLICT (idempotency_key) DO NOTHING`),
    );
  });

  await insertChunks("events", deliveriesN, 1000, async (from, to) => {
    await db.execute(
      sql.raw(`
      WITH e AS (
        INSERT INTO platform.domain_events (type, version, aggregate_type, aggregate_id, payload, published_by)
        SELECT 'offer.published', 1, 'offer', 'vol-agg-' || g, '{}'::jsonb, 'volume'
        FROM generate_series(${from + 1}, ${to}) g
        RETURNING id, occurred_at, aggregate_id
      )
      INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id, status, run_after)
      SELECT id, occurred_at, 'volume', aggregate_id, 'done', now() FROM e
      ON CONFLICT DO NOTHING`),
    );
  });

  console.log(
    `volume seeded scale=${scale} members=${members} fares=${faresN} offers=${offersN} deliveries=${deliveriesN}`,
  );
  process.exit(0);
} catch (e) {
  console.error("seed-volume failed:", e);
  process.exit(1);
} finally {
  await db.close();
}

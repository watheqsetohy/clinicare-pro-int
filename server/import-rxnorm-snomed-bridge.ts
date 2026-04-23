/**
 * import-rxnorm-snomed-bridge.ts
 *
 * Extracts two critical cross-vocabulary datasets from the RxNorm Full Release:
 *
 *  1. rxnorm_snomed_map
 *     RXNCONSO rows where SAB='SNOMEDCT_US' — mapping SNOMED CT concept codes
 *     to RxNorm RXCUI identifiers. This covers both:
 *       a) SNOMED medication concepts → RxNorm drug concepts
 *       b) SNOMED disorder/finding concepts → RxNorm condition concepts
 *
 *  2. rxnorm_indication
 *     RXNREL rows where rela='may_treat' or 'may_prevent' — the clinical
 *     drug-indication relationships (drug RXCUI → condition RXCUI).
 *     These come from NDF-RT / MED-RT encoded within the RxNorm release.
 *
 * Together these two tables enable the CDSS query:
 *   "Given a SNOMED disorder code, what RxNorm drugs may treat it?"
 *
 * Run ONCE after import-rxnorm-pg.ts:
 *   npx tsx server/import-rxnorm-snomed-bridge.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const BATCH = 10_000;
const RRF_DIR = path.join(__dirname, '..', 'RxNorm_full_06022025', 'rrf');

// ─── Helper: flush a batch of rows ──────────────────────────────────────────
async function flush(sql: string, rows: any[][]) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) await client.query(sql, r);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Schema ─────────────────────────────────────────────────────────────────
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('\n🗑️  Dropping existing bridge tables...');
    await client.query(`
      DROP TABLE IF EXISTS rxnorm_indication   CASCADE;
      DROP TABLE IF EXISTS rxnorm_snomed_map   CASCADE;
    `);

    console.log('📦 Creating bridge tables...');
    await client.query(`
      -- SNOMED CT code ↔ RxNorm RXCUI mapping
      CREATE TABLE rxnorm_snomed_map (
        rxcui       TEXT NOT NULL,
        snomed_code TEXT NOT NULL,
        name        TEXT,
        tty         TEXT,
        PRIMARY KEY (rxcui, snomed_code)
      );
      CREATE INDEX idx_bridge_rxcui       ON rxnorm_snomed_map (rxcui);
      CREATE INDEX idx_bridge_snomed      ON rxnorm_snomed_map (snomed_code);

      -- Drug-Indication relationships (may_treat / may_prevent)
      CREATE TABLE rxnorm_indication (
        drug_rxcui      TEXT NOT NULL,
        condition_rxcui TEXT NOT NULL,
        rel             TEXT NOT NULL,  -- 'may_treat' | 'may_prevent'
        sab             TEXT,
        PRIMARY KEY (drug_rxcui, condition_rxcui, rel)
      );
      CREATE INDEX idx_ind_drug      ON rxnorm_indication (drug_rxcui);
      CREATE INDEX idx_ind_condition ON rxnorm_indication (condition_rxcui);
    `);
    console.log('✅ Bridge tables created.');
  } finally {
    client.release();
  }
}

// ─── Step 1: Extract SNOMED ↔ RxNorm from RXNCONSO.RRF ──────────────────────
// RXNCONSO columns (pipe-separated, 0-indexed):
// 0:RXCUI 1:LAT 2:TS 3:LUI 4:STT 5:SUI 6:ISPREF 7:RXAUI 8:SAUI
// 9:SCUI  10:SDUI 11:SAB 12:TTY 13:CODE 14:STR 15:SRL 16:SUPPRESS 17:CVF
async function extractSnomedMap(filePath: string) {
  if (!fs.existsSync(filePath)) { console.error(`❌ Not found: ${filePath}`); return 0; }
  console.log('\n📂 Extracting SNOMED CT ↔ RxNorm map from RXNCONSO...');

  const sql = `INSERT INTO rxnorm_snomed_map (rxcui, snomed_code, name, tty)
               VALUES ($1,$2,$3,$4) ON CONFLICT (rxcui, snomed_code) DO NOTHING`;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });

  let count = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('|');

    const rxcui    = f[0];
    const sab      = f[11];
    const scui     = f[9];   // SCUI = SNOMED CT concept ID when SAB='SNOMEDCT_US'
    const tty      = f[12];
    const name     = f[14];
    const suppress = f[16] || 'N';

    // We only want SNOMEDCT_US cross-mappings to English, unsuppressed
    if (sab !== 'SNOMEDCT_US') continue;
    if (f[1]  !== 'ENG') continue;
    if (!scui || scui === '') continue;
    if (suppress === 'Y' || suppress === 'E') continue;

    // Prefer preferred terms (ISPREF='Y' or TTY='PT'/'FN')
    if (!['PT', 'FN', 'SY', 'OP'].includes(tty)) continue;

    batch.push([rxcui, scui, name, tty]);
    count++;

    if (batch.length >= BATCH) {
      await flush(sql, batch);
      batch = [];
      process.stdout.write(`\r   Processed ${count.toLocaleString()} SNOMED↔RxNorm mappings...`);
    }
  }

  if (batch.length) await flush(sql, batch);
  console.log(`\n   ✅ rxnorm_snomed_map: ${count.toLocaleString()} rows.`);
  return count;
}

// ─── Step 2: Extract may_treat / may_prevent from RXNREL.RRF ────────────────
// RXNREL columns (pipe-separated, 0-indexed):
// 0:RXCUI1 1:RXAUI1 2:STYPE1 3:REL 4:RXCUI2 5:RXAUI2 6:STYPE2
// 7:RELA 8:RUI 9:SRUI 10:SAB 11:SL 12:RG 13:DIR 14:SUPPRESS 15:CVF
async function extractIndications(filePath: string) {
  if (!fs.existsSync(filePath)) { console.warn(`⚠️  RXNREL.RRF not found — skipping.`); return 0; }
  console.log('\n📂 Extracting Drug-Indication links (may_treat/may_prevent) from RXNREL...');

  const INDICATION_RELA = new Set(['may_treat', 'may_prevent']);

  const sql = `INSERT INTO rxnorm_indication (drug_rxcui, condition_rxcui, rel, sab)
               VALUES ($1,$2,$3,$4) ON CONFLICT (drug_rxcui, condition_rxcui, rel) DO NOTHING`;

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('|');

    const rxcui1   = f[0];   // drug RXCUI
    const rxcui2   = f[4];   // condition RXCUI
    const rela     = f[7];   // relationship attribute
    const sab      = f[10];
    const suppress = f[14] || 'N';

    if (!rela || !INDICATION_RELA.has(rela)) continue;
    if (suppress === 'Y') continue;
    if (!rxcui1 || !rxcui2) continue;

    // May_treat: rxcui1 is the DRUG, rxcui2 is the CONDITION
    batch.push([rxcui1, rxcui2, rela, sab]);
    count++;

    if (batch.length >= BATCH) {
      await flush(sql, batch);
      batch = [];
      process.stdout.write(`\r   Processed ${count.toLocaleString()} indication links...`);
    }
  }

  if (batch.length) await flush(sql, batch);
  console.log(`\n   ✅ rxnorm_indication: ${count.toLocaleString()} rows.`);
  return count;
}

// ─── Step 3: Verify the bridge works with a sample query ────────────────────
async function verifySample() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 Verification: querying drugs for sample SNOMED disorders...');

    // 73211009 = Diabetes mellitus (disorder)
    // 38341003 = Hypertension (disorder)
    // 195967001 = Asthma (disorder)
    const sampleCodes = ['73211009', '38341003', '195967001'];

    for (const code of sampleCodes) {
      const { rows } = await client.query(`
        SELECT DISTINCT
          rc.name  AS drug_name,
          rc.tty   AS tty,
          ri.drug_rxcui AS rxcui,
          ri.rel
        FROM rxnorm_indication ri
        JOIN rxnorm_snomed_map rsm ON rsm.rxcui = ri.condition_rxcui
        JOIN rxnorm_concept    rc  ON rc.rxcui  = ri.drug_rxcui
                                  AND rc.tty IN ('IN', 'MIN', 'BN')
                                  AND rc.sab = 'RXNORM'
        WHERE rsm.snomed_code = $1
        ORDER BY rc.tty, rc.name
        LIMIT 10
      `, [code]);

      if (rows.length > 0) {
        console.log(`\n   SNOMED ${code} → ${rows.length} drug(s) found:`);
        rows.slice(0, 5).forEach((r: any) =>
          console.log(`      [${r.tty}] ${r.drug_name} (RXCUI: ${r.rxcui}) — ${r.rel}`)
        );
      } else {
        console.log(`\n   SNOMED ${code} → no direct links found (normal if NDF-RT not in this release)`);
      }
    }
  } finally {
    client.release();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   RxNorm ↔ SNOMED CT CDSS Bridge Import             ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const consoFile = path.join(RRF_DIR, 'RXNCONSO.RRF');
  const relFile   = path.join(RRF_DIR, 'RXNREL.RRF');

  if (!fs.existsSync(consoFile)) {
    console.error(`\n❌ RXNCONSO.RRF not found at: ${consoFile}`);
    process.exit(1);
  }

  await createTables();
  await extractSnomedMap(consoFile);
  await extractIndications(relFile);
  await verifySample();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 Bridge import complete in ${elapsed}s`);
  console.log('   Tables: rxnorm_snomed_map, rxnorm_indication');
  console.log('\n   API ready at: GET /api/snomed/concept/:id/medications');

  await pool.end();
}

main().catch(err => {
  console.error('\n❌ Bridge import failed:', err);
  pool.end();
  process.exit(1);
});

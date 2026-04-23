/**
 * import-rxnorm-pg.ts
 *
 * Imports the official RxNorm Full Release RRF files into the PostgreSQL
 * `clinicarepro_app` database — mirroring the same pattern as SNOMED CT.
 *
 * Prerequisites:
 *   1. Download the RxNorm Full Monthly Release from NLM:
 *      https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html
 *   2. Unzip into:  D:\Healthcare Solutions\MTM Project\MTM\RxNorm\rrf\
 *      The folder should contain: RXNCONSO.RRF, RXNREL.RRF, RXNSAT.RRF
 *
 * Run with:
 *   npx tsx server/import-rxnorm-pg.ts
 *
 * Re-run whenever a new RxNorm release is placed in the RxNorm/rrf/ folder —
 * the script drops and recreates all rxnorm tables each time.
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const BATCH_SIZE = 20_000;

// ─── RxNorm Term Types (TTY) we care about ───────────────────────────────────
// IN   = Ingredient (e.g., "Metformin")
// PIN  = Precise Ingredient (salt form, e.g., "Metformin Hydrochloride")
// MIN  = Multiple Ingredients (combo ingredient)
// BN   = Brand Name (e.g., "Glucophage")
// SCDC = Semantic Clinical Drug Component (Ingredient + Strength)
// SCDF = Semantic Clinical Drug Form (Ingredient + Dose Form)
// SCD  = Semantic Clinical Drug (Ingredient + Strength + Dose Form) ← CORE
// SBDC = Semantic Branded Drug Component
// SBDF = Semantic Branded Drug Form
// SBD  = Semantic Branded Drug (Brand + Strength + Dose Form)
// GPCK = Generic Pack
// BPCK = Branded Pack
// DFG  = Dose Form Group
// DF   = Dose Form

const IMPORTANT_TTY = new Set([
  'IN', 'PIN', 'MIN', 'BN',
  'SCDC', 'SCDF', 'SCD',
  'SBDC', 'SBDF', 'SBD',
  'GPCK', 'BPCK',
  'DFG', 'DF'
]);

// ─── Schema ──────────────────────────────────────────────────────────────────

async function createSchema() {
  const client = await pool.connect();
  try {
    console.log('\n🗑️  Dropping existing RxNorm tables (if any)...');
    await client.query(`
      DROP TABLE IF EXISTS rxnorm_relationship CASCADE;
      DROP TABLE IF EXISTS rxnorm_attribute CASCADE;
      DROP TABLE IF EXISTS rxnorm_concept CASCADE;
    `);

    console.log('📦 Creating RxNorm tables...');

    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    // rxnorm_concept — from RXNCONSO.RRF
    // Each row is one atom (a name for a concept in a source vocabulary).
    // RXCUI is the RxNorm concept identifier. SAB='RXNORM' rows are canonical.
    await client.query(`
      CREATE TABLE rxnorm_concept (
        rxcui       TEXT NOT NULL,
        rxaui       TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        tty         TEXT NOT NULL,
        sab         TEXT NOT NULL DEFAULT 'RXNORM',
        suppress    CHAR(1) DEFAULT 'N',
        tsv         TSVECTOR
      );

      CREATE INDEX idx_rxnorm_rxcui      ON rxnorm_concept (rxcui);
      CREATE INDEX idx_rxnorm_tty        ON rxnorm_concept (tty);
      CREATE INDEX idx_rxnorm_sab        ON rxnorm_concept (sab);
    `);

    // rxnorm_relationship — from RXNREL.RRF
    await client.query(`
      CREATE TABLE rxnorm_relationship (
        rxcui1  TEXT NOT NULL,
        rxcui2  TEXT NOT NULL,
        rel     TEXT NOT NULL,
        rela    TEXT,
        sab     TEXT
      );

      CREATE INDEX idx_rxnorm_rel_rxcui1 ON rxnorm_relationship (rxcui1);
      CREATE INDEX idx_rxnorm_rel_rxcui2 ON rxnorm_relationship (rxcui2);
      CREATE INDEX idx_rxnorm_rel_rela   ON rxnorm_relationship (rela);
    `);

    // rxnorm_attribute — from RXNSAT.RRF (selected useful ATN codes)
    await client.query(`
      CREATE TABLE rxnorm_attribute (
        rxcui   TEXT NOT NULL,
        atn     TEXT NOT NULL,
        atv     TEXT,
        sab     TEXT
      );

      CREATE INDEX idx_rxnorm_attr_rxcui ON rxnorm_attribute (rxcui);
      CREATE INDEX idx_rxnorm_attr_atn   ON rxnorm_attribute (atn);
    `);

    console.log('✅ RxNorm tables created.');
  } finally {
    client.release();
  }
}

// ─── Batch Insert Helper ─────────────────────────────────────────────────────

async function flushBatch(sql: string, rows: any[][]) {
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(sql, row);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Import RXNCONSO ─────────────────────────────────────────────────────────
// Columns (0-indexed):
// 0:RXCUI 1:LAT 2:TS 3:LUI 4:STT 5:SUI 6:ISPREF 7:RXAUI 8:SAUI
// 9:SCUI 10:SDUI 11:SAB 12:TTY 13:CODE 14:STR 15:SRL 16:SUPPRESS 17:CVF

async function importConso(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('   Please download the RxNorm Full Release from:');
    console.error('   https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html');
    console.error('   and unzip into: RxNorm/rrf/');
    return 0;
  }

  console.log(`\n📂 Importing RXNCONSO (concepts & names)...`);

  const sql = `INSERT INTO rxnorm_concept (rxcui, rxaui, name, tty, sab, suppress)
               VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (rxaui) DO NOTHING`;

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('|');
    const rxcui    = f[0];
    const rxaui    = f[7];
    const sab      = f[11];
    const tty      = f[12];
    const name     = f[14];
    const suppress = f[16] || 'N';

    // Only import English, RxNorm-source rows for meaningful TTYs
    if (f[1] !== 'ENG') continue;
    if (sab !== 'RXNORM') continue;
    if (!IMPORTANT_TTY.has(tty)) continue;
    if (suppress === 'Y' || suppress === 'E') continue;

    batch.push([rxcui, rxaui, name, tty, sab, suppress]);
    count++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(sql, batch);
      batch = [];
      process.stdout.write(`\r   Processed ${count.toLocaleString()} concepts...`);
    }
  }

  if (batch.length > 0) await flushBatch(sql, batch);
  console.log(`\n   ✅ rxnorm_concept: ${count.toLocaleString()} rows imported.`);
  return count;
}

// ─── Import RXNREL ───────────────────────────────────────────────────────────
// Key RELA values we care about:
// has_ingredient, ingredient_of, tradename_of, has_tradename,
// has_dose_form, dose_form_of, has_form, form_of,
// has_quantified_form, quantified_form_of, consists_of, contained_in

const IMPORTANT_RELA = new Set([
  'has_ingredient', 'ingredient_of',
  'tradename_of', 'has_tradename',
  'has_dose_form', 'dose_form_of',
  'has_form', 'form_of',
  'has_quantified_form', 'quantified_form_of',
  'consists_of', 'contained_in',
  'isa', 'inverse_isa'
]);

async function importRel(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  RXNREL.RRF not found — skipping relationships.`);
    return 0;
  }

  console.log(`\n📂 Importing RXNREL (relationships)...`);

  const sql = `INSERT INTO rxnorm_relationship (rxcui1, rxcui2, rel, rela, sab)
               VALUES ($1,$2,$3,$4,$5)`;

  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = line.split('|');
    const rxcui1 = f[0];
    const rxcui2 = f[4];
    const rel    = f[3];
    const rela   = f[7] || null;
    const sab    = f[10];
    const suppress = f[14] || 'N';

    if (sab !== 'RXNORM') continue;
    if (suppress === 'Y') continue;
    if (rela && !IMPORTANT_RELA.has(rela)) continue;

    batch.push([rxcui1, rxcui2, rel, rela, sab]);
    count++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(sql, batch);
      batch = [];
      process.stdout.write(`\r   Processed ${count.toLocaleString()} relationships...`);
    }
  }

  if (batch.length > 0) await flushBatch(sql, batch);
  console.log(`\n   ✅ rxnorm_relationship: ${count.toLocaleString()} rows imported.`);
  return count;
}

// ─── Import RXNSAT (selected attributes) ─────────────────────────────────────
// Useful ATN codes:
// RXN_STRENGTH, RXN_AVAILABLE_STRENGTH, RXN_HUMAN_DRUG, RXN_VET_DRUG
// RXN_IN_EXPRESSED_FLAG, AMBIGUITY_FLAG, RXN_ACTIVATED

const IMPORTANT_ATN = new Set([
  'RXN_STRENGTH',
  'RXN_AVAILABLE_STRENGTH',
  'RXN_HUMAN_DRUG',
  'RXN_VET_DRUG',
  'RXN_QUANTITY',
  'RXN_BOSS_STRENGTH_NUM_VALUE',
  'RXN_BOSS_STRENGTH_NUM_UNIT',
  'RXN_BOSS_STRENGTH_DENOM_VALUE',
  'RXN_BOSS_STRENGTH_DENOM_UNIT',
]);

async function importSat(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  RXNSAT.RRF not found — skipping attributes.`);
    return 0;
  }

  console.log(`\n📂 Importing RXNSAT (drug attributes)...`);

  const sql = `INSERT INTO rxnorm_attribute (rxcui, atn, atv, sab) VALUES ($1,$2,$3,$4)`;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let count = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const f    = line.split('|');
    const rxcui = f[0];
    const sab   = f[9];
    const atn   = f[8];
    const atv   = f[10] || null;
    const suppress = f[16] || 'N';

    if (sab !== 'RXNORM') continue;
    if (suppress === 'Y') continue;
    if (!IMPORTANT_ATN.has(atn)) continue;

    batch.push([rxcui, atn, atv, sab]);
    count++;

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(sql, batch);
      batch = [];
      process.stdout.write(`\r   Processed ${count.toLocaleString()} attributes...`);
    }
  }

  if (batch.length > 0) await flushBatch(sql, batch);
  console.log(`\n   ✅ rxnorm_attribute: ${count.toLocaleString()} rows imported.`);
  return count;
}

// ─── Build Full-Text Search Index ────────────────────────────────────────────

async function buildIndexes() {
  console.log('\n🔧 Building full-text search indexes...');
  const client = await pool.connect();
  try {
    console.log('   Populating tsvector column on rxnorm_concept...');
    await client.query(`UPDATE rxnorm_concept SET tsv = to_tsvector('english', name);`);

    console.log('   Creating GIN index on tsvector...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rxnorm_tsv   ON rxnorm_concept USING GIN (tsv);`);

    console.log('   Creating trigram index on name (fuzzy/prefix)...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rxnorm_trgm  ON rxnorm_concept USING GIN (name gin_trgm_ops);`);

    console.log('   ✅ All indexes built.');
  } finally {
    client.release();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   RxNorm Full Release → PostgreSQL Import            ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const rrfDir = path.join(__dirname, '..', 'RxNorm_full_06022025', 'rrf');

  if (!fs.existsSync(rrfDir)) {
    console.error(`\n❌ RxNorm RRF directory not found: ${rrfDir}`);
    console.error('\n📋 Setup Instructions:');
    console.error('   1. Go to: https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html');
    console.error('   2. Download "RxNorm Full Monthly Release"');
    console.error('   3. Unzip → place RXNCONSO.RRF, RXNREL.RRF, RXNSAT.RRF into:');
    console.error(`      ${rrfDir}`);
    process.exit(1);
  }

  await createSchema();

  await importConso(path.join(rrfDir, 'RXNCONSO.RRF'));
  await importRel(path.join(rrfDir, 'RXNREL.RRF'));
  await importSat(path.join(rrfDir, 'RXNSAT.RRF'));
  await buildIndexes();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 RxNorm import complete in ${elapsed}s`);
  console.log('   Tables: rxnorm_concept, rxnorm_relationship, rxnorm_attribute');
  console.log('\n   Next step: npx tsx server/import-rxnorm-pg.ts');

  await pool.end();
}

main().catch((err) => {
  console.error('\n❌ RxNorm Import failed:', err);
  pool.end();
  process.exit(1);
});

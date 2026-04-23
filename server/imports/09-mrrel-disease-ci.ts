/**
 * 09-mrrel-disease-ci.ts
 *
 * Phase C4a: Mine UMLS MRREL.RRF for CI_with (contraindicated_with) pairs
 * to build a properly SNOMED-coded disease→drug contraindication bridge table.
 *
 * Algorithm:
 *   Pass 1 — Stream MRCONSO.RRF to build two lookup maps:
 *     cui_to_rxcui : CUI → {rxcui, name}  (SAB=RXNORM, TTY=IN)
 *     cui_to_snomed: CUI → {code, term}    (SAB=SNOMEDCT_US)
 *
 *   Pass 2 — Stream MRREL.RRF (63M rows), filter RELA='CI_with'
 *     For each pair (CUI1, CUI2):
 *       Try A: CUI1=drug, CUI2=disease
 *       Try B: CUI1=disease, CUI2=drug (bidirectional check)
 *     Insert resolved pairs into cdss_disease_contraindication
 *
 * Run: npx tsx server/imports/09-mrrel-disease-ci.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

const META_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META';
const MRCONSO  = path.join(META_DIR, 'MRCONSO.RRF');
const MRREL    = path.join(META_DIR, 'MRREL.RRF');
const BATCH    = 2_000;

// ─── MRCONSO field indices ────────────────────────────────────────────────────
// CUI|LAT|TS|LUI|STT|SUI|ISPREF|AUI|SAUI|SCUI|SDUI|SAB|TTY|CODE|STR|SRL|SUPPRESS|CVF
const CUI = 0, SAB = 11, TTY = 12, CODE = 13, STR = 14;

// ─── MRREL field indices ──────────────────────────────────────────────────────
// CUI1|AUI1|STYPE1|REL|CUI2|AUI2|STYPE2|RELA|RUI|SRUI|SAB|SL|RG|DIR|SUPPRESS|CVF
const CUI1 = 0, CUI2 = 4, RELA = 7, R_SAB = 10, SUPPRESS = 14;

// MED-RT CI RELA types (from diagnosis scan):
// 'contraindicated_with_disease' — Disease CUI1 contraindicated with Drug CUI2 (or reverse)
// 'has_contraindicated_drug'     — Disease has contraindicated drug (same data, inverse)
// 'has_contraindicated_class'    — Drug class CI (less specific, use as fallback)
const CI_RELAS = new Set([
  'contraindicated_with_disease',
  'has_contraindicated_drug',
]);

// ─── Lookup maps ─────────────────────────────────────────────────────────────
type DrugEntry    = { rxcui: string; name: string };
type DiseaseEntry = { code: string;  term: string };

const cuiToDrug    = new Map<string, DrugEntry>();
const cuiToDisease = new Map<string, DiseaseEntry>();

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function createTable() {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS cdss_disease_contraindication (
        id              SERIAL PRIMARY KEY,
        snomed_code     VARCHAR(20)  NOT NULL,
        snomed_term     VARCHAR(300),
        drug_rxcui      VARCHAR(20)  NOT NULL,
        drug_name       VARCHAR(300),
        severity        VARCHAR(20)  DEFAULT 'absolute',
        source          VARCHAR(30)  DEFAULT 'MED-RT',
        created_at      TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE (snomed_code, drug_rxcui, source)
      );
      CREATE INDEX IF NOT EXISTS idx_dci_snomed ON cdss_disease_contraindication(snomed_code);
      CREATE INDEX IF NOT EXISTS idx_dci_drug   ON cdss_disease_contraindication(drug_rxcui);
    `);
    await c.query(`TRUNCATE TABLE cdss_disease_contraindication`);
    console.log('  ✅ Table cdss_disease_contraindication ready');
  } finally { c.release(); }
}

async function flush(rows: any[][]) {
  if (!rows.length) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const r of rows) {
      await c.query(`
        INSERT INTO cdss_disease_contraindication
          (snomed_code, snomed_term, drug_rxcui, drug_name, severity, source)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (snomed_code, drug_rxcui, source) DO NOTHING
      `, r);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

// ─── Pass 1: Build maps from MRCONSO ─────────────────────────────────────────
async function buildLookupMaps() {
  console.log('\n📂 Pass 1: Building CUI lookup maps from MRCONSO.RRF...');
  console.log('   (SAB=RXNORM TTY=IN → drug map | SAB=SNOMEDCT_US → disease map)');

  const rl = readline.createInterface({
    input: fs.createReadStream(MRCONSO, 'utf8'),
    crlfDelay: Infinity
  });

  let total = 0, drugs = 0, diseases = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const f = line.split('|');
    const cui = f[CUI];
    const sab = f[SAB];
    const tty = f[TTY];
    const code = f[CODE];
    const str  = f[STR];

    // Drug: RxNorm Ingredient-level concepts
    if (sab === 'RXNORM' && (tty === 'IN' || tty === 'MIN') && !cuiToDrug.has(cui)) {
      cuiToDrug.set(cui, { rxcui: code, name: str });
      drugs++;
    }

    // Disease: SNOMED CT concepts (any semantic type — we rely on CI_with being disease-only)
    if (sab === 'SNOMEDCT_US' && !cuiToDisease.has(cui)) {
      cuiToDisease.set(cui, { code, term: str });
      diseases++;
    }

    if (total % 1_000_000 === 0) {
      process.stdout.write(`\r   Lines: ${(total/1e6).toFixed(1)}M | Drugs: ${drugs.toLocaleString()} | Diseases: ${diseases.toLocaleString()}`);
    }
  }

  console.log(`\n   ✅ Pass 1 done: ${drugs.toLocaleString()} drug CUIs | ${diseases.toLocaleString()} disease CUIs`);
}

// ─── Pass 2: Stream MRREL for CI_with ────────────────────────────────────────
async function mineContraindications() {
  console.log('\n📂 Pass 2: Streaming MRREL.RRF for CI_with relationships...');

  const rl = readline.createInterface({
    input: fs.createReadStream(MRREL, 'utf8'),
    crlfDelay: Infinity
  });

  let total = 0, ciRows = 0, resolved = 0, batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    const f = line.split('|');
    // Skip suppressed rows
    if (f[SUPPRESS] === 'Y' || f[SUPPRESS] === 'O') continue;
    // Only CI-relevant relationships
    if (!CI_RELAS.has(f[RELA])) continue;

    ciRows++;
    const cui1 = f[CUI1];
    const cui2 = f[CUI2];

    // Try direction A: CUI1=drug, CUI2=disease
    const drugA    = cuiToDrug.get(cui1);
    const diseaseA = cuiToDisease.get(cui2);

    // Try direction B: CUI1=disease, CUI2=drug (bidirectional)
    const diseaseB = cuiToDisease.get(cui1);
    const drugB    = cuiToDrug.get(cui2);

    let row: any[] | null = null;

    if (drugA && diseaseA) {
      row = [diseaseA.code, diseaseA.term, drugA.rxcui, drugA.name, 'absolute', 'MED-RT'];
    } else if (drugB && diseaseB) {
      row = [diseaseB.code, diseaseB.term, drugB.rxcui, drugB.name, 'absolute', 'MED-RT'];
    }

    if (row) {
      resolved++;
      batch.push(row);
      if (batch.length >= BATCH) {
        await flush(batch);
        batch = [];
        process.stdout.write(`\r   MRREL rows: ${(total/1e6).toFixed(1)}M | CI_with found: ${ciRows.toLocaleString()} | Resolved+inserted: ${resolved.toLocaleString()}`);
      }
    }
  }

  if (batch.length) await flush(batch);
  console.log(`\n   ✅ Pass 2 done:`);
  console.log(`      Total MRREL rows scanned: ${total.toLocaleString()}`);
  console.log(`      CI_with rows found:        ${ciRows.toLocaleString()}`);
  console.log(`      Resolved (SNOMED+RXCUI):  ${resolved.toLocaleString()}`);
}

// ─── Verify results ────────────────────────────────────────────────────────────
async function verify() {
  const c = await pool.connect();
  console.log('\n🔍 Verification:\n');

  const total = await c.query(`SELECT COUNT(*) as n FROM cdss_disease_contraindication`);
  console.log(`  Total pairs: ${parseInt(total.rows[0].n).toLocaleString()}`);

  const diseases = await c.query(`SELECT COUNT(DISTINCT snomed_code) as n FROM cdss_disease_contraindication`);
  console.log(`  Unique diseases (SNOMED): ${parseInt(diseases.rows[0].n).toLocaleString()}`);

  const drugs = await c.query(`SELECT COUNT(DISTINCT drug_rxcui) as n FROM cdss_disease_contraindication`);
  console.log(`  Unique drugs (RXCUI): ${parseInt(drugs.rows[0].n).toLocaleString()}`);

  // Test classic examples
  console.log('\n  Classic CI checks:');
  const checks = [
    { label: 'CKD (709044004)',          code: '709044004' },
    { label: 'Heart Failure (84114007)', code: '84114007'  },
    { label: 'Asthma (195967001)',       code: '195967001' },
    { label: 'Pregnancy (77386006)',     code: '77386006'  },
  ];
  for (const { label, code } of checks) {
    const r = await c.query(
      `SELECT drug_name, drug_rxcui FROM cdss_disease_contraindication WHERE snomed_code=$1 ORDER BY drug_name LIMIT 8`,
      [code]
    );
    if (r.rows.length > 0) {
      console.log(`\n  ✅ ${label}: ${r.rows.length} contraindicated drugs`);
      for (const row of r.rows) console.log(`     💊 ${row.drug_name} (${row.drug_rxcui})`);
    } else {
      console.log(`  ⚪ ${label}: 0 results (SNOMED code may not match MED-RT directly)`);
    }
  }

  // Top diseases by CI drug count
  console.log('\n  Top 10 diseases by contraindicated drug count:');
  const top = await c.query(`
    SELECT snomed_term, snomed_code, COUNT(*) as n
    FROM cdss_disease_contraindication
    WHERE snomed_term NOT LIKE '%class%'
    GROUP BY snomed_term, snomed_code ORDER BY n DESC LIMIT 10
  `);
  for (const r of top.rows) console.log(`    [${r.snomed_code}] ${r.snomed_term}: ${r.n} drugs`);

  c.release();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase C4a: MRREL CI_with → Disease-Drug CI Bridge         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  for (const f of [MRCONSO, MRREL]) {
    if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`);
  }

  await createTable();
  await buildLookupMaps();
  await mineContraindications();
  await verify();

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\n🎉 Phase C4a complete in ${elapsed}s`);
  console.log('   Table: cdss_disease_contraindication');
  console.log('   Next:  Update API + SnomedBrowser UI to use coded CI pairs');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end();
  process.exit(1);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  UMLS MRREL.RRF → Comprehensive CDSS Drug-Indication Bridge
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  Parses MRREL.RRF to extract ALL may_treat / may_prevent / CI_with
 *  relationships, then resolves CUIs → SNOMED (disease) and CUIs → RxNorm
 *  (drug) using MRCONSO.RRF data already loaded.
 *
 *  Run:  npx tsx server/import-umls-indications.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createInterface } from 'readline';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 4,
});

const MRREL_FILE  = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META\\MRREL.RRF';
const MRCONSO_FILE = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META\\MRCONSO.RRF';
const BATCH = 5_000;

// Indication relationship types we care about
const WANTED_RELA = new Set([
  'may_treat',
  'may_prevent',
  'CI_with',
  'has_contraindication',
  'has_contraindicated_drug',        // CUI1=disease, CUI2=drug
  'contraindicated_with_disease',    // CUI1=drug, CUI2=disease
  'induces',
  'may_diagnose',
]);

// Rela values where CUI1=drug, CUI2=disease (opposite direction)
const REVERSED_DIRECTION_RELA = new Set([
  'contraindicated_with_disease',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function flush(sql: string, batch: any[][]) {
  const client = await pool.connect();
  try {
    for (const row of batch) {
      await client.query(sql, row);
    }
  } finally { client.release(); }
}

// ─── Step 1: Build CUI → SNOMED and CUI → RxNorm maps from MRCONSO ─────────
async function buildCuiMaps(): Promise<{ cuiToSnomed: Map<string, Set<string>>, cuiToRxcui: Map<string, Set<string>> }> {
  console.log('\n📂 Pass 1: Building CUI → SNOMED and CUI → RxNorm maps from MRCONSO.RRF...');
  
  if (!fs.existsSync(MRCONSO_FILE)) {
    throw new Error(`MRCONSO.RRF not found at ${MRCONSO_FILE}`);
  }

  const cuiToSnomed = new Map<string, Set<string>>();
  const cuiToRxcui  = new Map<string, Set<string>>();
  let lineCount = 0;

  const rl = createInterface({
    input: fs.createReadStream(MRCONSO_FILE, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineCount++;
    const f = line.split('|');
    const cui      = f[0];
    const sab      = f[11];
    const code     = f[13];
    const suppress = f[16] || 'N';

    if (suppress === 'Y' || suppress === 'E') continue;

    // SNOMED CT disorders → disease side
    if (sab === 'SNOMEDCT_US' && code) {
      if (!cuiToSnomed.has(cui)) cuiToSnomed.set(cui, new Set());
      cuiToSnomed.get(cui)!.add(code);
    }

    // RxNorm drugs → drug side
    if (sab === 'RXNORM' && code) {
      if (!cuiToRxcui.has(cui)) cuiToRxcui.set(cui, new Set());
      cuiToRxcui.get(cui)!.add(code);
    }

    if (lineCount % 500_000 === 0) {
      process.stdout.write(`\r   Lines: ${lineCount.toLocaleString()}  SNOMED CUIs: ${cuiToSnomed.size.toLocaleString()}  RxNorm CUIs: ${cuiToRxcui.size.toLocaleString()}`);
    }
  }

  console.log(`\n   ✅ SNOMED CUIs: ${cuiToSnomed.size.toLocaleString()} | RxNorm CUIs: ${cuiToRxcui.size.toLocaleString()}`);
  return { cuiToSnomed, cuiToRxcui };
}

// ─── Step 2: Parse MRREL.RRF for indication relationships ───────────────────
async function parseIndications(
  cuiToSnomed: Map<string, Set<string>>,
  cuiToRxcui:  Map<string, Set<string>>
) {
  console.log('\n📂 Pass 2: Extracting drug-indication relationships from MRREL.RRF...');

  if (!fs.existsSync(MRREL_FILE)) {
    throw new Error(`MRREL.RRF not found at ${MRREL_FILE}`);
  }

  // Create the comprehensive indications table
  const client = await pool.connect();
  try {
    await client.query(`
      DROP TABLE IF EXISTS umls_indication CASCADE;
      CREATE TABLE umls_indication (
        drug_cui     TEXT NOT NULL,
        disease_cui  TEXT NOT NULL,
        rela         TEXT NOT NULL,
        sab          TEXT NOT NULL
      );
    `);
  } finally { client.release(); }

  const insertSql = `INSERT INTO umls_indication (drug_cui, disease_cui, rela, sab) VALUES ($1, $2, $3, $4)`;

  const rl = createInterface({
    input: fs.createReadStream(MRREL_FILE, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let matchCount = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    lineCount++;
    const f = line.split('|');

    // MRREL format: CUI1|AUI1|STYPE1|REL|CUI2|AUI2|STYPE2|RELA|RUI|SRUI|SAB|SL|RG|DIR|SUPPRESS|CVF|
    const cui1     = f[0]; // Target (Disease)
    const rel      = f[3];
    const cui2     = f[4]; // Source (Drug)
    const rela     = f[7];
    const sab      = f[10];
    const suppress = f[14] || 'N';

    if (suppress === 'Y' || suppress === 'E') continue;
    if (!rela || !WANTED_RELA.has(rela)) continue;

    // Direction depends on rela type:
    // Most: CUI1=disease, CUI2=drug → drug_cui=cui2, disease_cui=cui1
    // Reversed: CUI1=drug, CUI2=disease → drug_cui=cui1, disease_cui=cui2
    if (REVERSED_DIRECTION_RELA.has(rela)) {
      batch.push([cui1, cui2, rela, sab]); // CUI1=drug, CUI2=disease
    } else {
      batch.push([cui2, cui1, rela, sab]); // CUI1=disease, CUI2=drug
    }
    matchCount++;

    if (batch.length >= BATCH) {
      await flush(insertSql, batch);
      batch = [];
      process.stdout.write(`\r   Lines: ${lineCount.toLocaleString()}  Indications: ${matchCount.toLocaleString()}`);
    }
  }

  if (batch.length) await flush(insertSql, batch);

  // Build indexes
  const c2 = await pool.connect();
  try {
    await c2.query(`CREATE INDEX idx_umls_ind_drug ON umls_indication (drug_cui);`);
    await c2.query(`CREATE INDEX idx_umls_ind_dis  ON umls_indication (disease_cui);`);
    await c2.query(`CREATE INDEX idx_umls_ind_rela ON umls_indication (rela);`);
  } finally { c2.release(); }

  console.log(`\n   ✅ umls_indication: ${matchCount.toLocaleString()} relationships`);
  return matchCount;
}

// ─── Step 3: Resolve CUIs and rebuild CDSS materialized view ─────────────────
async function buildCdssView(
  cuiToSnomed: Map<string, Set<string>>,
  cuiToRxcui:  Map<string, Set<string>>
) {
  console.log('\n🔗 Step 3: Resolving CUIs → SNOMED/RxNorm and building bridge tables...');

  // First, create resolved tables from in-memory maps
  const client = await pool.connect();
  try {
    // Build cui_snomed_map
    await client.query(`
      DROP TABLE IF EXISTS cui_snomed_map CASCADE;
      CREATE TABLE cui_snomed_map (
        cui         TEXT NOT NULL,
        snomed_code TEXT NOT NULL,
        PRIMARY KEY (cui, snomed_code)
      );
    `);

    // Build cui_rxcui_map
    await client.query(`
      DROP TABLE IF EXISTS cui_rxcui_map CASCADE;
      CREATE TABLE cui_rxcui_map (
        cui   TEXT NOT NULL,
        rxcui TEXT NOT NULL,
        PRIMARY KEY (cui, rxcui)
      );
    `);
  } finally { client.release(); }

  // Bulk-insert SNOMED map
  console.log('   Inserting CUI→SNOMED map...');
  const snomedSql = `INSERT INTO cui_snomed_map (cui, snomed_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`;
  let snomedBatch: any[][] = [];
  let snomedCount = 0;
  for (const [cui, codes] of cuiToSnomed) {
    for (const code of codes) {
      snomedBatch.push([cui, code]);
      snomedCount++;
      if (snomedBatch.length >= BATCH) {
        await flush(snomedSql, snomedBatch);
        snomedBatch = [];
        if (snomedCount % 50_000 === 0) process.stdout.write(`\r   SNOMED: ${snomedCount.toLocaleString()}`);
      }
    }
  }
  if (snomedBatch.length) await flush(snomedSql, snomedBatch);
  console.log(`\n   ✅ cui_snomed_map: ${snomedCount.toLocaleString()}`);

  // Bulk-insert RxNorm map
  console.log('   Inserting CUI→RxNorm map...');
  const rxSql = `INSERT INTO cui_rxcui_map (cui, rxcui) VALUES ($1, $2) ON CONFLICT DO NOTHING`;
  let rxBatch: any[][] = [];
  let rxCount = 0;
  for (const [cui, codes] of cuiToRxcui) {
    for (const code of codes) {
      rxBatch.push([cui, code]);
      rxCount++;
      if (rxBatch.length >= BATCH) {
        await flush(rxSql, rxBatch);
        rxBatch = [];
        if (rxCount % 50_000 === 0) process.stdout.write(`\r   RxNorm: ${rxCount.toLocaleString()}`);
      }
    }
  }
  if (rxBatch.length) await flush(rxSql, rxBatch);
  console.log(`\n   ✅ cui_rxcui_map: ${rxCount.toLocaleString()}`);

  // Free memory
  cuiToSnomed.clear();
  cuiToRxcui.clear();

  // Build indexes
  const c2 = await pool.connect();
  try {
    await c2.query(`CREATE INDEX IF NOT EXISTS idx_csm_cui ON cui_snomed_map (cui);`);
    await c2.query(`CREATE INDEX IF NOT EXISTS idx_crm_cui ON cui_rxcui_map (cui);`);
  } finally { c2.release(); }

  // ──── Build the CDSS table (regular table, no dependencies) ────────────────
  console.log('\n🔧 Building comprehensive CDSS drug table...');
  const c3 = await pool.connect();
  try {
    // Drop old table or view safely (handle either case)
    await c3.query(`DROP TABLE IF EXISTS cdss_snomed_drugs CASCADE;`);
    await c3.query(`
      DO $$ BEGIN
        EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS cdss_snomed_drugs CASCADE';
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    await c3.query(`
      CREATE TABLE cdss_snomed_drugs (
        snomed_code        TEXT NOT NULL,
        drug_rxcui         TEXT NOT NULL,
        drug_name          TEXT,
        tty                TEXT,
        indication_type    TEXT,
        drug_medrt_name    TEXT,
        disease_medrt_name TEXT
      );
    `);

    await c3.query(`
      INSERT INTO cdss_snomed_drugs (snomed_code, drug_rxcui, drug_name, tty, indication_type, drug_medrt_name, disease_medrt_name)
      SELECT DISTINCT
        csm.snomed_code,
        rc.rxcui,
        rc.name,
        rc.tty,
        CASE 
          WHEN ui.rela IN ('has_contraindicated_drug', 'contraindicated_with_disease', 'has_contraindication', 'CI_with')
            THEN 'CI_with'
          ELSE ui.rela
        END,
        NULL::text,
        NULL::text
      FROM umls_indication ui
      -- Semantic type filter: disease side must be a disorder/finding, not a substance/product
      JOIN umls_semantic_type ust_d ON ust_d.cui = ui.disease_cui
                                    AND ust_d.sty IN (
                                      'Disease or Syndrome',
                                      'Mental or Behavioral Dysfunction',
                                      'Neoplastic Process',
                                      'Injury or Poisoning',
                                      'Pathologic Function',
                                      'Sign or Symptom',
                                      'Finding',
                                      'Congenital Abnormality',
                                      'Acquired Abnormality',
                                      'Anatomical Abnormality'
                                    )
      -- Semantic type filter: drug side must be pharmacological — not lab reagents etc.
      JOIN umls_semantic_type ust_rx ON ust_rx.cui = ui.drug_cui
                                     AND ust_rx.sty IN (
                                       'Pharmacologic Substance',
                                       'Clinical Drug',
                                       'Antibiotic',
                                       'Biomedical or Dental Material',
                                       'Organic Chemical',
                                       'Amino Acid, Peptide, or Protein',
                                       'Immunologic Factor',
                                       'Hormone',
                                       'Enzyme',
                                       'Vitamin'
                                     )
      JOIN cui_snomed_map csm ON csm.cui = ui.disease_cui
      JOIN cui_rxcui_map  crm ON crm.cui = ui.drug_cui
      JOIN rxnorm_concept rc  ON rc.rxcui = crm.rxcui
                               AND rc.sab = 'RXNORM'
                               AND rc.tty IN ('IN', 'MIN', 'BN', 'SCD', 'SCDF')
      WHERE ui.rela IN ('may_treat', 'may_prevent', 'CI_with', 'has_contraindicated_drug', 'contraindicated_with_disease', 'has_contraindication', 'induces');
    `);

    // Belt-and-suspenders: remove any substance/product SNOMED codes that slipped through
    await c3.query(`
      DELETE FROM cdss_snomed_drugs cd
      USING snomed_description sd
      WHERE sd.concept_id = cd.snomed_code
        AND sd.type_id = '900000000000003001'
        AND sd.active = 1
        AND (
          sd.term LIKE '%(substance)%'        OR
          sd.term LIKE '%(product)%'          OR
          sd.term LIKE '%(medicinal product)%' OR
          sd.term LIKE '%(organism)%'         OR
          sd.term LIKE '%(chemical)%'         OR
          sd.term LIKE '%(biological product)%'
        )
    `);

    await c3.query(`CREATE INDEX idx_cdss_snomed ON cdss_snomed_drugs (snomed_code);`);
    await c3.query(`CREATE INDEX idx_cdss_tty    ON cdss_snomed_drugs (tty);`);
    await c3.query(`CREATE INDEX idx_cdss_rxcui  ON cdss_snomed_drugs (drug_rxcui);`);

    const { rows } = await c3.query(`SELECT COUNT(*) FROM cdss_snomed_drugs`);
    console.log(`   ✅ cdss_snomed_drugs: ${parseInt(rows[0].count).toLocaleString()} SNOMED→Drug links`);
  } finally { c3.release(); }
}

// ─── Verification ────────────────────────────────────────────────────────────
async function verify() {
  const client = await pool.connect();
  try {
    console.log('\n🔍 Verification — SNOMED disorder → Drug lookups:\n');
    const tests = [
      { name: 'Diabetes mellitus',  code: '73211009' },
      { name: 'Hypertension',       code: '38341003' },
      { name: 'Asthma',             code: '195967001' },
      { name: 'Hyperlipidemia',     code: '55822004' },
      { name: 'Cough',              code: '49727002' },
      { name: 'Depression',         code: '35489007' },
      { name: 'Heart failure',      code: '84114007' },
      { name: 'Epilepsy',           code: '84757009' },
    ];
    for (const t of tests) {
      const { rows } = await client.query(
        `SELECT drug_name, tty, indication_type FROM cdss_snomed_drugs WHERE snomed_code = $1 LIMIT 5`,
        [t.code]
      );
      if (rows.length > 0) {
        console.log(`   ✅ ${t.name} (${t.code}) → ${rows.length}+ results`);
        for (const r of rows) {
          console.log(`      - [${r.tty}] ${r.drug_name} (${r.indication_type})`);
        }
      } else {
        console.log(`   ⚠️  ${t.name} (${t.code}) → no results`);
      }
    }

    // Total unique conditions with drugs
    const { rows: stats } = await client.query(`
      SELECT 
        COUNT(DISTINCT snomed_code) AS conditions,
        COUNT(DISTINCT drug_rxcui)  AS drugs,
        COUNT(*)                    AS total_links
      FROM cdss_snomed_drugs
    `);
    console.log(`\n📊 Coverage: ${stats[0].conditions} conditions × ${stats[0].drugs} drugs = ${parseInt(stats[0].total_links).toLocaleString()} links`);
  } finally { client.release(); }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
async function cleanup() {
  const client = await pool.connect();
  try {
    console.log('\n🧹 Cleaning up temporary tables...');
    await client.query(`DROP TABLE IF EXISTS cui_snomed_map;`);
    await client.query(`DROP TABLE IF EXISTS cui_rxcui_map;`);
    await client.query(`DROP TABLE IF EXISTS umls_indication;`);
    console.log('   ✅ Temporary tables removed');
  } finally { client.release(); }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   UMLS MRREL.RRF → Comprehensive CDSS Indication Bridge    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Step 1: Build in-memory CUI maps from MRCONSO
  const { cuiToSnomed, cuiToRxcui } = await buildCuiMaps();

  // Step 2: Extract indication relationships from MRREL
  await parseIndications(cuiToSnomed, cuiToRxcui);

  // Step 3: Resolve and build materialized view
  await buildCdssView(cuiToSnomed, cuiToRxcui);

  // Step 4: Verify
  await verify();

  // Step 5: Cleanup temp tables
  await cleanup();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 UMLS indication import complete in ${elapsed}s`);
  console.log(`   View: cdss_snomed_drugs ← primary CDSS query target`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end();
  process.exit(1);
});

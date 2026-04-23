/**
 * 03-umls-bridge.ts
 *
 * Imports UMLS Metathesaurus semantic types from MRSTY.RRF into the
 * `umls_semantic_type` table. This enables:
 *
 *  1. Intelligent CDSS filtering — distinguish "Pharmacologic Substance" (T121)
 *     from "Disease or Syndrome" (T047) CUIs in the drug-indication bridge.
 *  2. Fix CI_with directionality — identify which CUIs are drugs vs. diseases.
 *
 * Run AFTER 01-snomed.ts and 02-rxnorm.ts:
 *   npx tsx server/imports/03-umls-bridge.ts
 */

import { Pool } from 'pg';
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

const META_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META';
const MRSTY    = path.join(META_DIR, 'MRSTY.RRF');
const BATCH    = 10_000;

// Key semantic types for clinical decision support
// Full list: https://metamap.nlm.nih.gov/Docs/SemanticTypes_2018AB.txt
const CLINICAL_STY = new Set([
  'Pharmacologic Substance',       // T121 — drugs
  'Clinical Drug',                 // T200
  'Antibiotic',                    // T195
  'Biomedical or Dental Material', // T122
  'Organic Chemical',              // T109 (many drugs)
  'Amino Acid, Peptide, or Protein', // T116
  'Immunologic Factor',            // T129
  'Hormone',                       // T125
  'Enzyme',                        // T126
  'Vitamin',                       // T127
  'Indicator, Reagent, or Diagnostic Aid', // T130
  'Disease or Syndrome',           // T047
  'Mental or Behavioral Dysfunction', // T048
  'Neoplastic Process',            // T191
  'Injury or Poisoning',           // T037
  'Pathologic Function',           // T046
  'Sign or Symptom',               // T184
  'Finding',                       // T033
  'Congenital Abnormality',        // T019
  'Acquired Abnormality',          // T020
  'Anatomical Abnormality',        // T190
]);

async function flush(sql: string, batch: any[][]) {
  if (!batch.length) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const row of batch) await c.query(sql, row);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

async function importMrsty() {
  if (!fs.existsSync(MRSTY)) {
    throw new Error(`MRSTY.RRF not found at ${MRSTY}`);
  }

  console.log('\n📂 Pass 1: Importing UMLS Semantic Types from MRSTY.RRF...');
  console.log('   (Filtering to clinically relevant types only)');

  // MRSTY format: CUI|TUI|STN|STY|ATUI|CVF|
  // 0:CUI  1:TUI  2:STN  3:STY  4:ATUI  5:CVF

  await pool.query(`TRUNCATE TABLE umls_semantic_type;`);

  const insertSql = `
    INSERT INTO umls_semantic_type (cui, tui, sty)
    VALUES ($1, $2, $3)
    ON CONFLICT (cui, tui) DO NOTHING
  `;

  const rl = readline.createInterface({ input: fs.createReadStream(MRSTY, 'utf8'), crlfDelay: Infinity });
  let total = 0, inserted = 0;
  let batch: any[][] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const f = line.split('|');
    const cui = f[0];
    const tui = f[1];
    const sty = f[3];

    // Only import clinically relevant semantic types to save space
    if (!CLINICAL_STY.has(sty)) continue;

    batch.push([cui, tui, sty]);
    inserted++;

    if (batch.length >= BATCH) {
      await flush(insertSql, batch);
      batch = [];
      process.stdout.write(`\r   Lines: ${total.toLocaleString()}  Inserted: ${inserted.toLocaleString()}`);
    }
  }

  if (batch.length) await flush(insertSql, batch);
  console.log(`\n   ✅ umls_semantic_type: ${inserted.toLocaleString()} rows (from ${total.toLocaleString()} total)`);
  return inserted;
}

async function verify() {
  const c = await pool.connect();
  try {
    console.log('\n🔍 Verification:\n');

    // STY distribution
    const r1 = await c.query(`
      SELECT sty, COUNT(*) as cnt
      FROM umls_semantic_type
      GROUP BY sty
      ORDER BY cnt DESC
      LIMIT 15
    `);
    console.log('Top semantic types:');
    for (const row of r1.rows) {
      console.log(`  ${row.sty}: ${parseInt(row.cnt).toLocaleString()} CUIs`);
    }

    // How many CDSS disease CUIs now have semantic type labels?
    const r2 = await c.query(`
      SELECT COUNT(DISTINCT cd.snomed_code) as snomed_codes,
             COUNT(DISTINCT ust.cui) as cui_with_sty
      FROM cdss_snomed_drugs cd
      LEFT JOIN snomed_description sd ON sd.concept_id = cd.snomed_code AND sd.active = 1
      LEFT JOIN umls_semantic_type ust ON ust.sty IN ('Disease or Syndrome','Mental or Behavioral Dysfunction','Neoplastic Process')
    `);
    console.log('\nCDSS coverage:', r2.rows[0]);

  } finally { c.release(); }
}

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   UMLS MRSTY.RRF → Semantic Type Import (Phase B2)         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await importMrsty();
  await verify();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 MRSTY import complete in ${elapsed}s`);
  console.log('   Table: umls_semantic_type');
  console.log('   Next:  schema views (sct_*, rx_*) are auto-created at server start');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end();
  process.exit(1);
});

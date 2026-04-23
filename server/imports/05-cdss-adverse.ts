/**
 * 05-cdss-adverse.ts  — Phase C2 (Memory-Optimized)
 *
 * Imports ADR links from MRREL.RRF into cdss_drug_adverse_effect.
 * Uses a 3-pass strategy to stay within memory limits:
 *   Pass 1: Scan MRREL → collect only NEEDED CUIs (drug + effect)
 *   Pass 2: Scan MRCONSO → resolve names/codes for NEEDED CUIs only
 *   Pass 3: Scan MRREL again → write to DB using resolved names
 *
 * RELA types captured:
 *   has_physiologic_effect                    [MED-RT]   11,672
 *   chemical_or_drug_has_physiologic_effect   [NCI]       3,048
 *   induces                                   [MED-RT]      169
 *   has_definitional_manifestation            [SNOMEDCT] 10,929
 *   cause_of (drug as cause)                  [SNOMEDCT] ~28,071
 *
 *   npx tsx server/imports/05-cdss-adverse.ts
 */

import { Pool, PoolClient } from 'pg';
import fs from 'fs';
import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const META_DIR = 'D:\\Healthcare Solutions\\MTM Project\\MTM\\MED-R\\umls-2025AB-metathesaurus-full\\2025AB\\META';
const MRREL    = path.join(META_DIR, 'MRREL.RRF');
const MRCONSO  = path.join(META_DIR, 'MRCONSO.RRF');
const BATCH    = 5_000;

// ADR RELA: CUI1=drug, CUI2=effect
const ADR_RELA = new Set([
  'has_physiologic_effect', 'chemical_or_drug_has_physiologic_effect',
  'induces', 'has_definitional_manifestation', 'cause_of',
  'has_contraindicated_physiologic_effect',  // MED-RT: contraindicated effects
]);

const DRUG_STY = new Set([
  'Pharmacologic Substance', 'Clinical Drug', 'Antibiotic',
  'Organic Chemical', 'Amino Acid, Peptide, or Protein',
  'Immunologic Factor', 'Hormone', 'Enzyme', 'Vitamin',
  'Biomedical or Dental Material',
]);

// Effect STY: includes both clinical disease types AND pharmacological effect types
// MED-RT has_physiologic_effect → CUI2 has "Pharmacologic Function", "Biologic Function" etc.
// SNOMED cause_of / has_definitional_manifestation → CUI2 has disorder/finding types
const EFFECT_STY = new Set([
  // Clinical outcomes (disease/symptom)
  'Disease or Syndrome', 'Mental or Behavioral Dysfunction', 'Neoplastic Process',
  'Injury or Poisoning', 'Pathologic Function', 'Sign or Symptom', 'Finding',
  'Congenital Abnormality', 'Acquired Abnormality', 'Anatomical Abnormality',
  // Pharmacological / physiological effects (MED-RT has_physiologic_effect)
  'Pharmacologic Substance',    // some effects are classified as substance interactions
  'Physiologic Function',
  'Biologic Function',
  'Cell Function',
  'Molecular Function',
  'Organism Function',
  'Mental Process',
  'Genetic Function',
  // Broad fallback for unclassified MED-RT effect concepts
  'Functional Concept',
  'Qualitative Concept',
  'Quantitative Concept',
]);

async function flush(client: PoolClient, batch: any[][]) {
  if (!batch.length) return;
  await client.query('BEGIN');
  for (const row of batch) {
    await client.query(`
      INSERT INTO cdss_drug_adverse_effect
        (drug_rxcui, drug_name, effect_cui, effect_snomed, effect_name, rela, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
    `, row);
  }
  await client.query('COMMIT');
}

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Phase C2: cdss_drug_adverse_effect — MRREL ADR Import     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const c = await pool.connect();

  // Load drug CUIs from semantic type table (only these 21 types are in our filtered DB)
  console.log('📂 Loading drug semantic type filters from DB...');
  const drugCuis = new Set<string>();
  {
    const r = await c.query(`SELECT cui FROM umls_semantic_type WHERE sty = ANY($1)`, [Array.from(DRUG_STY)]);
    r.rows.forEach(row => drugCuis.add(row.cui));
    // Also load effect CUIs (for SNOMED cause_of filtering)
    console.log(`   Drug CUIs: ${drugCuis.size.toLocaleString()}`);
  }
  // Effect CUIs — only for SNOMED cause_of (which is broad and needs filtering)
  const effectCuis = new Set<string>();
  {
    const r = await c.query(`SELECT cui FROM umls_semantic_type WHERE sty = ANY($1)`, [Array.from(EFFECT_STY)]);
    r.rows.forEach(row => effectCuis.add(row.cui));
    console.log(`   Effect CUIs (for SNOMED filter): ${effectCuis.size.toLocaleString()}`);
  }

  // ── Pass 1: Collect NEEDED CUI pairs from MRREL ────────────────────────────
  console.log('\n📂 Pass 1: Scanning MRREL for relevant CUI pairs...');
  // RELA direction map:
  // REVERSED (CUI1=effect, CUI2=drug): has_physiologic_effect, chemical_or_drug_has_physiologic_effect
  // FORWARD  (CUI1=drug,   CUI2=effect): induces, cause_of, has_definitional_manifestation, has_contraindicated_physiologic_effect
  const REVERSED_RELA = new Set([
    'physiologic_effect_of',
    'has_physiologic_effect',                        // CUI1=effect, CUI2=drug ← reversed in MRREL
    'chemical_or_drug_has_physiologic_effect',       // per NCI convention: CUI1=effect, CUI2=drug
    'is_physiologic_effect_of_chemical_or_drug',
  ]);

  const neededCuis = new Set<string>();
  const pairs: Array<{ drugCui: string; effectCui: string; rela: string; sab: string }> = [];

  {
    const rl = readline.createInterface({ input: fs.createReadStream(MRREL, 'utf8') });
    let lines = 0;
    for await (const line of rl) {
      lines++;
      const f = line.split('|');
      const cui1 = f[0]; const cui2 = f[4];
      const rela = f[7]; const sab  = f[10];
      const suppress = f[14] || 'N';
      if (suppress === 'Y' || suppress === 'E' || !ADR_RELA.has(rela)) continue;
      if (sab === 'SCTSPA') continue; // skip Spanish duplicates

      let drugCui: string; let effectCui: string;

      // Determine direction based on RELA type
      if (REVERSED_RELA.has(rela)) {
        // CUI1=effect, CUI2=drug → swap
        drugCui = cui2; effectCui = cui1;
      } else {
        // CUI1=drug, CUI2=effect
        drugCui = cui1; effectCui = cui2;
      }

      // Filter: drug side MUST have drug semantic type
      if (!drugCuis.has(drugCui)) continue;

      // For SNOMED cause_of (very broad), also filter the effect side
      if (rela === 'cause_of' && !effectCuis.has(effectCui)) continue;

      neededCuis.add(drugCui); neededCuis.add(effectCui);
      const sourceLabel = sab === 'MED-RT' ? 'MED-RT' : sab === 'NCI' ? 'NCI' : 'SNOMEDCT';
      pairs.push({ drugCui, effectCui, rela, sab: sourceLabel });
      if (lines % 10_000_000 === 0) process.stdout.write(`\r   Lines: ${lines.toLocaleString()}  Pairs: ${pairs.length.toLocaleString()}`);
    }
    console.log(`\n   ✅ Pairs found: ${pairs.length.toLocaleString()}  Unique CUIs to resolve: ${neededCuis.size.toLocaleString()}`);
  }

  if (pairs.length === 0) {
    console.log('   ⚠️  No pairs found — check semantic type filter and MRREL content');
    c.release(); await pool.end(); return;
  }

  // ── Pass 2: Resolve NEEDED CUIs from MRCONSO ─────────────────────────────
  console.log('\n📂 Pass 2: Resolving CUI names + RxNorm/SNOMED codes from MRCONSO...');
  // cuiInfo: { rxcui?: string; snomedCode?: string; name: string }
  const cuiInfo = new Map<string, { rxcui?: string; snomedCode?: string; name: string }>();

  {
    const rl = readline.createInterface({ input: fs.createReadStream(MRCONSO, 'utf8') });
    let lines = 0;
    for await (const line of rl) {
      lines++;
      const f = line.split('|');
      const cui  = f[0];
      if (!neededCuis.has(cui)) continue; // skip CUIs we don't need

      const sab  = f[11];
      const tty  = f[12];
      const code = f[13];
      const name = f[14];
      const suppress = f[16] || 'N';
      if (suppress === 'Y' || suppress === 'E') continue;

      const existing = cuiInfo.get(cui) || { name: '' };

      // Prefer RXNORM IN/BN for drug RxCUI
      if (sab === 'RXNORM' && ['IN','MIN','BN'].includes(tty) && !existing.rxcui) {
        cuiInfo.set(cui, { ...existing, rxcui: code, name: name || existing.name });
      }
      // SNOMED PT for effect concept
      else if (sab === 'SNOMEDCT_US' && tty === 'PT' && !existing.snomedCode) {
        cuiInfo.set(cui, { ...existing, snomedCode: code, name: name || existing.name });
      }
      // Any English preferred name as fallback
      else if (f[1] === 'ENG' && f[6] === 'Y' && !existing.name) {
        cuiInfo.set(cui, { ...existing, name });
      } else if (!cuiInfo.has(cui)) {
        cuiInfo.set(cui, { name });
      }

      if (lines % 3_000_000 === 0) process.stdout.write(`\r   Lines: ${lines.toLocaleString()}  Resolved: ${cuiInfo.size.toLocaleString()}`);
    }
    console.log(`\n   ✅ CUIs resolved: ${cuiInfo.size.toLocaleString()}`);
  }

  // ── Pass 3: Write to DB ───────────────────────────────────────────────────
  console.log('\n📂 Pass 3: Writing ADR links to DB...');
  await c.query(`DELETE FROM cdss_drug_adverse_effect WHERE source IN ('MED-RT','NCI','SNOMEDCT')`);

  let batch: any[][] = [];
  let inserted = 0;

  for (const { drugCui, effectCui, rela, sab: sourceLabel } of pairs) {
    const drugData   = cuiInfo.get(drugCui);
    const effectData = cuiInfo.get(effectCui);

    const drugRxcui  = drugData?.rxcui   || `CUI:${drugCui}`;
    const drugName   = drugData?.name    || drugCui;
    const effectSnomed = effectData?.snomedCode || null;
    const effectName   = effectData?.name || effectCui;

    batch.push([drugRxcui, drugName, effectCui, effectSnomed, effectName, rela, sourceLabel]);
    inserted++;

    if (batch.length >= BATCH) {
      await flush(c, batch);
      batch = [];
      process.stdout.write(`\r   Written: ${inserted.toLocaleString()}`);
    }
  }
  if (batch.length) await flush(c, batch);
  console.log(`\n   ✅ ADR links written: ${inserted.toLocaleString()}`);

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n🔍 Verification:\n');
  const r1 = await c.query(`SELECT source, COUNT(*) as cnt FROM cdss_drug_adverse_effect GROUP BY source ORDER BY cnt DESC`);
  console.log('ADR by source:');
  for (const row of r1.rows) console.log(`  ${row.source}: ${parseInt(row.cnt).toLocaleString()}`);

  const r2 = await c.query(`
    SELECT drug_name, COUNT(DISTINCT effect_name) as effects
    FROM cdss_drug_adverse_effect WHERE drug_rxcui NOT LIKE 'CUI:%'
    GROUP BY drug_name ORDER BY effects DESC LIMIT 5
  `);
  console.log('\nTop RxNorm-resolved drugs by ADR count:');
  for (const row of r2.rows) console.log(`  ${row.drug_name}: ${row.effects} effects`);

  const r3 = await c.query(`
    SELECT COUNT(*) as resolved, 
           SUM(CASE WHEN drug_rxcui LIKE 'CUI:%' THEN 1 ELSE 0 END) as cui_only
    FROM cdss_drug_adverse_effect
  `);
  console.log(`\nRxNorm resolved: ${parseInt(r3.rows[0].resolved) - parseInt(r3.rows[0].cui_only)} / ${r3.rows[0].resolved} total`);

  c.release();
  console.log(`\n🎉 Phase C2 ADR import complete in ${((Date.now()-start)/1000).toFixed(1)}s`);
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); pool.end(); process.exit(1); });
